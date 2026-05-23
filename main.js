const { app, BrowserWindow, BrowserView, session, ipcMain, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');

let mainWindow;
let views = {};
let activeViewId = null;

// Generate encryption key
const ENCRYPTION_KEY = crypto.scryptSync('daybreak-browser-secure-key', 'salt', 32);
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return JSON.stringify({
        iv: iv.toString('hex'),
        encrypted: encrypted,
        tag: authTag.toString('hex')
    });
}

function decrypt(encryptedData) {
    try {
        const data = JSON.parse(encryptedData);
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            ENCRYPTION_KEY,
            Buffer.from(data.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
        let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        return null;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false
        }
    });
    
    mainWindow.loadFile('index.html');
    mainWindow.setMenuBarVisibility(false);

    const ses = session.defaultSession;
    ses.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    mainWindow.on('resize', () => {
        if (activeViewId && views[activeViewId]) updateViewBounds(activeViewId);
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

function createView(url, id) {
    const view = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: false
        }
    });
    mainWindow.addBrowserView(view);
    view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 });
    view.webContents.loadURL(url);
    views[id] = view;
    
    view.webContents.setWindowOpenHandler(({ url: newUrl }) => {
        mainWindow.webContents.send('open-new-tab', newUrl);
        return { action: 'deny' };
    });
    
    view.webContents.on('did-finish-load', () => {
        if (activeViewId === id) updateViewBounds(id);
        mainWindow.webContents.send('page-loaded', { 
            id, 
            url: view.webContents.getURL(),
            title: view.webContents.getTitle()
        });
    });
    
    view.webContents.on('did-navigate', (event, url) => {
        mainWindow.webContents.send('page-navigated', { 
            id, 
            url,
            title: view.webContents.getTitle()
        });
    });
    
    // Right-click context menu for page content
    view.webContents.on('context-menu', (event, params) => {
        mainWindow.webContents.send('show-page-context-menu', {
            x: params.x,
            y: params.y,
            linkUrl: params.linkURL,
            pageUrl: params.pageURL,
            selectionText: params.selectionText,
            mediaType: params.mediaType,
            srcUrl: params.srcURL
        });
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
ipcMain.handle('go-back-view', async (e, id) => { if (views[id] && views[id].webContents.canGoBack()) views[id].webContents.goBack(); return true; });
ipcMain.handle('go-forward-view', async (e, id) => { if (views[id] && views[id].webContents.canGoForward()) views[id].webContents.goForward(); return true; });
ipcMain.handle('reload-view', async (e, id) => { if (views[id]) views[id].webContents.reload(); return true; });
ipcMain.handle('update-view-bounds', async (e, id) => { updateViewBounds(id); return true; });
ipcMain.handle('open-external', async (e, url) => { require('electron').shell.openExternal(url); return true; });

// Secure password encryption/decryption
ipcMain.handle('encrypt-password', async (e, password) => { return encrypt(password); });
ipcMain.handle('decrypt-password', async (e, encryptedPassword) => { return decrypt(encryptedPassword); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null) createWindow(); });