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
