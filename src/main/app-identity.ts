import { app, Menu } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { APP_NAME, APP_SLUG } from '../shared/appIdentity';

/** Configure the profile and keychain identity before Electron is ready. */
export function configureAppIdentity() {
  const profile = path.join(app.getPath('appData'), APP_NAME);
  fs.mkdirSync(profile, { recursive: true });
  app.setName(APP_NAME);
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
  app.setAboutPanelOptions({ applicationName: APP_NAME });
  if (process.platform === 'linux') app.setDesktopName(`${APP_SLUG}.desktop`);
}

/** Use the product name throughout the macOS native menu. */
export function configureAppMenu() {
  if (process.platform !== 'darwin') return;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `About ${APP_NAME}` },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${APP_NAME}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${APP_NAME}` }
      ]
    },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]));
}
