const { app, BrowserWindow, session, ipcMain, dialog } = require('electron');
const fs = require('fs');

let windows = [];
let proxyServer = '';

function createWindow(workspaceData = null) {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            webSecurity: false,
            allowRunningInsecureContent: true,
            plugins: true
        }
    });
    
    win.loadFile('index.html');
    win.setMenuBarVisibility(false);
    windows.push(win);

    const ses = win.webContents.session;
    ses.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    ses.on('will-download', (event, item) => {
        event.preventDefault();
        const fp = dialog.showSaveDialogSync(win, { defaultPath: item.getFilename() });
        if (fp) {
            item.setSavePath(fp);
            win.webContents.send('download-started', { name: item.getFilename(), url: item.getURL() });
            item.on('done', (e, state) => {
                if (state === 'completed') win.webContents.send('download-complete', { name: item.getFilename(), path: fp });
                else win.webContents.send('download-error', { name: item.getFilename(), error: state });
            });
        }
    });

    win.on('closed', () => { windows = windows.filter(w => w !== win); });
    return win;
}

ipcMain.on('set-proxy', (e, proxy) => { proxyServer = proxy; if (proxy) session.defaultSession.setProxy({ proxyRules: proxy }).catch(() => {}); else session.defaultSession.setProxy({ proxyRules: 'direct://' }).catch(() => {}); });
ipcMain.on('get-proxy', (e) => { e.returnValue = proxyServer; });
ipcMain.on('open-external', (e, url) => { require('electron').shell.openExternal(url); });
ipcMain.handle('export-bookmarks', async (e, bm) => { const r = await dialog.showSaveDialog(null, { defaultPath: 'bookmarks.json', filters: [{ name: 'JSON', extensions: ['json'] }] }); if (!r.canceled && r.filePath) { fs.writeFileSync(r.filePath, JSON.stringify(bm, null, 2)); return { success: true }; } return { success: false }; });
ipcMain.handle('import-bookmarks', async () => { const r = await dialog.showOpenDialog(null, { filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] }); if (!r.canceled && r.filePaths.length > 0) { try { return { success: true, bookmarks: JSON.parse(fs.readFileSync(r.filePaths[0], 'utf-8')) }; } catch (err) { return { success: false, error: err.message }; } } return { success: false }; });
ipcMain.handle('save-file', async (e, data, filename) => { const r = await dialog.showSaveDialog(null, { defaultPath: filename }); if (!r.canceled && r.filePath) { fs.writeFileSync(r.filePath, data); return { success: true, path: r.filePath }; } return { success: false }; });
ipcMain.on('create-new-window', (event, tabData) => { const newWin = createWindow(); newWin.webContents.on('did-finish-load', () => { newWin.webContents.send('add-dragged-tab', tabData); }); });

app.whenReady().then(() => { createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (windows.length === 0) createWindow(); });