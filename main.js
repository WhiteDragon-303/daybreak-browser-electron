const { app, BrowserWindow, BrowserView, session, ipcMain, shell, Menu, clipboard } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

process.setMaxListeners(50);
require('events').EventEmitter.defaultMaxListeners = 50;

let mainWindow;
let views = {};
let activeViewId = null;
let blocker = null;
let currentLang = 'zh';

const stateFile = path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
    try {if(fs.existsSync(stateFile)){return JSON.parse(fs.readFileSync(stateFile,'utf8'));}}catch(e){}
    return {width:1280,height:800,x:undefined,y:undefined};
}
function saveWindowState() {
    if(!mainWindow)return;
    const bounds=mainWindow.getBounds();
    try{fs.writeFileSync(stateFile,JSON.stringify({width:bounds.width,height:bounds.height,x:bounds.x,y:bounds.y}));}catch(e){}
}

const ENCRYPTION_KEY = crypto.scryptSync('daybreak-browser-secure-key','salt',32);
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
    const iv=crypto.randomBytes(16);
    const cipher=crypto.createCipheriv(ALGORITHM,ENCRYPTION_KEY,iv);
    let encrypted=cipher.update(text,'utf8','hex');
    encrypted+=cipher.final('hex');
    const authTag=cipher.getAuthTag();
    return JSON.stringify({iv:iv.toString('hex'),encrypted:encrypted,tag:authTag.toString('hex')});
}

function decrypt(encryptedData) {
    try{
        const data=JSON.parse(encryptedData);
        const decipher=crypto.createDecipheriv(ALGORITHM,ENCRYPTION_KEY,Buffer.from(data.iv,'hex'));
        decipher.setAuthTag(Buffer.from(data.tag,'hex'));
        let decrypted=decipher.update(data.encrypted,'hex','utf8');
        decrypted+=decipher.final('utf8');
        return decrypted;
    }catch(error){return null;}
}

async function enableAdBlocker(ses) {
    if(blocker)return;
    try{blocker=await ElectronBlocker.fromPrebuiltAdsAndTracking();blocker.enableBlockingInSession(ses);console.log('Ad blocker enabled');}
    catch(err){if(err.message&&err.message.includes('second handler')){console.log('Ad blocker already active');blocker={disableBlockingInSession:()=>{}};}else{console.error('Failed to enable ad blocker:',err.message);blocker=null;}}
}

function disableAdBlocker(){if(blocker){try{blocker.disableBlockingInSession(session.defaultSession);}catch(e){}blocker=null;console.log('Ad blocker disabled');}}

function createWindow() {
    const windowState=loadWindowState();
    mainWindow=new BrowserWindow({width:windowState.width,height:windowState.height,x:windowState.x,y:windowState.y,webPreferences:{nodeIntegration:false,contextIsolation:true,preload:path.join(__dirname,'preload.js'),sandbox:false}});
    mainWindow.loadFile('index.html');
    mainWindow.setMenuBarVisibility(false);
    const ses=session.defaultSession;
    ses.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
    mainWindow.on('resize',()=>{saveWindowState();if(activeViewId&&views[activeViewId])updateViewBounds(activeViewId);});
    mainWindow.on('move',()=>{saveWindowState();});
    mainWindow.on('closed',()=>{mainWindow=null;});

    mainWindow.webContents.on('context-menu',(event,params)=>{
        const hasSelection=params.selectionText&&params.selectionText.trim().length>0;
        const isEditable=params.isEditable||(params.inputFieldType&&params.inputFieldType!=='none');
        if(!isEditable&&!hasSelection)return;
        event.preventDefault();
        const template=[];
        const isZh=currentLang==='zh';
        template.push({label:isZh?'剪切':'Cut',enabled:isEditable&&hasSelection,click:()=>{mainWindow.webContents.cut();}});
        template.push({label:isZh?'复制':'Copy',enabled:hasSelection,click:()=>{mainWindow.webContents.copy();}});
        template.push({label:isZh?'粘贴':'Paste',enabled:isEditable,click:()=>{mainWindow.webContents.paste();}});
        template.push({label:isZh?'删除':'Delete',enabled:isEditable&&hasSelection,click:()=>{mainWindow.webContents.delete();}});
        template.push({type:'separator'});
        template.push({label:isZh?'全选':'Select All',click:()=>{mainWindow.webContents.selectAll();}});
        const menu=Menu.buildFromTemplate(template);
        menu.popup({window:mainWindow});
    });
}

function createView(url,id) {
    const view=new BrowserView({webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:false,webSecurity:false}});
    views[id]=view;
    view.webContents.loadURL(url);
    view.webContents.setWindowOpenHandler(({url:newUrl})=>{mainWindow.webContents.send('open-new-tab',newUrl);return{action:'deny'};});
    view.webContents.on('did-finish-load',()=>{if(activeViewId===id)updateViewBounds(id);if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.webContents.send('page-loaded',{id:id,url:view.webContents.getURL(),title:view.webContents.getTitle()});}});
    view.webContents.on('did-navigate',(event,url)=>{if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.webContents.send('page-navigated',{id:id,url:url,title:view.webContents.getTitle()});}});
    view.webContents.on('did-navigate-in-page',(event,url)=>{if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.webContents.send('page-navigated',{id:id,url:url,title:view.webContents.getTitle()});}});

    view.webContents.on('context-menu',(event,params)=>{
        event.preventDefault();
        const template=[];
        const isZh=currentLang==='zh';
        const hasSelection=params.selectionText&&params.selectionText.trim().length>0;
        const isEditable=params.isEditable||(params.inputFieldType&&params.inputFieldType!=='none');
        
        if(isEditable||hasSelection){
            template.push({label:isZh?'剪切':'Cut',enabled:hasSelection,click:()=>{view.webContents.cut();}});
            template.push({label:isZh?'复制':'Copy',enabled:hasSelection,click:()=>{view.webContents.copy();}});
            template.push({label:isZh?'粘贴':'Paste',enabled:isEditable,click:()=>{view.webContents.paste();}});
            template.push({label:isZh?'删除':'Delete',enabled:hasSelection,click:()=>{view.webContents.delete();}});
            template.push({type:'separator'});
            template.push({label:isZh?'全选':'Select All',click:()=>{view.webContents.selectAll();}});
            template.push({type:'separator'});
        }
        
        if(hasSelection&&!isEditable){template.push({label:isZh?'搜索选中文本':'Search Selected Text',click:()=>{mainWindow.webContents.send('search-selected-text',params.selectionText);}});template.push({type:'separator'});}
        if(params.linkURL){template.push({label:isZh?'在新标签页打开链接':'Open Link in New Tab',click:()=>{mainWindow.webContents.send('open-new-tab',params.linkURL);}});template.push({label:isZh?'复制链接地址':'Copy Link Address',click:()=>{clipboard.writeText(params.linkURL);}});template.push({type:'separator'});}
        if(params.mediaType==='image'&&params.srcURL){template.push({label:isZh?'在新标签页打开图片':'Open Image in New Tab',click:()=>{mainWindow.webContents.send('open-new-tab',params.srcURL);}});template.push({label:isZh?'复制图片地址':'Copy Image URL',click:()=>{clipboard.writeText(params.srcURL);}});template.push({label:isZh?'复制图片':'Copy Image',click:()=>{view.webContents.copyImageAt(params.x,params.y);}});template.push({type:'separator'});}
        const canGoBack=view.webContents.navigationHistory?view.webContents.navigationHistory.canGoBack():false;
        const canGoForward=view.webContents.navigationHistory?view.webContents.navigationHistory.canGoForward():false;
        template.push({label:isZh?'返回':'Back',enabled:canGoBack,click:()=>{if(view.webContents.navigationHistory)view.webContents.navigationHistory.goBack();}});
        template.push({label:isZh?'前进':'Forward',enabled:canGoForward,click:()=>{if(view.webContents.navigationHistory)view.webContents.navigationHistory.goForward();}});
        template.push({label:isZh?'刷新':'Refresh',click:()=>{view.webContents.reload();}});
        template.push({type:'separator'});
        template.push({label:isZh?'查看页面源代码':'View Page Source',click:()=>{mainWindow.webContents.send('open-new-tab','view-source:'+params.pageURL);}});
        template.push({label:isZh?'检查元素':'Inspect Element',click:()=>{view.webContents.inspectElement(params.x,params.y);}});
        const menu=Menu.buildFromTemplate(template);
        menu.popup({window:mainWindow});
    });
    return view;
}

function removeView(id) {
    if(views[id]){
        if(activeViewId===id){activeViewId=null;try{mainWindow.removeBrowserView(views[id]);}catch(e){}}
        if(views[id].webContents&&!views[id].webContents.isDestroyed()){views[id].webContents.removeAllListeners();}
        delete views[id];
    }
}

function detachAllViews(){Object.keys(views).forEach(key=>{if(views[key]){try{mainWindow.removeBrowserView(views[key]);}catch(e){}}});}
function attachView(id){if(views[id]){try{mainWindow.addBrowserView(views[id]);}catch(e){}updateViewBounds(id);}}
function setActiveView(id){detachAllViews();activeViewId=id;if(views[id])attachView(id);}
function hideActiveViewCompletely(){if(activeViewId&&views[activeViewId]){try{mainWindow.removeBrowserView(views[activeViewId]);}catch(e){}}}
function showActiveViewAgain(){if(activeViewId&&views[activeViewId]){try{mainWindow.addBrowserView(views[activeViewId]);}catch(e){}updateViewBounds(activeViewId);}}

function updateViewBounds(id) {
    if(!views[id]||activeViewId!==id)return;
    if(!mainWindow||mainWindow.isDestroyed())return;
    try{
        mainWindow.webContents.executeJavaScript(`(function(){try{return{tabsH:document.getElementById('tabsBar')?.offsetHeight||34,topbarH:document.getElementById('topbar')?.offsetHeight||42,statusH:document.getElementById('statusBar')?.offsetHeight||2,winW:window.innerWidth,winH:window.innerHeight};}catch(e){return{tabsH:34,topbarH:42,statusH:2,winW:window.innerWidth,winH:window.innerHeight};}})()`).then(dims=>{
            if(dims&&views[id]&&activeViewId===id){
                const y=dims.tabsH+dims.topbarH+dims.statusH;
                views[id].setBounds({x:0,y:Math.round(y),width:Math.round(dims.winW),height:Math.round(dims.winH-y)});
            }
        }).catch(()=>{});
    }catch(e){}
}

ipcMain.handle('create-view',async(e,url,id)=>{createView(url,id);return true;});
ipcMain.handle('remove-view',async(e,id)=>{removeView(id);return true;});
ipcMain.handle('set-active-view',async(e,id)=>{setActiveView(id);return true;});
ipcMain.handle('hide-all-views',async()=>{detachAllViews();return true;});
ipcMain.handle('navigate-view',async(e,id,url)=>{if(views[id])views[id].webContents.loadURL(url);return true;});
ipcMain.handle('go-back-view',async(e,id)=>{if(views[id]&&views[id].navigationHistory&&views[id].navigationHistory.canGoBack())views[id].navigationHistory.goBack();return true;});
ipcMain.handle('go-forward-view',async(e,id)=>{if(views[id]&&views[id].navigationHistory&&views[id].navigationHistory.canGoForward())views[id].navigationHistory.goForward();return true;});
ipcMain.handle('reload-view',async(e,id)=>{if(views[id])views[id].webContents.reload();return true;});
ipcMain.handle('update-view-bounds',async(e,id)=>{updateViewBounds(id);return true;});
ipcMain.handle('open-external',async(e,url)=>{require('electron').shell.openExternal(url);return true;});
ipcMain.handle('encrypt-password',async(e,password)=>{return encrypt(password);});
ipcMain.handle('decrypt-password',async(e,encryptedPassword)=>{return decrypt(encryptedPassword);});
ipcMain.handle('toggle-adblocker',async(e,enable)=>{if(enable){await enableAdBlocker(session.defaultSession);}else{disableAdBlocker();}return enable;});
ipcMain.handle('get-adblocker-status',async()=>{return!!blocker;});
ipcMain.handle('menu-opened',async()=>{hideActiveViewCompletely();return true;});
ipcMain.handle('menu-closed',async()=>{showActiveViewAgain();return true;});
ipcMain.handle('ctx-menu-opened',async()=>{hideActiveViewCompletely();return true;});
ipcMain.handle('ctx-menu-closed',async()=>{showActiveViewAgain();return true;});
ipcMain.handle('set-language',async(e,lang)=>{currentLang=lang;return true;});

app.whenReady().then(createWindow);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(mainWindow===null)createWindow();});