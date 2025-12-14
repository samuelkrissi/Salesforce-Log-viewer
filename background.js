chrome.action.onClicked.addListener((tab) => {
  // Vérifie si on est sur une page Salesforce
  if (tab.url && (tab.url.includes('salesforce.com') || tab.url.includes('force.com'))) {
    // Injecte le content script pour récupérer le token
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    }, () => {
      // Attend un peu que le token soit stocké, puis ouvre le viewer
      setTimeout(() => {
        chrome.tabs.create({
          url: chrome.runtime.getURL('viewer.html')
        });
      }, 500);
    });
  } else {
    // Si pas sur Salesforce, ouvre juste le viewer
    chrome.tabs.create({
      url: chrome.runtime.getURL('viewer.html')
    });
  }
});

// Listener pour récupérer le cookie sid du domaine lightning.force.com
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getLightningSid') {
    alert('background.js received getLightningSid message');
    // Utilise le bon sous-domaine pour le cookie sid
    let lightningUrl = 'https://*.lightning.force.com/*';
    if (sender && sender.tab && sender.tab.url) {
      try {
        const urlObj = new URL(sender.tab.url);
        if (urlObj.hostname.endsWith('.lightning.force.com')) {
          lightningUrl = urlObj.origin;
        }
      } catch {}
    }
    chrome.cookies.get({
      url: lightningUrl,
      name: 'sid'
    }, (cookie) => {
      if (cookie && cookie.value) {
        sendResponse({ sid: cookie.value });
      } else {
        sendResponse({ sid: null });
      }
    });
    return true; // async response
  }
});
