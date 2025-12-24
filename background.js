// আপনার নতুন ক্লায়েন্ট আইডিটি এখানে বসান (manifest এর সাথে যেন মিল থাকে)
const CLIENT_ID = "222409534448-5q3ktjkc9g0e3lojt2ancaruptom15mu.apps.googleusercontent.com";
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

// ১. মেনু তৈরি
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "saveToMyMind", title: "Save to My Capture", contexts: ["page", "selection", "link", "image"] });
    chrome.contextMenus.create({ id: "saveScreenshot", title: "📸 Screenshot", contexts: ["all"] });
  });
});

// ২. রাইট ক্লিক হ্যান্ডেলার
chrome.contextMenus.onClicked.addListener((info, tab) => {
  chrome.storage.local.get(['saveMode'], (result) => {
    const mode = result.saveMode || 'drive';
    if (info.menuItemId === "saveScreenshot") {
      takeScreenshot(tab.title, null, mode);
    } else if (info.menuItemId === "saveToMyMind") {
      if (info.mediaType === "image") handleImageUpload(info.srcUrl, tab.title, mode);
      else handleTextUpload(info, tab, mode);
    }
  });
});

// ৩. মেসেজ হ্যান্ডেলার
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveScreenshot") takeScreenshot(request.title, null, request.saveMode, sendResponse);
  else if (request.action === "saveFullPage") saveFullPageMHTML(request.tabId, request.title, request.saveMode, sendResponse);
  else if (request.action === "processCrop") {
    chrome.storage.local.get(['saveMode'], (result) => {
       takeScreenshot(request.title, request.cropData, result.saveMode || 'drive');
    });
  }
  return true;
});

// ---------------- Functions ----------------

function takeScreenshot(pageTitle, cropData = null, mode = 'drive', sendResponse = null) {
  if (!cropData && !sendResponse) showNotification("Capturing...", "Taking screenshot...");
  chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) { handleError(sendResponse, "Capture failed"); return; }
    if (cropData) cropImage(dataUrl, cropData, pageTitle, mode);
    else processFile(generateFileName("Screenshot", pageTitle, "png"), "image/png", dataUrl, "Screenshots", mode, sendResponse, true);
  });
}

function handleTextUpload(info, tab, mode) {
    let content = info.selectionText ? "Selected: " + info.selectionText + "\nURL: " + tab.url : "Page: " + tab.url;
    processFile(generateFileName("Note", tab.title, "txt"), "text/plain", content, "Notes", mode);
}

function handleImageUpload(imageUrl, pageTitle, mode) {
    if (mode === 'local') downloadLocal(generateFileName("Image", pageTitle, "jpg"), imageUrl, "Images");
    else {
      showNotification("Downloading...", "Fetching image.");
      fetch(imageUrl).then(r => r.blob()).then(blob => {
          processFile(generateFileName("Image", pageTitle, blob.type.split('/')[1]||"jpg"), blob.type, blob, "Images", mode);
      }).catch(() => showNotification("Error", "Image failed."));
    }
}

async function cropImage(dataUrl, area, title, mode) {
  showNotification("Processing...", "Cropping...");
  try {
    const response = await fetch(dataUrl), blob = await response.blob(), bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(area.width * area.devicePixelRatio, area.height * area.devicePixelRatio);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, area.x * area.devicePixelRatio, area.y * area.devicePixelRatio, area.width * area.devicePixelRatio, area.height * area.devicePixelRatio, 0, 0, canvas.width, canvas.height);
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    processFile(generateFileName("Crop", title, "png"), "image/png", croppedBlob, "Screenshots", mode);
  } catch (err) { showNotification("Error", "Crop failed."); }
}

function saveFullPageMHTML(tabId, title, mode, sendResponse) {
  chrome.pageCapture.saveAsMHTML({ tabId: tabId }, (mhtmlData) => {
    if (!mhtmlData) { if(sendResponse) sendResponse({ status: "Failed" }); return; }
    processFile(generateFileName("FullPage", title, "mhtml"), "application/x-mimearchive", mhtmlData, "Webpages", mode, sendResponse);
  });
}

function processFile(fileName, mimeType, data, folder, mode, sendResponse = null, isDataUrl = false) {
    if (mode === 'local') {
        if (!isDataUrl && typeof data !== 'string') {
            const reader = new FileReader();
            reader.readAsDataURL(data);
            reader.onloadend = () => downloadLocal(fileName, reader.result, folder, sendResponse);
        } else downloadLocal(fileName, data, folder, sendResponse);
    } else {
        if(isDataUrl) fetch(data).then(r => r.blob()).then(b => uploadFile(fileName, mimeType, b, folder, sendResponse));
        else uploadFile(fileName, mimeType, data, folder, sendResponse);
    }
}

function downloadLocal(fileName, url, subFolder, sendResponse) {
  chrome.downloads.download({ url: url, filename: `My Capture/${subFolder}/${fileName}`, saveAs: false, conflictAction: 'uniquify' }, () => {
    if(sendResponse) sendResponse({ status: "Saved to PC! 💻" }); else showNotification("Saved to PC ✅", fileName);
  });
}

function generateFileName(prefix, t, ext) { return `${(t||"Untitled").replace(/[\\/:*?"<>|]/g, "").trim().substring(0,50)} - ${new Date().toISOString().split('T')[0]}.${ext}`; }
function showNotification(t, m) { chrome.notifications.create({ type: 'basic', iconUrl: 'icon.png', title: 'My Capture', message: t + " " + m }); }
function handleError(cb, m) { if(cb) cb({status: m}); else showNotification("Error", m); }

// ---------------- AUTH FLOW (WEB APP METHOD) ----------------

let cachedToken = null;

function getAuthToken(callback) {
  if (cachedToken) { callback(cachedToken); return; }
  
  // ডাইনামিক রিডাইরেক্ট ইউআরএল তৈরি
  const redirectUri = chrome.identity.getRedirectURL(); 
  // অথেন্টিকেশন ইউআরএল
  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(SCOPES.join(' '))}`;

  chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, function(responseUrl) {
    if (chrome.runtime.lastError || !responseUrl) {
      console.error("Auth Error:", chrome.runtime.lastError);
      callback(null);
      return;
    }
    const url = new URL(responseUrl);
    const params = new URLSearchParams(url.hash.substring(1));
    cachedToken = params.get("access_token");
    callback(cachedToken);
  });
}

function uploadFile(fileName, mimeType, data, subFolderName, sendResponse) {
    if(!sendResponse) showNotification("Uploading...", "Saving to Drive.");
    getAuthToken(token => {
        if (!token) { handleError(sendResponse, "Auth Failed. Login required."); return; }
        // ফোল্ডার খুঁজে বের করা এবং আপলোড
        findOrCreateFolder(token, "My Capture", null, (mainId) => {
            findOrCreateFolder(token, subFolderName, mainId, (subId) => {
                const metadata = { name: fileName, mimeType: mimeType, parents: [subId] };
                const form = new FormData();
                form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                form.append('file', typeof data === 'string' ? new Blob([data], { type: mimeType }) : data);
                
                fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: form
                }).then(r => r.json()).then(d => {
                    if(sendResponse) sendResponse({ status: "Saved to Cloud! ☁️" }); else showNotification("Saved to Drive ✅", fileName);
                }).catch(e => handleError(sendResponse, "Upload Error"));
            });
        });
    });
}

function findOrCreateFolder(token, name, parent, cb) {
    let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parent) q += ` and '${parent}' in parents`;
    fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, { headers: { 'Authorization': 'Bearer ' + token } })
    .then(r => r.json()).then(d => {
        if (d.files && d.files.length > 0) cb(d.files[0].id);
        else createFolder(token, name, parent, cb);
    });
}

function createFolder(token, name, parent, cb) {
    const meta = { name: name, mimeType: "application/vnd.google-apps.folder" };
    if (parent) meta.parents = [parent];
    fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })
    .then(r => r.json()).then(d => cb(d.id));
}