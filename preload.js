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
    toggleAdblocker: (enable) => ipcRenderer.invoke('toggle-adblocker', enable),
    getAdblockerStatus: () => ipcRenderer.invoke('get-adblocker-status'),
    fillCredentialsInView: (viewId, credentials) => ipcRenderer.invoke('fill-credentials-in-view', viewId, credentials),
    menuOpened: () => ipcRenderer.invoke('menu-opened'),
    menuClosed: () => ipcRenderer.invoke('menu-closed'),
    setLanguage: (lang) => ipcRenderer.invoke('set-language', lang),
    onPageLoaded: (callback) => ipcRenderer.on('page-loaded', (event, data) => callback(data)),
    onPageNavigated: (callback) => ipcRenderer.on('page-navigated', (event, data) => callback(data)),
    onOpenNewTab: (callback) => ipcRenderer.on('open-new-tab', (event, url) => callback(url)),
    onShowPasswordSaveBar: (callback) => ipcRenderer.on('show-password-save-bar', (event, data) => callback(data)),
    onPasswordAutofillCheck: (callback) => ipcRenderer.on('password-autofill-check', (event, data) => callback(data)),
    onPasswordNeverSaveDomain: (callback) => ipcRenderer.on('password-never-save-domain', (event, data) => callback(data)),
    onSearchSelectedText: (callback) => ipcRenderer.on('search-selected-text', (event, text) => callback(text))
});