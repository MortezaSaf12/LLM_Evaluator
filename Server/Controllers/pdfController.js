const fs = require('fs');
const path = require('path');
const uuid = require('uuid');
const OpenAIService = require('../Services/OpenAIService');
const openaiService = new OpenAIService();

// Temporary in-memory store for uploaded files
const uploadedFiles = {};

// Create exports directory if it doesn't exist
const ensureExportsDirectory = () => {
  const exportsDir = path.join(__dirname, '../exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }
  return exportsDir;
};

// Upload single PDF
exports.uploadPDF = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded", success: false });
    }

    const fileId = uuid.v4();
    uploadedFiles[fileId] = file;

    res.json({
      fileId,
      fileName: file.originalname,
      success: true
    });
  } catch (error) {
    console.error("Error handling file upload:", error);
    res.status(500).json({ error: "File upload failed", success: false });
  }
};

// Evaluate a single uploaded PDF
exports.evaluatePaper = async (req, res) => {
  try {
    const { fileId } = req.body;

    if (!fileId || !uploadedFiles[fileId]) {
      return res.status(400).json({ error: "Invalid file ID", success: false });
    }

    const file = uploadedFiles[fileId];
    const evaluationResult = await openaiService.evaluatePaper(file);

    if (!evaluationResult.success) {
      return res.status(500).json({
        error: evaluationResult.error,
        success: false
      });
    }

    // Clean up
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    delete uploadedFiles[fileId];

    res.json({
      evaluation: evaluationResult.evaluation,
      success: true
    });

  } catch (error) {
    console.error("Error evaluating paper:", error);
    res.status(500).json({ error: "Evaluation failed", success: false });
  }
};

// Upload multiple PDFs
exports.uploadMultiplePDFs = async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded", success: false });
    }

    const fileIds = [];

    for (const file of files) {
      const fileId = uuid.v4();
      uploadedFiles[fileId] = file;
      fileIds.push(fileId);
    }

    res.json({
      fileIds,
      fileCount: files.length,
      success: true
    });

  } catch (error) {
    console.error("Error handling multiple file uploads:", error);
    res.status(500).json({ error: "File upload failed", success: false });
  }
};

// Evaluate and compare multiple uploaded PDFs
exports.evaluateAndComparePapers = async (req, res) => {
  try {
    const { fileIds, exportFormat } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: "Invalid file IDs", success: false });
    }

    const files = [];
    for (const fileId of fileIds) {
      const file = uploadedFiles[fileId];
      if (!file) {
        return res.status(400).json({ error: `Invalid file ID: ${fileId}`, success: false });
      }
      files.push(file);
    }

    let result;
    
    // Always use the individual evaluation approach
    if (files.length === 1) {
      result = await openaiService.evaluatePaper(files[0]);
    } else {
      result = await openaiService.evaluateMultiplePapers(files);
    }

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        success: false
      });
    }

    // Generate CSV export if requested
    let exportPath = null;
    if (exportFormat === 'csv') {
      ensureExportsDirectory();
      
      // Parse all findings from the evaluation text
      const allFindings = openaiService.parseKeyFindings(result.evaluation);
      
      // Generate a CSV file with the findings
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      exportPath = openaiService.generateCSV(allFindings, `research_findings_${timestamp}`);
    }

    // Clean up all processed files
    for (const fileId of fileIds) {
      const file = uploadedFiles[fileId];
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      delete uploadedFiles[fileId];
    }

    res.json({
      evaluation: result.evaluation,
      exportPath: exportPath ? path.basename(exportPath) : null,
      success: true
    });

  } catch (error) {
    console.error("Error evaluating papers:", error);
    res.status(500).json({ error: "Evaluation failed", success: false });
  }
};

// New endpoint to download exported files
exports.downloadExport = async (req, res) => {
  try {
    const { filename } = req.params;
    const exportsDir = ensureExportsDirectory();
    const filePath = path.join(exportsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Export file not found", success: false });
    }
    
    res.download(filePath);
  } catch (error) {
    console.error("Error downloading export:", error);
    res.status(500).json({ error: "Download failed", success: false });
  }
};