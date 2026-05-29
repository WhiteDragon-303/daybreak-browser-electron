const { ipcRenderer } = require('electron');

// Forward context menu events
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ipcRenderer.send('context-menu-triggered', {
        x: e.clientX,
        y: e.clientY,
        target: e.target.tagName,
        isEditable: e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA',
        selectionText: window.getSelection().toString()
    });
});