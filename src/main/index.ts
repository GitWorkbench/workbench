import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { registerIpc } from './ipc';
import { registerUpdater } from './updater';
import { configureAppIdentity, configureAppMenu } from './app-identity';
import { APP_NAME } from '../shared/appIdentity';

configureAppIdentity();

let mainWindow: BrowserWindow | null = null;
let currentRepo: string | null = null;

function createWindow() {
  const iconPath = path.join(__dirname, '../../build/icon.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#181a1f',
    title: APP_NAME,
    frame: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximize-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximize-change', false);
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  configureAppMenu();
  registerIpc(
    () => mainWindow,
    () => currentRepo
  );
  registerUpdater(() => mainWindow);

  // Track the active repo path (sent from renderer when a tab is focused)
  ipcMain.on('repo:set-active', (_e, repoPath: string | null) => {
    currentRepo = repoPath;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Open external links in the default browser
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});
