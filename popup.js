document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('storageToggle');
  const modeText = document.getElementById('modeText');

  // ১. পপ-আপ ওপেন হলে আগের সেভ করা মোড চেক করা
  chrome.storage.local.get(['saveMode'], (result) => {
    if (result.saveMode === 'local') {
      if (toggle) toggle.checked = false;
      updateUI(false);
    } else {
      if (toggle) toggle.checked = true;
      updateUI(true);
    }
  });

  // ২. টগল সুইচ চেঞ্জ হলে মেমোরিতে সেভ করা
  if (toggle) {
    toggle.addEventListener('change', () => {
      const isDrive = toggle.checked;
      const mode = isDrive ? 'drive' : 'local';
      
      // মেমোরিতে সেভ হচ্ছে
      chrome.storage.local.set({ saveMode: mode });
      updateUI(isDrive);
    });
  }

  // UI আপডেট করার ফাংশন
  function updateUI(isDrive) {
    if (isDrive) {
      modeText.innerText = "Save to: Cloud ☁️";
      modeText.style.color = "#1967d2"; 
    } else {
      modeText.innerText = "Save to: PC 💻";
      modeText.style.color = "#333"; 
    }
  }

  // ৩. বাটন ইভেন্ট লিসেনার

  // Visible Part Button
  const btnVisible = document.getElementById('btnVisible');
  if (btnVisible) {
    btnVisible.addEventListener('click', () => {
      sendAction("saveScreenshot", "Capturing...");
    });
  }

  // Selected Area Button (Security Check সহ আপডেট করা হয়েছে)
  const btnArea = document.getElementById('btnArea');
  if (btnArea) {
    btnArea.addEventListener('click', () => {
      // প্রথমে বর্তমান ট্যাব চেক করবো
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        const currentUrl = currentTab.url;
        const status = document.getElementById('status');

        // যদি সিস্টেম পেজ হয় (যেমন Settings বা Extensions Page), তবে থামিয়ে দেব
        if (currentUrl.startsWith("chrome://") || currentUrl.startsWith("edge://") || currentUrl.startsWith("about:") || currentUrl.startsWith("file://")) {
          status.innerText = "⚠️ Can't run on system pages!";
          status.style.color = "red";
          return;
        }

        // সাধারণ পেজ হলে কাজ শুরু করবে
        status.innerText = "Drag mouse to select area...";
        status.style.color = "#EA4335";
        
        chrome.scripting.executeScript({
          target: {tabId: currentTab.id},
          files: ['cropper.js']
        });
        
        // ১ সেকেন্ড পর পপ-আপ বন্ধ হবে যাতে ইউজার সিলেক্ট করতে পারে
        setTimeout(() => window.close(), 1000);
      });
    });
  }

  // Full Page Button
  const btnFull = document.getElementById('btnFull');
  if (btnFull) {
    btnFull.addEventListener('click', () => {
      sendAction("saveFullPage", "Processing Page...");
    });
  }
});

// ৪. ব্যাকগ্রাউন্ডে মেসেজ পাঠানোর ফাংশন
function sendAction(actionType, msg) {
  const statusText = document.getElementById('status');
  statusText.innerText = msg;
  statusText.style.color = "#5f6368";

  // স্টোরেজ থেকে মোড চেক করে পাঠানো
  chrome.storage.local.get(['saveMode'], (result) => {
    const saveMode = result.saveMode || 'drive'; // ডিফল্ট ড্রাইভ

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      // সিস্টেম পেজ চেক
      const url = tabs[0].url;
      if (url.startsWith("chrome://") || url.startsWith("edge://")) {
         statusText.innerText = "⚠️ Not allowed on system page";
         statusText.style.color = "red";
         return;
      }

      chrome.runtime.sendMessage(
        { 
          action: actionType, 
          title: tabs[0].title, 
          url: tabs[0].url, 
          tabId: tabs[0].id, 
          saveMode: saveMode 
        }, 
        (response) => {
          if (chrome.runtime.lastError) {
            // অনেক সময় পপ-আপ বন্ধ হয়ে গেলে রেসপন্স পায় না, সেটা ইগনোর করছি
            console.log("Runtime error (popup closed?):", chrome.runtime.lastError);
          } else {
            statusText.innerText = response && response.status ? response.status : "Done!";
          }
        }
      );
    });
  });
}