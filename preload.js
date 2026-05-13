const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
    ipcRenderer.sendToHost('webview-ready');
    document.documentElement.style.width = '100%';
    document.documentElement.style.height = '100%';
    document.documentElement.style.margin = '0';
    document.documentElement.style.padding = '0';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.position = 'relative';
});

const meta = document.createElement('meta');
meta.name = 'viewport';
meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
if (document.head) { document.head.appendChild(meta); }
else { document.addEventListener('DOMContentLoaded', () => { document.head.appendChild(meta); }); }

const style = document.createElement('style');
style.textContent = 'html,body{width:100%!important;height:100%!important;margin:0!important;padding:0!important;overflow-x:hidden!important}';
if (document.head) { document.head.appendChild(style); }
else { document.addEventListener('DOMContentLoaded', () => { document.head.appendChild(style); }); }