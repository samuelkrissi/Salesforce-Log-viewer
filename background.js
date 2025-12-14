// background.js - Version corrigée

chrome.action.onClicked.addListener((tab) => {
  // Vérifie si on est sur une page Salesforce
  if (tab.url && (tab.url.includes('salesforce.com') || tab.url.includes('force.com'))) {
    // Stocke l'ID du tab Salesforce pour les appels API ultérieurs
    chrome.storage.local.set({
      salesforceTabId: tab.id,
      instanceUrl: new URL(tab.url).origin,
      isConnected: true
    }, () => {
      // Ouvre le viewer après avoir stocké les infos
      chrome.tabs.create({
        url: chrome.runtime.getURL('viewer.html')
      });
    });
  } else {
    // Pas sur Salesforce - ouvre quand même le viewer mais sans connexion
    chrome.storage.local.set({
      isConnected: false
    }, () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('viewer.html')
      });
    });
  }
});

// Proxy les messages du viewer vers le content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Important: vérifier l'action avant tout
  if (request.action !== 'proxyToSalesforce') {
    return false; // Pas notre message
  }
  
  // Récupère l'ID du tab Salesforce stocké
  chrome.storage.local.get(['salesforceTabId'], (result) => {
    if (!result.salesforceTabId) {
      sendResponse({ 
        success: false, 
        error: 'No Salesforce tab found. Please open the extension from a Salesforce page.' 
      });
      return;
    }
    
    // Vérifie que le tab existe encore
    chrome.tabs.get(result.salesforceTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({ 
          success: false, 
          error: 'Salesforce tab is closed. Please reopen the extension from a Salesforce page.' 
        });
        return;
      }
      
      // Transmet la requête au content script
      chrome.tabs.sendMessage(result.salesforceTabId, request.payload, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message to content script:', chrome.runtime.lastError);
          sendResponse({ 
            success: false, 
            error: 'Cannot connect to Salesforce tab. Error: ' + chrome.runtime.lastError.message
          });
        } else if (!response) {
          sendResponse({ 
            success: false, 
            error: 'No response from Salesforce tab. Please refresh the Salesforce page and try again.' 
          });
        } else {
          sendResponse(response);
        }
      });
    });
  });
  
  return true; // TOUJOURS garder le canal ouvert pour les réponses asynchrones
});