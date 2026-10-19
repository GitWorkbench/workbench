import { app, BrowserWindow, ipcMain, shell } from 'electron';
import electronUpdater, { type UpdateInfo } from 'electron-updater';
import type { AppUpdateState } from '../shared/types';
import { RELEASES_URL } from '../shared/appIdentity';

const { autoUpdater } = electronUpdater;
const releasePageUrl = RELEASES_URL;

let getWindow: (() => BrowserWindow | null) | undefined;
let checkInProgress: Promise<AppUpdateState> | null = null;
let hasDownloadedUpdate = false;

const canInstallInApp = () => app.isPackaged && (process.platform === 'linux' || process.platform === 'win32');

let state: AppUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  canInstallInApp: canInstallInApp()
};

function publishState(next: Partial<AppUpdateState>) {
  state = {
    ...state,
    ...next,
    currentVersion: app.getVersion(),
    canInstallInApp: canInstallInApp()
  };
  getWindow?.()?.webContents.send('app-update:state', state);
}

function releaseNotesText(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes;
  if (typeof notes === 'string') return notes.trim() || undefined;
  if (!Array.isArray(notes)) return undefined;

  const text = notes
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      const note = 'note' in entry ? entry.note : '';
      return `${entry.version ? `v${entry.version}\n` : ''}${note}`;
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return text || undefined;
}

function applyUpdateInfo(info: UpdateInfo, status: 'available' | 'not-available' | 'downloaded') {
  publishState({
    status,
    availableVersion: info.version,
    releaseName: info.releaseName ?? undefined,
    releaseNotes: releaseNotesText(info),
    progress: status === 'downloaded' ? 100 : undefined,
    error: undefined,
    errorStage: undefined
  });
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Unknown update error');
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';

  if (/\bpkexec\b.*exited with code 126/i.test(message)) {
    return 'Installation was cancelled in the authorization dialog. Retry installation when you are ready, or use View releases to install manually.';
  }
  if (/\bpkexec\b.*exited with code 127/i.test(message)) {
    return 'Linux could not authorize or run the package installer. Check that your desktop authorization agent is available and that the package matches your distribution. Use View releases to install manually.';
  }
  if (/\b(?:pkexec|gksudo|kdesudo|beesu|sudo)\b.*(?:ENOENT|not found)/i.test(message)) {
    return 'The Linux installation helper is unavailable. Use View releases to download the package for your distribution and install it with your package manager.';
  }

  const missingMetadata = message.match(/Cannot find (latest(?:-[\w-]+)?\.yml) in the latest release artifacts/i);
  if (missingMetadata) {
    return `The latest GitHub release is missing ${missingMetadata[1]}. Wait for the release workflow to finish, then check again. If it has finished, verify that this file is attached to the release.`;
  }

  if (
    /ERR_UPDATER_(LATEST_VERSION_NOT_FOUND|INVALID_RELEASE_FEED|NO_PUBLISHED_VERSIONS)/.test(code) ||
    /Unable to find latest version on GitHub|Cannot parse releases feed|No published versions on GitHub|HttpError: 406/i.test(message)
  ) {
    return 'Could not read GitHub’s release feed. Confirm a public release is published (not a draft) and includes the updater metadata files.';
  }

  // HttpError messages include every response header, which is noisy and can
  // expose infrastructure details in the About page. Keep only the useful part.
  const conciseMessage = message
    .split(/\n\s*Headers:\s*\{/i, 1)[0]
    .replace(/\s+/g, ' ')
    .trim();
  return conciseMessage.length > 320 ? `${conciseMessage.slice(0, 317)}…` : conciseMessage;
}

async function checkForUpdates(): Promise<AppUpdateState> {
  if (!app.isPackaged) {
    publishState({ status: 'unsupported', error: 'Update checks are available in the installed app.' });
    return state;
  }

  if (process.platform !== 'linux' && process.platform !== 'darwin' && process.platform !== 'win32') {
    publishState({ status: 'unsupported', error: 'Updates are not configured for this platform.' });
    return state;
  }

  if (checkInProgress) return checkInProgress;
  if (state.status === 'downloading' || state.status === 'installing') return state;

  checkInProgress = (async () => {
    hasDownloadedUpdate = false;
    publishState({ status: 'checking', availableVersion: undefined, releaseName: undefined, releaseNotes: undefined, progress: undefined, error: undefined, errorStage: undefined });
    try {
      const result = await autoUpdater.checkForUpdates();
      // The updater emits the corresponding events. Keep a fallback for providers
      // that resolve the check without emitting one (for example, identical versions).
      if (state.status === 'checking' && result) {
        if (result.isUpdateAvailable) applyUpdateInfo(result.updateInfo, 'available');
        else applyUpdateInfo(result.updateInfo, 'not-available');
      } else if (state.status === 'checking') {
        publishState({ status: 'error', errorStage: 'check', error: 'The update check did not return a result. Please try again.' });
      }
    } catch (error) {
      publishState({ status: 'error', errorStage: 'check', error: errorText(error) });
    }
    return state;
  })();

  try {
    return await checkInProgress;
  } finally {
    checkInProgress = null;
  }
}

export function registerUpdater(getWin: () => BrowserWindow | null) {
  getWindow = getWin;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // This app is distributing preview builds through GitHub Releases. Checking
  // the Atom releases feed also works when the newest published release is
  // marked as a GitHub prerelease (the /releases/latest endpoint excludes it).
  autoUpdater.allowPrerelease = true;

  autoUpdater.on('checking-for-update', () => {
    publishState({ status: 'checking', error: undefined, errorStage: undefined });
  });
  autoUpdater.on('update-available', (info) => applyUpdateInfo(info, 'available'));
  autoUpdater.on('update-not-available', (info) => applyUpdateInfo(info, 'not-available'));
  autoUpdater.on('download-progress', (progress) => {
    publishState({ status: 'downloading', progress: Math.max(0, Math.min(100, progress.percent)), error: undefined });
  });
  autoUpdater.on('update-downloaded', (info) => {
    hasDownloadedUpdate = true;
    applyUpdateInfo(info, 'downloaded');
  });
  autoUpdater.on('error', (error) => {
    const errorStage = state.status === 'installing' || state.errorStage === 'install'
      ? 'install'
      : state.status === 'downloading' ? 'download' : 'check';
    publishState({ status: 'error', errorStage, error: errorText(error) });
  });

  ipcMain.handle('app-update:get-state', () => state);
  ipcMain.handle('app-update:check', () => checkForUpdates());
  ipcMain.handle('app-update:download', async () => {
    if (!canInstallInApp()) {
      publishState({ status: 'unsupported', error: 'Download the macOS update from the release page.' });
      return state;
    }
    if (state.status !== 'available') return state;

    publishState({ status: 'downloading', progress: 0, error: undefined, errorStage: undefined });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      publishState({ status: 'error', errorStage: 'download', error: errorText(error) });
    }
    return state;
  });
  ipcMain.handle('app-update:install', () => {
    const retry = state.status === 'error' && state.errorStage === 'install';
    if (!canInstallInApp() || !hasDownloadedUpdate || (state.status !== 'downloaded' && !retry)) return false;
    publishState({ status: 'installing', error: undefined, errorStage: undefined });
    try {
      // Linux installers can report failure through the error event without
      // throwing. Do not tell the renderer that the installation succeeded.
      autoUpdater.quitAndInstall(false, true);
      return state.errorStage !== 'install';
    } catch (error) {
      publishState({ status: 'error', errorStage: 'install', error: errorText(error) });
      return false;
    }
  });
  ipcMain.handle('app-update:open-release-page', async () => {
    await shell.openExternal(releasePageUrl);
  });

  // Start quietly after the window has had time to open. The About page can read
  // the latest state later, so no startup toast or renderer listener is required.
  if (app.isPackaged && (process.platform === 'linux' || process.platform === 'darwin' || process.platform === 'win32')) {
    const timer = setTimeout(() => void checkForUpdates(), 5000);
    timer.unref();
  }
}
