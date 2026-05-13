const { app, BrowserWindow, BrowserView, session, ipcMain, dialog } = require('electron');
const fs = require('fs');

let mainWindow;
let views = {};
let activeViewId = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    
    mainWindow.loadFile('index.html');
    mainWindow.setMenuBarVisibility(false);

    const ses = session.defaultSession;
    ses.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    mainWindow.on('resize', () => {
        if (activeViewId && views[activeViewId]) updateViewBounds(activeViewId);
    });

    ses.on('will-download', (event, item) => {
        event.preventDefault();
        const fp = dialog.showSaveDialogSync(mainWindow, { defaultPath: item.getFilename() });
        if (fp) {
            item.setSavePath(fp);
            item.on('done', (e, state) => {
                if (state === 'completed') mainWindow.webContents.send('download-complete', { name: item.getFilename() });
            });
        }
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

function createView(url, id) {
    const view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        }
    });
    mainWindow.addBrowserView(view);
    view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 });
    view.webContents.loadURL(url);
    views[id] = view;
    
    // Prevent new windows from opening - open in new tab instead
    view.webContents.setWindowOpenHandler(({ url: newUrl }) => {
        mainWindow.webContents.send('open-new-tab', newUrl);
        return { action: 'deny' };
    });
    
    view.webContents.on('did-finish-load', () => {
        if (activeViewId === id) updateViewBounds(id);
        mainWindow.webContents.send('page-loaded', { id, url: view.webContents.getURL() });
    });
    
    view.webContents.on('did-navigate', (event, url) => {
        mainWindow.webContents.send('page-navigated', { id, url });
    });
    
    return view;
}

function removeView(id) {
    if (views[id]) {
        mainWindow.removeBrowserView(views[id]);
        delete views[id];
    }
}

function hideAllViews() {
    Object.keys(views).forEach(key => {
        if (views[key]) views[key].setBounds({ x: -9999, y: -9999, width: 1, height: 1 });
    });
}

function setActiveView(id) {
    hideAllViews();
    activeViewId = id;
    if (views[id]) updateViewBounds(id);
}

function updateViewBounds(id) {
    if (!views[id] || activeViewId !== id) return;
    
    mainWindow.webContents.executeJavaScript(`
        (function(){
            return {
                tabsH: document.getElementById('tabsBar')?.offsetHeight || 34,
                topbarH: document.getElementById('topbar')?.offsetHeight || 42,
                statusH: document.getElementById('statusBar')?.offsetHeight || 2,
                winW: window.innerWidth,
                winH: window.innerHeight
            };
        })()
    `).then(dims => {
        if (dims && views[id] && activeViewId === id) {
            const y = dims.tabsH + dims.topbarH + dims.statusH;
            views[id].setBounds({
                x: 0,
                y: Math.round(y),
                width: Math.round(dims.winW),
                height: Math.round(dims.winH - y)
            });
        }
    }).catch(() => {});
}

// ===== IPC HANDLERS =====
ipcMain.handle('create-view', async (e, url, id) => { createView(url, id); return true; });
ipcMain.handle('remove-view', async (e, id) => { removeView(id); return true; });
ipcMain.handle('set-active-view', async (e, id) => { setActiveView(id); return true; });
ipcMain.handle('hide-all-views', async () => { hideAllViews(); return true; });
ipcMain.handle('navigate-view', async (e, id, url) => { if (views[id]) views[id].webContents.loadURL(url); return true; });
ipcMain.handle('update-view-bounds', async (e, id) => { updateViewBounds(id); return true; });

ipcMain.on('set-proxy', (e, proxy) => { if (proxy) session.defaultSession.setProxy({ proxyRules: proxy }).catch(() => {}); else session.defaultSession.setProxy({ proxyRules: 'direct://' }).catch(() => {}); });
ipcMain.on('open-external', (e, url) => { require('electron').shell.openExternal(url); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });