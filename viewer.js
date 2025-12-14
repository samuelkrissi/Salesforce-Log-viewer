let allLogs = [];
let selectedLogs = new Set();
let currentLogId = null;
let currentLogContent = null;
let isConnected = false;

// Check connection on load
chrome.storage.local.get(['isConnected', 'instanceUrl', 'errorMessage'], (result) => {
  isConnected = result.isConnected || false;
  
  if (result.errorMessage) {
    showStatus(result.errorMessage, 'error');
  } else if (!isConnected) {
    showStatus('Please open this extension from a Salesforce page', 'error');
  } else {
    showStatus(`Connected to ${result.instanceUrl}`, 'success');
    // Test la connexion au content script
    testConnection();
  }
});

// Teste la connexion avec le content script
async function testConnection() {
  try {
    console.log('Testing connection to Salesforce tab...');
    const response = await callSalesforceAPI('getSessionInfo');
    console.log('Connection test successful:', response);
  } catch (error) {
    console.error('Connection test failed:', error);
    showStatus(`Connection error: ${error.message}`, 'error');
  }
}

// Helper function to call Salesforce API through content script
async function callSalesforceAPI(action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'proxyToSalesforce',
      payload: { action, ...payload }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response.success) {
        reject(new Error(response.error || 'Unknown error'));
      } else {
        resolve(response);
      }
    });
  });
}

// Event listeners
document.getElementById('fetchLogs').addEventListener('click', fetchLogs);
document.getElementById('userFilter').addEventListener('change', filterLogs);
document.getElementById('selectAll').addEventListener('click', selectAll);
document.getElementById('deselectAll').addEventListener('click', deselectAll);
document.getElementById('deleteSelected').addEventListener('click', deleteSelected);
document.getElementById('selectAllCheckbox').addEventListener('change', toggleAll);

// Modal controls
const modal = document.getElementById('logModal');
const closeBtn = document.querySelector('.close');
const closeModalBtn = document.getElementById('closeModal');
const downloadFromModalBtn = document.getElementById('downloadFromModal');

closeBtn.onclick = () => modal.style.display = 'none';
closeModalBtn.onclick = () => modal.style.display = 'none';
downloadFromModalBtn.onclick = () => downloadLog(currentLogId, currentLogContent);

window.onclick = (event) => {
  if (event.target === modal) {
    modal.style.display = 'none';
  }
};

async function fetchLogs() {
  const logBody = document.getElementById('logBody');
  logBody.innerHTML = '<tr><td colspan="7" class="loading"><div class="spinner"></div>Loading logs...</td></tr>';

  try {
    const response = await callSalesforceAPI('fetchLogs');
    allLogs = response.data.records;
    updateUserFilter();
    displayLogs(allLogs);
    updateStats();
    showStatus(`${allLogs.length} logs retrieved successfully`, 'success');
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
    logBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 40px;">Error: ${error.message}</td></tr>`;
  }
}

function updateUserFilter() {
  const userFilter = document.getElementById('userFilter');
  const users = [...new Set(allLogs.map(log => log.LogUser?.Name).filter(Boolean))].sort();
  
  userFilter.innerHTML = '<option value="">All Users</option>' +
    users.map(user => `<option value="${user}">${user}</option>`).join('');
}

function filterLogs() {
  const selectedUser = document.getElementById('userFilter').value;
  const filteredLogs = selectedUser 
    ? allLogs.filter(log => log.LogUser?.Name === selectedUser)
    : allLogs;
  
  displayLogs(filteredLogs);
  updateStats(filteredLogs.length);
}

function displayLogs(logs) {
  const logBody = document.getElementById('logBody');
  selectedLogs.clear();
  updateSelectedCount();
  
  if (logs.length === 0) {
    logBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No logs found</td></tr>';
    return;
  }
  
  logBody.innerHTML = logs.map(log => `
    <tr data-log-id="${log.Id}">
      <td class="checkbox-cell">
        <input type="checkbox" class="log-checkbox" data-log-id="${log.Id}">
      </td>
      <td><strong>${log.LogUser?.Name || 'N/A'}</strong></td>
      <td><code>${log.Id}</code></td>
      <td>${log.Operation || log.Request || 'N/A'}</td>
      <td>${formatDateTime(log.StartTime)}</td>
      <td>${log.Status || 'N/A'}</td>
      <td class="actions-cell">
        <div class="action-buttons">
          <button class="small" onclick="previewLog('${log.Id}')">👁️ Preview</button>
          <button class="small success" onclick="downloadLog('${log.Id}')">📥 Download</button>
          <button class="small danger" onclick="deleteSingleLog('${log.Id}')">🗑️ Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
  
  document.querySelectorAll('.log-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleCheckboxChange);
  });
}

async function previewLog(logId) {
  currentLogId = logId;
  modal.style.display = 'block';
  document.getElementById('logContent').textContent = 'Loading log content...';

  try {
    const response = await callSalesforceAPI('fetchLogBody', { logId });
    currentLogContent = response.data;
    
    const logInfo = allLogs.find(log => log.Id === logId);
    document.getElementById('logDetails').innerHTML = `
      <div style="margin-bottom: 15px; padding: 15px; background: #f8f9fb; border-radius: 4px;">
        <p><strong>User:</strong> ${logInfo?.LogUser?.Name || 'N/A'}</p>
        <p><strong>Operation:</strong> ${logInfo?.Operation || logInfo?.Request || 'N/A'}</p>
        <p><strong>Date:</strong> ${formatDateTime(logInfo?.StartTime)}</p>
        <p><strong>Status:</strong> ${logInfo?.Status || 'N/A'}</p>
      </div>
    `;
    document.getElementById('logContent').textContent = currentLogContent;
  } catch (error) {
    document.getElementById('logContent').textContent = `Error loading log: ${error.message}`;
  }
}

async function downloadLog(logId, content = null) {
  if (!content) {
    try {
      const response = await callSalesforceAPI('fetchLogBody', { logId });
      performDownload(logId, response.data);
    } catch (error) {
      showStatus(`Error downloading log: ${error.message}`, 'error');
    }
  } else {
    performDownload(logId, content);
  }
}

function performDownload(logId, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `apex-log-${logId}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function deleteSingleLog(logId) {
  if (!confirm('Are you sure you want to delete this log?')) {
    return;
  }

  try {
    await callSalesforceAPI('deleteLog', { logId });
    allLogs = allLogs.filter(log => log.Id !== logId);
    document.querySelector(`tr[data-log-id="${logId}"]`)?.remove();
    updateStats();
    showStatus('Log deleted successfully', 'success');
  } catch (error) {
    showStatus(`Error deleting log: ${error.message}`, 'error');
  }
}

async function deleteSelected() {
  if (selectedLogs.size === 0) return;
  
  if (!confirm(`Are you sure you want to delete ${selectedLogs.size} log(s)?`)) {
    return;
  }
  
  const deleteBtn = document.getElementById('deleteSelected');
  deleteBtn.disabled = true;
  deleteBtn.textContent = '⏳ Deleting...';
  
  try {
    const response = await callSalesforceAPI('deleteLogs', { 
      logIds: Array.from(selectedLogs) 
    });
    
    const results = response.results;
    const deleted = results.filter(r => r.success).length;
    const errors = results.filter(r => !r.success).length;
    
    // Remove deleted logs from display
    results.forEach(result => {
      if (result.success) {
        allLogs = allLogs.filter(log => log.Id !== result.logId);
        document.querySelector(`tr[data-log-id="${result.logId}"]`)?.remove();
      }
    });
    
    selectedLogs.clear();
    updateSelectedCount();
    updateStats();
    
    if (errors > 0) {
      showStatus(`${deleted} log(s) deleted, ${errors} error(s)`, 'error');
    } else {
      showStatus(`${deleted} log(s) deleted successfully`, 'success');
    }
  } catch (error) {
    showStatus(`Error deleting logs: ${error.message}`, 'error');
  } finally {
    deleteBtn.disabled = false;
    deleteBtn.textContent = '🗑️ Delete Selected';
  }
}

function handleCheckboxChange(e) {
  const logId = e.target.dataset.logId;
  if (e.target.checked) {
    selectedLogs.add(logId);
  } else {
    selectedLogs.delete(logId);
  }
  updateSelectedCount();
}

function selectAll() {
  document.querySelectorAll('.log-checkbox').forEach(cb => {
    cb.checked = true;
    selectedLogs.add(cb.dataset.logId);
  });
  updateSelectedCount();
}

function deselectAll() {
  document.querySelectorAll('.log-checkbox').forEach(cb => {
    cb.checked = false;
  });
  selectedLogs.clear();
  updateSelectedCount();
}

function toggleAll(e) {
  if (e.target.checked) {
    selectAll();
  } else {
    deselectAll();
  }
}

function updateSelectedCount() {
  const count = selectedLogs.size;
  const countSpan = document.getElementById('selectedCount');
  const deleteBtn = document.getElementById('deleteSelected');
  
  if (count > 0) {
    countSpan.textContent = `${count} selected`;
    countSpan.style.display = 'block';
    deleteBtn.disabled = false;
  } else {
    countSpan.style.display = 'none';
    deleteBtn.disabled = true;
  }
}

function updateStats(displayedCount = null) {
  document.getElementById('totalLogs').textContent = allLogs.length;
  document.getElementById('displayedLogs').textContent = displayedCount !== null ? displayedCount : allLogs.length;
  
  const users = new Set(allLogs.map(log => log.LogUser?.Name).filter(Boolean));
  document.getElementById('totalUsers').textContent = users.size;
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = type;
  statusDiv.style.display = 'block';
  
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 5000);
}

// Make functions available globally for onclick handlers
window.previewLog = previewLog;
window.downloadLog = downloadLog;
window.deleteSingleLog = deleteSingleLog;