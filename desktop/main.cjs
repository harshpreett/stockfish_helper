const { app, BrowserWindow } = require('electron');
const { startLocalServer } = require('./server.cjs');

let localServer;
let windowRef;

async function createWindow() {
  localServer = await startLocalServer({ root: app.getAppPath(), resourcesPath: process.resourcesPath });
  windowRef = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 700,
    minHeight: 640,
    backgroundColor: '#282725',
    title: 'Chess Helper',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRef.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowRef.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localServer.url)) event.preventDefault();
  });
  const localOrigin = new URL(localServer.url);
  windowRef.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    let isLocal = false;
    try {
      const requestUrl = new URL(details.url);
      isLocal = requestUrl.hostname === '127.0.0.1' && requestUrl.port === localOrigin.port;
    } catch { /* malformed URLs are denied */ }
    callback({ cancel: !isLocal });
  });
  await windowRef.loadURL(localServer.url);
  windowRef.on('closed', () => { windowRef = null; });
}

app.whenReady().then(createWindow).catch((error) => {
  console.error('Could not start Chess Helper:', error);
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  localServer?.close();
  localServer = null;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
