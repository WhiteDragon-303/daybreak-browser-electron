const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daybreakAPI', {
    createView: (url, id) => ipcRenderer.invoke('create-view', url, id),
    removeView: (id) => ipcRenderer.invoke('remove-view', id),
    setActiveView: (id) => ipcRenderer.invoke('set-active-view', id),
    hideAllViews: () => ipcRenderer.invoke('hide-all-views'),
    navigateView: (id, url) => ipcRenderer.invoke('navigate-view', id, url),
    goBackView: (id) => ipcRenderer.invoke('go-back-view', id),
    goForwardView: (id) => ipcRenderer.invoke('go-forward-view', id),
    reloadView: (id) => ipcRenderer.invoke('reload-view', id),
    updateViewBounds: (id) => ipcRenderer.invoke('update-view-bounds', id),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    encryptPassword: (password) => ipcRenderer.invoke('encrypt-password', password),
    decryptPassword: (encryptedPassword) => ipcRenderer.invoke('decrypt-password', encryptedPassword),
    onPageLoaded: (callback) => ipcRenderer.on('page-loaded', (event, data) => callback(data)),
    onPageNavigated: (callback) => ipcRenderer.on('page-navigated', (event, data) => callback(data)),
    onOpenNewTab: (callback) => ipcRenderer.on('open-new-tab', (event, url) => callback(url)),
    onShowPageContextMenu: (callback) => ipcRenderer.on('show-page-context-menu', (event, data) => callback(data))
});