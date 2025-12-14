(function() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      const sessionStorageToken = window.sessionStorage.getItem('inst');
      const cookieToken = getCookie('sid');
      const chosenToken = sessionStorageToken || cookieToken;
      console.log('[Salesforce Log Viewer] sessionStorage inst:', sessionStorageToken);
      console.log('[Salesforce Log Viewer] cookie sid:', cookieToken);
      console.log('[Salesforce Log Viewer] token envoyé:', chosenToken);
      window.postMessage({
        type: 'SF_ACCESS_TOKEN',
        sessionId: chosenToken,
        instanceUrl: window.location.origin
      }, '*');
      function getCookie(name) {
        const value = '; ' + document.cookie;
        const parts = value.split('; ' + name + '=');
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
      }
    })();
  `;
  document.documentElement.appendChild(script);
  script.remove();
})();

(function() {
  // Récupère le cookie sid directement depuis le content script
  function getCookie(name) {
    const value = '; ' + document.cookie;
    const parts = value.split('; ' + name + '=');
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }
  const sid = getCookie('sid');
  if (sid) {
    chrome.storage.local.set({
      accessToken: sid,
      instanceUrl: window.location.origin
    });
    console.log('[Salesforce Log Viewer] sid trouvé et stocké:', sid);
  } else {
    console.log('[Salesforce Log Viewer] sid non trouvé dans les cookies.');
  }
})();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data.type === 'SF_ACCESS_TOKEN') {
    chrome.storage.local.set({
      accessToken: event.data.sessionId,
      instanceUrl: event.data.instanceUrl
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getToken') {
    chrome.storage.local.get(['accessToken', 'instanceUrl'], (result) => {
      sendResponse(result);
    });
    return true;
  }
  // Ajoute la gestion de la récupération des logs côté content script
  if (request.action === 'fetchLogs') {
    fetch('/services/data/v65.0/tooling/query/?q=SELECT+Id,LogUserId,LogUser.Name,Operation,Request,StartTime,Status,DurationMilliseconds+FROM+ApexLog+ORDER+BY+StartTime+DESC+LIMIT+200', {
      credentials: 'include'
    })
      .then(response => {
        if (response.status === 401 || response.status === 403 || response.status === 302) {
          // Token non utilisable pour l'API REST
          sendResponse({success: false, error: 'token_invalid'});
          return null;
        }
        return response.json();
      })
      .then(data => {
        if (data && data.records) {
          sendResponse({success: true, logs: data.records});
        } else if (!data) {
          // Erreur déjà gérée
        } else {
          sendResponse({success: false});
        }
      })
      .catch(() => {
        sendResponse({success: false});
      });
    return true;
  }
});
