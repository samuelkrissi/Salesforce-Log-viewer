// content.js - Version corrigée pour éviter "port closed"

// Évite l'injection multiple
if (window.salesforceLogViewerInjected) {
  console.log('[SF Log Viewer] Already injected, skipping');
} else {
  window.salesforceLogViewerInjected = true;
  console.log('[SF Log Viewer] Content script loaded');
  
  // Stocke l'URL de l'instance au chargement
  chrome.storage.local.set({
    instanceUrl: window.location.origin,
    isConnected: true
  });
}

// Écoute les messages de manière synchrone
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Get session info
  if (request.action === 'getSessionInfo') {
    sendResponse({
      instanceUrl: window.location.origin,
      isConnected: true
    });
    return false; // Réponse synchrone
  }
  
  // Fetch logs
  if (request.action === 'fetchLogs') {
    (async () => {
      try {
        const response = await fetch('/services/data/v65.0/tooling/query/?q=SELECT+Id,LogUserId,LogUser.Name,Operation,Request,StartTime,Status,DurationMilliseconds+FROM+ApexLog+ORDER+BY+StartTime+DESC+LIMIT+200', {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        sendResponse({ success: true, data: data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Garde le canal ouvert pour async
  }
  
  // Fetch log body
  if (request.action === 'fetchLogBody') {
    (async () => {
      try {
        const response = await fetch(`/services/data/v65.0/tooling/sobjects/ApexLog/${request.logId}/Body`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        sendResponse({ success: true, data: text });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Garde le canal ouvert pour async
  }
  
  // Delete log
  if (request.action === 'deleteLog') {
    (async () => {
      try {
        const response = await fetch(`/services/data/v65.0/tooling/sobjects/ApexLog/${request.logId}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Garde le canal ouvert pour async
  }
  
  // Delete multiple logs
  if (request.action === 'deleteLogs') {
    (async () => {
      try {
        const logIds = request.logIds;
        const results = [];
        
        // Supprime les logs séquentiellement
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
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Garde le canal ouvert pour async
  }
  
  // Action inconnue
  return false;
});