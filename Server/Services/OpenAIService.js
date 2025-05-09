const fs = require('fs');
const path = require('path');
const OpenAI = require("openai");
const pdf = require('pdf-parse');

class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.SECRET_OPENAI_KEY,
    });
    this.model = "gpt-4o-mini";
    this.guidelinesPath = path.join(__dirname, '../guidelines.txt');
    this.guidelines = fs.readFileSync(this.guidelinesPath, 'utf8');
  }

  async evaluatePaper(file) {
    try {
      // Extract text content from the file
      const fileContent = await this.extractFileContent(file);
      
      const prompt = `
You are an academic research paper evaluator with expertise in scientific methodology and evidence quality. Your task is to extract and evaluate key findings from the attached research paper using the evaluation framework detailed below.

## EVIDENCE QUALITY ASSESSMENT GUIDELINES
${this.guidelines}

## EVALUATION INSTRUCTIONS
1. Extract 3-5 main key findings from the research paper.
2. For each key finding, provide the following structure:

### Key Finding #[number]
- **Criteria**: What this finding is about (e.g., a specific intervention, observation, or relationship)
- **Value**: The specific result or outcome that was discovered
- **Evidence Level**: Assign an evidence level (1-6) based on the guidelines and justify this classification
- **Source**: The title of the paper where this finding is from
- **Methodology Quality**: Brief assessment of how the finding was determined (sample size, controls, etc.)
- **Importance**: Why this finding matters in the context of the research field

### Format Example (Do not use tables):
Key Finding #1
- Criteria: [Subject of finding]
- Value: [Specific result/outcome]
- Evidence Level: [1-6] - [Brief justification]
- Source: [Paper title]
- Methodology Quality: [Brief assessment]
- Importance: [Why this matters]

Apply the appropriate evidence level classification from the guidelines.txt for each finding to determine it

## PAPER CONTENT:
${fileContent}
`;
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: "You are an academic research paper evaluator focused on extracting and evaluating key findings according to evidence quality guidelines."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });
      
      return {
        evaluation: response.choices[0].message.content,
        success: true
      };
    } catch (error) {
      console.error("OpenAI evaluation error:", error);
      return {
        success: false,
        error: error.message || "Error evaluating paper with OpenAI"
      };
    }
  }

  async extractFileContent(file) {
    try {
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      // Handle PDF files
      if (fileExtension === '.pdf') {
        console.log(`Processing PDF file: ${file.originalname}`);
        const dataBuffer = fs.readFileSync(file.path);
        const pdfData = await pdf(dataBuffer);
        return pdfData.text;
      }
     //handle other files
      else if (['.txt', '.md', '.rtf'].includes(fileExtension)) {
        console.log(`Processing text file: ${file.originalname}`);
        return fs.readFileSync(file.path, 'utf8');
      }
  
      else {
        console.log(`Unsupported file type: ${fileExtension}, attempting to process as text`);
        return fs.readFileSync(file.path, 'utf8');
      }
    } catch (error) {
      console.error(`Error extracting content from file: ${file.originalname}`, error);
      throw new Error(`Failed to extract content from file: ${file.originalname}`);
    }
  }

  // Evaluate multiple papers individually and create a structured comparison
  async evaluateMultiplePapers(files) {
    try {
      // Process each file individually
      const evaluations = await Promise.all(files.map(async (file) => {
        const result = await this.evaluatePaper(file);
        if (result.success) {
          return {
            filename: file.originalname,
            evaluation: result.evaluation
          };
        }
        return null;
      }));

      // Filter out any failed evaluations
      const validEvaluations = evaluations.filter(eval => eval !== null);
      
      // Format the results with clear separation between papers
      let formattedOutput = `# Research Paper Evaluation Results\n\n`;
      
      validEvaluations.forEach((evaluation, index) => {
        formattedOutput += `## Paper ${index + 1}: ${evaluation.filename}\n\n`;
        formattedOutput += `${evaluation.evaluation}\n\n`;
        
        if (index < validEvaluations.length - 1) {
          formattedOutput += `---\n\n`;
        }
      });
      
      // Add a summary section if there are multiple papers
      if (validEvaluations.length > 1) {
        formattedOutput += `## Comparative Summary\n\n`;
        formattedOutput += `The above evaluation presents individual assessments of ${validEvaluations.length} research papers. `;
        formattedOutput += `Each paper has been evaluated based on the same evidence quality framework, extracting 3-5 key findings from each. `;
        formattedOutput += `To compare papers, consider the evidence levels assigned to each key finding and the methodology quality assessments.\n\n`;
        formattedOutput += `For a more detailed comparison, you may want to organize the findings by evidence level across papers or by similar research topics.\n`;
      }
      
      return {
        evaluation: formattedOutput,
        success: true
      };
    } catch (error) {
      console.error("Error evaluating multiple papers:", error);
      return {
        success: false,
        error: error.message || "Error evaluating papers"
      };
    }
  }

  // Method to extract structured data from LLM output for exporting
  parseKeyFindings(evaluation) {
    const keyFindingRegex = /Key Finding #\d+\s*(?:-|\n)([\s\S]*?)(?=Key Finding #\d+|$)/g;
    const criteriaRegex = /\*\*Criteria\*\*:\s*(.*?)(?=\n-|\n\n)/s;
    const valueRegex = /\*\*Value\*\*:\s*(.*?)(?=\n-|\n\n)/s;
    const evidenceLevelRegex = /\*\*Evidence Level\*\*:\s*(.*?)(?=\n-|\n\n)/s;
    const sourceRegex = /\*\*Source\*\*:\s*(.*?)(?=\n-|\n\n)/s;
    const methodologyRegex = /\*\*Methodology Quality\*\*:\s*(.*?)(?=\n-|\n\n)/s;
    const importanceRegex = /\*\*Importance\*\*:\s*(.*?)(?=\n\n|\n$|$)/s;
    
    const findings = [];
    let match;
    
    while ((match = keyFindingRegex.exec(evaluation)) !== null) {
      const findingText = match[0];
      
      const criteria = criteriaRegex.exec(findingText)?.[1]?.trim() || '';
      const value = valueRegex.exec(findingText)?.[1]?.trim() || '';
      
      // Extract just the numeric level from evidence level text
      const fullEvidenceLevel = evidenceLevelRegex.exec(findingText)?.[1]?.trim() || '';
      const levelMatch = fullEvidenceLevel.match(/\d+/);
      const evidenceLevel = levelMatch ? levelMatch[0] : '';
      const evidenceJustification = fullEvidenceLevel.replace(/^\d+\s*-\s*/, '');
      
      const source = sourceRegex.exec(findingText)?.[1]?.trim() || '';
      const methodology = methodologyRegex.exec(findingText)?.[1]?.trim() || '';
      const importance = importanceRegex.exec(findingText)?.[1]?.trim() || '';
      
      findings.push({
        criteria,
        value,
        evidenceLevel,
        evidenceJustification,
        source,
        methodology,
        importance
      });
    }
    
    return findings;
  }
  
  // Method to generate a CSV from parsed findings
  generateCSV(findings, filename) {
    const csvHeader = 'Source,Criteria,Value,Evidence Level,Evidence Justification,Methodology Quality,Importance\n';
    const csvRows = findings.map(finding => {
      return [
        this.escapeCSV(finding.source),
        this.escapeCSV(finding.criteria),
        this.escapeCSV(finding.value),
        this.escapeCSV(finding.evidenceLevel),
        this.escapeCSV(finding.evidenceJustification),
        this.escapeCSV(finding.methodology),
        this.escapeCSV(finding.importance)
      ].join(',');
    });
    
    const csvContent = csvHeader + csvRows.join('\n');
    const outputPath = path.join(__dirname, '../exports', `${filename}.csv`);
    
    // Ensure the exports directory exists
    const exportDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, csvContent);
    return outputPath;
  }
  
  // Helper to escape CSV fields
  escapeCSV(field) {
    if (!field) return '""';
    // Escape quotes and wrap in quotes
    return `"${field.replace(/"/g, '""')}"`;
  }
}

module.exports = OpenAIService;