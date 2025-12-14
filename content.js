// content.js - Handles all API calls using the session cookie

// Store instance URL for later use
chrome.storage.local.set({
  instanceUrl: window.location.origin,
  isConnected: true
});

// Listen for API call requests from viewer
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Get session info
  if (request.action === 'getSessionInfo') {
    sendResponse({
      instanceUrl: window.location.origin,
      isConnected: true
    });
    return true;
  }
  
  // Fetch logs
  if (request.action === 'fetchLogs') {
    fetch('/services/data/v65.0/tooling/query/?q=SELECT+Id,LogUserId,LogUser.Name,Operation,Request,StartTime,Status,DurationMilliseconds+FROM+ApexLog+ORDER+BY+StartTime+DESC+LIMIT+200', {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  
  // Fetch log body
  if (request.action === 'fetchLogBody') {
    fetch(`/services/data/v65.0/tooling/sobjects/ApexLog/${request.logId}/Body`, {
      credentials: 'include'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then(text => {
        sendResponse({ success: true, data: text });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // Delete log
  if (request.action === 'deleteLog') {
    fetch(`/services/data/v65.0/tooling/sobjects/ApexLog/${request.logId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        sendResponse({ success: true });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // Delete multiple logs
  if (request.action === 'deleteLogs') {
    const logIds = request.logIds;
    const results = [];
    
    // Delete logs sequentially
    (async () => {
      for (const logId of logIds) {
        try {
          const response = await fetch(`/services/data/v65.0/tooling/sobjects/ApexLog/${logId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          results.push({
            logId: logId,
            success: response.ok,
            status: response.status
          });
        } catch (error) {
          results.push({
            logId: logId,
            success: false,
            error: error.message
          });
        }
      }
      
      sendResponse({ success: true, results: results });
    })();
    
    return true;
  }
});