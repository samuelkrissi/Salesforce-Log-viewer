
call api to salesforce from chrome extension without create connected app

1:28 PM
I'll help you call Salesforce APIs from a Chrome extension without creating a Connected App. Here are your main options:

1. Session ID Method (Easiest)
Use the user's existing Salesforce session when they're logged in:

Salesforce API Call - Session ID Method
Code 
2. Content Script Injection Method
Inject code into Salesforce pages to access their APIs directly:

Salesforce API - Content Script Method
Code 
3. User Access Token Method
Have users generate their own access token:

Salesforce API - User Token Method
Code 
Key Points:
Session ID Method (Recommended):

Works immediately if user is logged into Salesforce
No setup required
Most seamless user experience
Requires user to be logged in
Content Script Method:

Most reliable for accessing page context
Can leverage existing Salesforce session
Works with Lightning and Classic
User Token Method:

Requires users to generate security token
Works without browser session
More setup for users
Important Permissions for manifest.json:
json
{
  "permissions": ["cookies", "storage", "activeTab"],
  "host_permissions": [
    "https://*.salesforce.com/*",
    "https://*.force.com/*",
    "https://*.my.salesforce.com/*"
  ]
}
The Session ID method is usually the best choice for Chrome extensions since it leverages the user's existing login without requiring a Connected App or additional configuration.


background.js
23 lines

js


content.js
93 lines

js


manifest.json
32 lines

json


viewer.html
361 lines

html


viewer.js
436 lines

js

this is my code

1:34 PM
Looking at your code, I can see you've built a Salesforce Log Viewer extension. The main issue I notice is that you're trying to use the sid cookie as a Bearer token, but the sid cookie is not directly usable as an OAuth bearer token for Salesforce REST API calls.

Here are the problems and solutions:

Issues in Your Current Code:
The sid cookie cannot be used as a Bearer token - It's a session cookie for browser authentication, not an OAuth token
You're trying to fetch from viewer.js using ${instanceUrl}/services/data/... but this won't work with the sid cookie
The content script approach in your code won't work for API calls from the viewer page
Solution: Use Content Script to Make API Calls
Since the sid cookie works with credentials: 'include' in the content script context, you need to proxy all API calls through the content script. Here's the fixed code:

Fixed content.js
Code 
Fixed viewer.js
Code 
Key Changes Made:
1. Content Script (content.js)
Removed the complex session ID extraction logic
All API calls now use credentials: 'include' which automatically includes the sid cookie
Handles all API operations: fetch logs, fetch log body, delete single log, delete multiple logs
2. Background Script (background.js)
Stores the Salesforce tab ID when the extension is clicked
Acts as a message proxy between viewer and content script
Handles connection errors gracefully
3. Viewer Script (viewer.js)
All API calls now go through callSalesforceAPI() helper
This helper sends messages to background, which forwards to content script
Content script makes the actual API call with the session cookie
How It Works:
viewer.html (viewer.js)
    ↓ chrome.runtime.sendMessage
background.js (service worker)
    ↓ chrome.tabs.sendMessage
content.js (on Salesforce page)
    ↓ fetch with credentials: 'include'
Salesforce API (uses sid cookie automatically)
Usage:
Navigate to any Salesforce page
Click the extension icon
The viewer opens and can make API calls through the Salesforce tab
All authentication is handled automatically via the session cookie
This approach works because the content script runs in the context of the Salesforce page and can use the sid cookie that's already there. No OAuth or Connected App needed!

il faut corriger le background js aussi

1:44 PM
Vous avez raison ! Le background.js a un problème - il essaie de faire un await sur chrome.storage.local.set qui ne retourne pas de Promise. Voici la version corrigée :

Fixed background.js
Code ∙ Version 2 
Les corrections apportées au background.js :

Suppression du async/await - Utilisation de callbacks à la place car chrome.storage.local.set n'est pas une Promise dans Manifest V3
Meilleure gestion des erreurs :
Vérifie que le tab Salesforce existe encore avec chrome.tabs.get()
Gère le cas où le tab est fermé
Messages d'erreur plus explicites en français
Vérification de la réponse - S'assure que le content script répond bien avant de transmettre
Cas où l'extension n'est pas ouverte depuis Salesforce - Stocke isConnected: false pour que le viewer puisse afficher un message approprié
Le flux fonctionne maintenant correctement :

Clic sur l'extension depuis Salesforce → stocke le tab ID
Ouvre le viewer
Viewer demande des données → background transmet au content script
Content script fait l'appel API avec le cookie de session
Réponse remonte via background jusqu'au viewer


Want to be notified when Claude responds?





Claude is AI and can make mistakes. Please double-check responses.
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
  if (request.action === 'proxyToSalesforce') {
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
    
    return true; // Garde le canal ouvert pour la réponse asynchrone
  }
});
