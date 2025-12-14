// content.js - Version corrigée avec détection automatique du token

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

// Fonction pour extraire le session ID de la page
function getSessionId() {
  // Méthode 1: Depuis window (Lightning)
  try {
    if (window.opener && window.opener.__SFDX_SESSION_ID) {
      return window.opener.__SFDX_SESSION_ID;
    }
  } catch (e) {}
  
  // Méthode 2: Depuis les cookies (le plus fiable)
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'sid') {
      return value;
    }
  }
  
  // Méthode 3: Depuis sessionStorage
  try {
    const inst = sessionStorage.getItem('inst');
    if (inst) return inst;
  } catch (e) {}
  
  return null;
}

// Écoute les messages de manière synchrone
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Get session info
  if (request.action === 'getSessionInfo') {
    const sessionId = getSessionId();
    sendResponse({
      instanceUrl: window.location.origin,
      isConnected: true,
      hasSession: !!sessionId
    });
    return false; // Réponse synchrone
  }
  
  // Fetch logs
  if (request.action === 'fetchLogs') {
    (async () => {
      try {
        const sessionId = getSessionId();
        if (!sessionId) {
          throw new Error('Session ID not found. Please make sure you are logged into Salesforce.');
        }
        
        const response = await fetch(`${window.location.origin}/services/data/v65.0/tooling/query/?q=SELECT+Id,LogUserId,LogUser.Name,Operation,Request,StartTime,Status,DurationMilliseconds+FROM+ApexLog+ORDER+BY+StartTime+DESC+LIMIT+200`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const text = await response.text();
          console.error('[SF Log Viewer] API Error Response:', text);
          throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          console.error('[SF Log Viewer] Non-JSON response:', text.substring(0, 200));
          throw new Error('API returned HTML instead of JSON. Session may be invalid.');
        }
        
        const data = await response.json();
        console.log('[SF Log Viewer] Logs fetched:', data.records?.length || 0);
        sendResponse({ success: true, data: data });
      } catch (error) {
        console.error('[SF Log Viewer] Error fetching logs:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Garde le canal ouvert pour async
  }
  
  // Fetch log body
  if (request.action === 'fetchLogBody') {
    (async () => {
      try {
        const sessionId = getSessionId();
        if (!sessionId) {
          throw new Error('Session ID not found');
        }
        
        const response = await fetch(`${window.location.origin}/services/data/v65.0/tooling/sobjects/ApexLog/${request.logId}/Body`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${sessionId}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const text = await response.text();
        console.log('[SF Log Viewer] Log body fetched, length:', text.length);
        sendResponse({ success: true, data: text });
      } catch (error) {
        console.error('[SF Log Viewer] Error fetching log body:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Garde le canal ouvert pour async
  }
  
  // Delete log
  if (request.action === 'deleteLog') {
    (async () => {
      try {
        const sessionId = getSessionId();
        if (!sessionId) {
          throw new Error('Session ID not found');
        }
        
        const response = await fetch(`${window.location.origin}/services/data/v65.0/tooling/sobjects/ApexLog/${request.logId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        console.log('[SF Log Viewer] Log deleted:', request.logId);
        sendResponse({ success: true });
      } catch (error) {
        console.error('[SF Log Viewer] Error deleting log:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Garde le canal ouvert pour async
  }
  
  // Delete multiple logs
  if (request.action === 'deleteLogs') {
    (async () => {
      try {
        const sessionId = getSessionId();
        if (!sessionId) {
          throw new Error('Session ID not found');
        }
        
        const logIds = request.logIds;
        const results = [];
        
        console.log('[SF Log Viewer] Deleting', logIds.length, 'logs');
        
        // Supprime les logs séquentiellement
        for (const logId of logIds) {
          try {
            const response = await fetch(`${window.location.origin}/services/data/v65.0/tooling/sobjects/ApexLog/${logId}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${sessionId}`,
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
        
        const successCount = results.filter(r => r.success).length;
        console.log('[SF Log Viewer] Deleted', successCount, 'of', logIds.length, 'logs');
        sendResponse({ success: true, results: results });
      } catch (error) {
        console.error('[SF Log Viewer] Error deleting logs:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Garde le canal ouvert pour async
  }
  
  // Action inconnue
  return false;
});