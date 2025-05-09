const dropArea = document.getElementById('drop-area');
const errorMessage = document.getElementById('error-message');
const fileInput = document.getElementById('fileElem');
const selectButton = document.querySelector('.button');
const removeButton = document.getElementById('removeButton');
const selectedFilesDiv = document.getElementById('selected-files');
const actionButtons = document.querySelector('.action-buttons');
const evaluateButton = document.getElementById('evaluate-button');

// Create elements for showing results
const resultContainer = document.createElement('div');
resultContainer.id = 'result-container';
resultContainer.className = 'result-container';
document.querySelector('.container').appendChild(resultContainer);

// Loading spinner
const loadingSpinner = document.createElement('div');
loadingSpinner.className = 'spinner';
loadingSpinner.innerHTML = '<div class="loader"></div><p>Evaluating papers with GPT-4o-mini...</p>';
document.querySelector('.container').appendChild(loadingSpinner);
loadingSpinner.style.display = 'none';

// Store selected files
let selectedFiles = [];

// All scenarios of dragging on the "border"
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, preventDefaults, false);
  document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// Highlight drop area when file is dragged over it
['dragenter', 'dragover'].forEach(eventName => {
  dropArea.addEventListener(eventName, () => dropArea.classList.add('highlight'), false);
});
['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, () => dropArea.classList.remove('highlight'), false);
});

// Handle file drop
dropArea.addEventListener('drop', handleDrop, false);
function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  handleFiles(files);
}

// Main: Process selected files
function handleFiles(files) {
  errorMessage.textContent = "";
  
  // Validate files are PDFs
  const validFiles = Array.from(files).filter(file => file.type === 'application/pdf');
  
  if (validFiles.length === 0) {
    errorMessage.textContent = "Please select PDF files only.";
    return;
  }
  
  if (files.length !== validFiles.length) {
    errorMessage.textContent = "Some files were rejected. Only PDF files are accepted.";
  }
  
  // Add only valid files, i.e pdf files and none other
  selectedFiles = [...selectedFiles, ...validFiles];
  updateFileList();
  
  // Show button if we got file
  if (selectedFiles.length > 0) {
    removeButton.style.display = "inline-block";
    selectedFilesDiv.style.display = "block";
    actionButtons.style.display = "flex";
    selectButton.textContent = "Add More Files";
  }
}

// Updates the file lists on which one are uploaded
function updateFileList() {
  selectedFilesDiv.innerHTML = "";
  
  if (selectedFiles.length === 0) {
    selectedFilesDiv.style.display = "none";
    actionButtons.style.display = "none";
    removeButton.style.display = "none";
    selectButton.textContent = "Select PDF Files";
    return;
  }
  
  const filesList = document.createElement('ul');
  selectedFiles.forEach((file, index) => {
    const fileItem = document.createElement('li');
    fileItem.innerHTML = `
      <span class="file-name">${file.name}</span>
      <span class="file-size">(${formatFileSize(file.size)})</span>
      <button class="remove-file-btn" data-index="${index}">✕</button>
    `;
    filesList.appendChild(fileItem);
  });
  
  selectedFilesDiv.appendChild(filesList);
  
  // remove button
  document.querySelectorAll('.remove-file-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      selectedFiles.splice(index, 1);
      updateFileList();
    });
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
}

// Remove all files
removeButton.addEventListener('click', function() {
  fileInput.value = "";
  selectedFiles = [];
  updateFileList();
  resultContainer.innerHTML = "";
  errorMessage.textContent = "";
});

// button click scenarios
evaluateButton.addEventListener('click', function() {
  if (selectedFiles.length === 0) {
    errorMessage.textContent = "Please select at least one PDF file.";
    return;
  }
  
  if (selectedFiles.length === 1) {
    // one file
    uploadSingleFile(selectedFiles[0]);
  } else {
    // multiple files - we'll now use the same endpoint with a modified approach
    uploadMultipleFiles(selectedFiles);
  }
});

function uploadSingleFile(file) {
  const formData = new FormData();
  formData.append('pdf', file);

  loadingSpinner.style.display = 'flex';
  
  fetch('/api/pdf/upload', {
    method: 'POST',
    body: formData
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.error || 'File upload failed');
      }
      
      return fetch('/api/pdf/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: data.fileId })
      });
    })
    .then(res => res.json())
    .then(evalResult => {
      loadingSpinner.style.display = 'none';
      
      if (!evalResult.success) {
        throw new Error(evalResult.error || 'Evaluation failed');
      }
      displayEvaluation(evalResult.evaluation);
    })
    .catch(err => {
      loadingSpinner.style.display = 'none';
      console.error(err);
      errorMessage.textContent = err.message || "An error occurred during processing";
    });
}

function uploadMultipleFiles(files) {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('pdfs', file);
  });

  loadingSpinner.style.display = 'flex';
  resultContainer.innerHTML = "";
  
  fetch('/api/pdf/upload-multiple', {
    method: 'POST',
    body: formData
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.error || 'File upload failed');
      }
      
      return fetch('/api/pdf/evaluate-compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileIds: data.fileIds,
          exportFormat: 'csv' // Request CSV export
        })
      });
    })
    .then(res => res.json())
    .then(evalResult => {
      loadingSpinner.style.display = 'none';
      
      if (!evalResult.success) {
        throw new Error(evalResult.error || 'Evaluation failed');
      }
      
      // Display the evaluation results
      displayMultipleEvaluations(evalResult.evaluation, evalResult.exportPath);
    })
    .catch(err => {
      loadingSpinner.style.display = 'none';
      console.error(err);
      errorMessage.textContent = err.message || "An error occurred during processing";
    });
}

function displayEvaluation(evaluation) {
  resultContainer.innerHTML = `
    <h2>Paper Evaluation Results</h2>
    <div class="evaluation-content">
      ${formatEvaluation(evaluation)}
    </div>
  `;
  resultContainer.scrollIntoView({ behavior: 'smooth' });
}

function displayMultipleEvaluations(evaluation, exportPath) {
  let downloadLink = '';
  
  if (exportPath) {
    downloadLink = `
      <div class="export-section">
        <p>A CSV file with structured findings has been created for easier analysis.</p>
        <a href="/api/pdf/download/${exportPath}" class="download-button" download>Download CSV Export</a>
      </div>
    `;
  }
  
  resultContainer.innerHTML = `
    <h2>Paper Evaluation Results</h2>
    ${downloadLink}
    <div class="evaluation-content">
      ${formatEvaluation(evaluation)}
    </div>
  `;
  resultContainer.scrollIntoView({ behavior: 'smooth' });
}

function formatEvaluation(text) {
  // Convert markdown-like text from OpenAI to HTML
  return text
    .replace(/\n\n/g, '</p><p>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^#+ (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^\d+\. (.*?)$/gm, '<li>$1</li>')
    .replace(/<li>(.*?)<\/li>/g, '<ol><li>$1</li></ol>')
    .replace(/<\/ol><ol>/g, '')
    .replace(/^- (.*?)$/gm, '<li>$1</li>')
    .replace(/<li>(.*?)<\/li>/g, '<ul><li>$1</li></ul>')
    .replace(/<\/ul><ul>/g, '');
}