// background.js - Version corrigée avec injection manuelle du content script

chrome.action.onClicked.addListener(async (tab) => {
  // Vérifie si on est sur une page Salesforce
  if (tab.url && (tab.url.includes('salesforce.com') || tab.url.includes('force.com'))) {
    try {
      // Injecte le content script manuellement (au cas où il n'est pas chargé)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      
      console.log('Content script injected successfully');
      
      // Attends un peu que le script soit prêt
      setTimeout(() => {
        // Stocke l'ID du tab Salesforce
        chrome.storage.local.set({
          salesforceTabId: tab.id,
          instanceUrl: new URL(tab.url).origin,
          isConnected: true
        }, () => {
          // Ouvre le viewer
          chrome.tabs.create({
            url: chrome.runtime.getURL('viewer.html')
          });
        });
      }, 100);
      
    } catch (error) {
      console.error('Error injecting content script:', error);
      // Ouvre quand même le viewer avec un message d'erreur
      chrome.storage.local.set({
        isConnected: false,
        errorMessage: 'Could not inject content script: ' + error.message
      }, () => {
        chrome.tabs.create({
          url: chrome.runtime.getURL('viewer.html')
        });
      });
    }
  } else {
    // Pas sur Salesforce
    chrome.storage.local.set({
      isConnected: false,
      errorMessage: 'Please open this extension from a Salesforce page'
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
  
  console.log('Proxying message to Salesforce tab:', request.payload.action);
  
  // Récupère l'ID du tab Salesforce stocké
  chrome.storage.local.get(['salesforceTabId'], async (result) => {
    if (!result.salesforceTabId) {
      console.error('No Salesforce tab ID found');
      sendResponse({ 
        success: false, 
        error: 'No Salesforce tab found. Please open the extension from a Salesforce page.' 
      });
      return;
    }
    
    try {
      // Vérifie que le tab existe encore
      const tab = await chrome.tabs.get(result.salesforceTabId);
      
      if (!tab) {
        console.error('Tab not found');
        sendResponse({ 
          success: false, 
          error: 'Salesforce tab is closed. Please reopen the extension from a Salesforce page.' 
        });
        return;
      }
      
      console.log('Sending message to tab:', result.salesforceTabId);
      
      // Transmet la requête au content script
      chrome.tabs.sendMessage(result.salesforceTabId, request.payload, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message to content script:', chrome.runtime.lastError);
          
          // Si le content script ne répond pas, essaie de le réinjecter
          chrome.scripting.executeScript({
            target: { tabId: result.salesforceTabId },
            files: ['content.js']
          }).then(() => {
            console.log('Content script re-injected, retrying...');
            // Réessaie après réinjection
            setTimeout(() => {
              chrome.tabs.sendMessage(result.salesforceTabId, request.payload, (retryResponse) => {
                if (chrome.runtime.lastError) {
                  sendResponse({ 
                    success: false, 
                    error: 'Cannot connect to Salesforce tab after retry. Please refresh the page and try again.'
                  });
                } else {
                  sendResponse(retryResponse);
                }
              });
            }, 200);
          }).catch(error => {
            console.error('Failed to re-inject content script:', error);
            sendResponse({ 
              success: false, 
              error: 'Cannot connect to Salesforce tab. Please refresh the Salesforce page and try again.'
            });
          });
        } else if (!response) {
          console.error('No response from content script');
          sendResponse({ 
            success: false, 
            error: 'No response from Salesforce tab. Please refresh the Salesforce page and try again.' 
          });
        } else {
          console.log('Response received:', response);
          sendResponse(response);
        }
      });
      
    } catch (error) {
      console.error('Error in proxy:', error);
      sendResponse({ 
        success: false, 
        error: 'Salesforce tab error: ' + error.message
      });
    }
  });
  
  return true; // TOUJOURS garder le canal ouvert pour les réponses asynchrones
});