// Excel Import Related Functions
function openImportModal() {
    document.getElementById('import-modal').classList.remove('hidden');
    document.getElementById('import-status').classList.add('hidden');
    document.getElementById('file-name').textContent = '';
    document.getElementById('excel-file').value = '';
    document.getElementById('table-name').value = ''; // Set default table name
}

function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
}

// Display selected filename
document.getElementById('excel-file').addEventListener('change', function(e) {
    const fileName = e.target.files[0] ? e.target.files[0].name : '';
    document.getElementById('file-name').textContent = fileName ? `Selected file: ${fileName}` : '';
});

// Handle form submission
document.getElementById('import-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('excel-file');
    if (!fileInput.files.length) {
        showAlert('Please select a file to upload.', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        showAlert('Please select a valid Excel file (.xlsx or .xls).', 'error');
        return;
    }
    
    // Validate table name
    const tableNameInput = document.getElementById('table-name');
    const tableName = tableNameInput.value.trim();
    
    if (!tableName) {
        showAlert('Please enter a table name.', 'error');
        tableNameInput.focus();
        return;
    }
    
    // Simple validation for table name (alphanumeric and underscores only)
    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        showAlert('Table name can only contain letters, numbers, and underscores.', 'error');
        tableNameInput.focus();
        return;
    }
    
    // Show progress UI
    const importStatus = document.getElementById('import-status');
    const importProgress = document.getElementById('import-progress');
    const importMessage = document.getElementById('import-message');
    
    importStatus.classList.remove('hidden');
    importProgress.style.width = '0%';
    importMessage.textContent = 'Processing your file...';
    
    // Create FormData and send request
    const formData = new FormData();
    formData.append('excel_file', file);
    formData.append('table_name', tableName);
    
    // Disable the upload button
    document.getElementById('upload-button').disabled = true;
    
    // Simulate progress (since actual progress can't be tracked easily)
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 5;
        if (progress > 90) {
            clearInterval(progressInterval);
        }
        importProgress.style.width = `${progress}%`;
    }, 300);
    
    // Send the file to the server
    fetch('/import_excel/', {
        method: 'POST',
        body: formData,
    })
    .then(response => {
        clearInterval(progressInterval);
        return response.json();
    })
    .then(data => {
        // Update UI based on the response
        if (data.success) {
            importProgress.style.width = '100%';
            importMessage.textContent = 'Import successful!';
            
            // Close modal after a short delay
            setTimeout(() => {
                closeImportModal();
                showAlert(`Successfully imported data. ${data.rows_added} rows added to the '${data.table_name}' table.`, 'success');
                
                // Refresh the tables list
                loadTables();
            }, 1500);
        } else {
            importProgress.style.width = '100%';
            importProgress.classList.remove('bg-indigo-600');
            importProgress.classList.add('bg-red-600');
            importMessage.textContent = data.error || 'Import failed. Please check your file.';
            
            // Re-enable the upload button
            document.getElementById('upload-button').disabled = false;
        }
    })
    .catch(error => {
        clearInterval(progressInterval);
        importProgress.style.width = '100%';
        importProgress.classList.remove('bg-indigo-600');
        importProgress.classList.add('bg-red-600');
        importMessage.textContent = 'An error occurred during import.';
        console.error('Import error:', error);
        
        // Re-enable the upload button
        document.getElementById('upload-button').disabled = false;
    });
});

// Function to show alerts (assuming this exists in your current JS)
function showAlert(message, type = 'info') {
    const alertsContainer = document.getElementById('alerts-container');
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} mb-2`;
    alert.innerHTML = `
        <div class="flex items-center">
            <div class="alert-content">${message}</div>
            <button class="alert-close ml-auto" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
    `;
    
    alertsContainer.appendChild(alert);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (alert.parentElement) {
            alert.remove();
        }
    }, 5000);
}

// Add drag and drop support
const dropZone = document.querySelector('.border-dashed');
const fileInput = document.getElementById('excel-file');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
});

function highlight() {
    dropZone.classList.add('border-indigo-500');
    dropZone.classList.remove('border-gray-300');
}

function unhighlight() {
    dropZone.classList.add('border-gray-300');
    dropZone.classList.remove('border-indigo-500');
}

dropZone.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length) {
        fileInput.files = files;
        const event = new Event('change');
        fileInput.dispatchEvent(event);
    }
}