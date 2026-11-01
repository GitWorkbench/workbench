export interface RecoverableWebContents {
  isCrashed(): boolean;
  isLoading(): boolean;
  executeJavaScript(code: string): Promise<unknown>;
  reload(): void;
}

export interface RecoverableWindow {
  isDestroyed(): boolean;
  webContents: RecoverableWebContents;
}

export interface WindowRecoveryEvents {
  onWake(listener: () => void): void;
  onChildProcessGone(listener: (type: string) => void): void;
  onRendererGone(listener: (contents: RecoverableWebContents) => void): void;
}

/** Nudge Chromium to repaint after the display returns and recover a lost renderer. */
export function registerWindowRecovery(
  getWindow: () => RecoverableWindow | null,
  events: WindowRecoveryEvents
) {
  let wakeTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleWakeRefresh = () => {
    if (wakeTimer !== null) clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      const window = getWindow();
      if (!window || window.isDestroyed()) return;

      const contents = window.webContents;
      if (contents.isCrashed()) {
        contents.reload();
        return;
      }
      if (contents.isLoading()) return;

      void contents.executeJavaScript('window.dispatchEvent(new Event("resize"))').catch(() => {
        if (!window.isDestroyed()) contents.reload();
      });
    }, 750);
  };

  events.onWake(scheduleWakeRefresh);
  events.onChildProcessGone(type => {
    if (type === 'GPU') scheduleWakeRefresh();
  });
  events.onRendererGone(contents => {
    const window = getWindow();
    if (!window || window.isDestroyed() || window.webContents !== contents) return;

    // Reload on the next turn: Electron can still be completing renderer teardown here.
    setTimeout(() => {
      if (getWindow() === window && !window.isDestroyed()) contents.reload();
    }, 0);
  });
}
