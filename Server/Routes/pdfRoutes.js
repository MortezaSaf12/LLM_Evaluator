const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const pdfController = require('../Controllers/pdfController');

// single file
router.post('/upload', upload.single('pdf'), pdfController.uploadPDF);
router.post('/evaluate', pdfController.evaluatePaper);

// multiple files
router.post('/upload-multiple', upload.array('pdfs', 5), pdfController.uploadMultiplePDFs);
router.post('/evaluate-compare', pdfController.evaluateAndComparePapers);

// export downloads
router.get('/download/:filename', pdfController.downloadExport);

module.exports = router;