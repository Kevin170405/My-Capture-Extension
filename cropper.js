(function() {
    // যদি আগে থেকেই ক্রপার চালু থাকে, তবে বন্ধ করো
    if (document.getElementById('my-mind-overlay')) return;

    // ১. ওভারলে তৈরি (পুরো স্ক্রিন কালো ঝাপসা হবে)
    const overlay = document.createElement('div');
    overlay.id = 'my-mind-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.3)';
    overlay.style.zIndex = '999999';
    overlay.style.cursor = 'crosshair';
    document.body.appendChild(overlay);

    // ২. সিলেকশন বক্স (লাল বর্ডার)
    const box = document.createElement('div');
    box.style.border = '2px dashed #EA4335';
    box.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    box.style.position = 'fixed';
    overlay.appendChild(box);

    let startX, startY, endX, endY;
    let isDragging = false;

    // মাউস চাপলে শুরু
    overlay.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startY = e.clientY;
        isDragging = true;
        box.style.left = startX + 'px';
        box.style.top = startY + 'px';
        box.style.width = '0px';
        box.style.height = '0px';
    });

    // মাউস নাড়ালে বক্স বড় হবে
    overlay.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        endX = e.clientX;
        endY = e.clientY;

        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);
        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);

        box.style.width = width + 'px';
        box.style.height = height + 'px';
        box.style.left = left + 'px';
        box.style.top = top + 'px';
    });

    // মাউস ছাড়লে কো-অর্ডিনেট পাঠাবে
    overlay.addEventListener('mouseup', (e) => {
        isDragging = false;
        document.body.removeChild(overlay); // ওভারলে মুছে ফেলো

        // যদি খুব ছোট ক্লিক হয়, তবে বাতিল
        if (parseInt(box.style.width) < 10 || parseInt(box.style.height) < 10) return;

        // Background এ তথ্য পাঠাও
        const cropData = {
            x: parseInt(box.style.left),
            y: parseInt(box.style.top),
            width: parseInt(box.style.width),
            height: parseInt(box.style.height),
            devicePixelRatio: window.devicePixelRatio
        };

        chrome.runtime.sendMessage({
            action: "processCrop",
            cropData: cropData,
            title: document.title
        });
    });
})();