import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerWindowRecovery, type RecoverableWebContents, type RecoverableWindow, type WindowRecoveryEvents } from '../../src/main/window-recovery';

function setup(window: RecoverableWindow | null = null) {
  let wake: (() => void) | undefined;
  let childGone: ((type: string) => void) | undefined;
  let rendererGone: ((contents: RecoverableWebContents) => void) | undefined;
  const events: WindowRecoveryEvents = {
    onWake: listener => { wake = listener; },
    onChildProcessGone: listener => { childGone = listener; },
    onRendererGone: listener => { rendererGone = listener; }
  };
  const getWindow = vi.fn(() => window);
  registerWindowRecovery(getWindow, events);
  return {
    getWindow,
    wake: () => wake?.(),
    childGone: (type: string) => childGone?.(type),
    rendererGone: (contents: RecoverableWebContents) => rendererGone?.(contents),
    setWindow: (next: RecoverableWindow | null) => { window = next; }
  };
}

function makeWindow() {
  const webContents: RecoverableWebContents = {
    isCrashed: vi.fn(() => false),
    isLoading: vi.fn(() => false),
    executeJavaScript: vi.fn(() => Promise.resolve(undefined)),
    reload: vi.fn()
  };
  const window: RecoverableWindow = { isDestroyed: vi.fn(() => false), webContents };
  return { window, webContents };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('window recovery after display wake', () => {
  it('nudges a loaded renderer to repaint after the screen unlocks', async () => {
    const { window, webContents } = makeWindow();
    const recovery = setup(window);
    recovery.wake();
    await vi.advanceTimersByTimeAsync(750);
    expect(webContents.executeJavaScript).toHaveBeenCalledOnce();
    expect(webContents.executeJavaScript).toHaveBeenCalledWith('window.dispatchEvent(new Event("resize"))');
    expect(webContents.reload).not.toHaveBeenCalled();
  });

  it('coalesces wake and GPU restart notifications into one redraw', async () => {
    const { window, webContents } = makeWindow();
    const recovery = setup(window);
    recovery.wake();
    await vi.advanceTimersByTimeAsync(500);
    recovery.childGone('GPU');
    recovery.childGone('Utility');
    await vi.advanceTimersByTimeAsync(749);
    expect(webContents.executeJavaScript).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(webContents.executeJavaScript).toHaveBeenCalledOnce();
  });

  it('reloads a crashed renderer after waking', async () => {
    const { window, webContents } = makeWindow();
    vi.mocked(webContents.isCrashed).mockReturnValue(true);
    const recovery = setup(window);
    recovery.wake();
    await vi.advanceTimersByTimeAsync(750);
    expect(webContents.reload).toHaveBeenCalledOnce();
    expect(webContents.executeJavaScript).not.toHaveBeenCalled();
  });

  it('does not interfere with a renderer that is still loading', async () => {
    const { window, webContents } = makeWindow();
    vi.mocked(webContents.isLoading).mockReturnValue(true);
    const recovery = setup(window);
    recovery.wake();
    await vi.advanceTimersByTimeAsync(750);
    expect(webContents.executeJavaScript).not.toHaveBeenCalled();
    expect(webContents.reload).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'missing', missing: true, destroyed: false },
    { label: 'destroyed', missing: false, destroyed: true }
  ])('ignores a $label window when the wake timer fires', async testCase => {
    const { window, webContents } = makeWindow();
    if (testCase.destroyed) vi.mocked(window.isDestroyed).mockReturnValue(true);
    const recovery = setup(testCase.missing ? null : window);
    recovery.wake();
    await vi.advanceTimersByTimeAsync(750);
    expect(webContents.executeJavaScript).not.toHaveBeenCalled();
  });

  it('reloads only if a failed redraw still belongs to a live window', async () => {
    const { window, webContents } = makeWindow();
    vi.mocked(webContents.executeJavaScript).mockRejectedValue(new Error('renderer unavailable'));
    const recovery = setup(window);
    recovery.wake();
    await vi.advanceTimersByTimeAsync(750);
    await Promise.resolve();
    expect(webContents.reload).toHaveBeenCalledOnce();

    vi.mocked(window.isDestroyed).mockReturnValue(true);
    recovery.wake();
    await vi.advanceTimersByTimeAsync(750);
    await Promise.resolve();
    expect(webContents.reload).toHaveBeenCalledOnce();
  });

  it('does not reload if the window closes while a redraw is being rejected', async () => {
    const { window, webContents } = makeWindow();
    vi.mocked(webContents.executeJavaScript).mockImplementation(() => new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error('renderer closed')), 10);
    }));
    const recovery = setup(window);
    recovery.wake();
    await vi.advanceTimersByTimeAsync(750);
    vi.mocked(window.isDestroyed).mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(webContents.reload).not.toHaveBeenCalled();
  });

  it('reloads the active window after its renderer exits, but ignores other renderers', async () => {
    const { window, webContents } = makeWindow();
    const recovery = setup(window);
    const otherContents = makeWindow().webContents;
    recovery.rendererGone(otherContents);
    recovery.rendererGone(webContents);
    await vi.advanceTimersByTimeAsync(0);
    expect(webContents.reload).toHaveBeenCalledOnce();
    expect(otherContents.reload).not.toHaveBeenCalled();
  });

  it('ignores renderer exits when there is no live main window', async () => {
    const { window, webContents } = makeWindow();
    vi.mocked(window.isDestroyed).mockReturnValue(true);
    const recovery = setup(null);
    recovery.rendererGone(webContents);
    recovery.setWindow(window);
    recovery.rendererGone(webContents);
    await vi.advanceTimersByTimeAsync(0);
    expect(webContents.reload).not.toHaveBeenCalled();
  });

  it('does not reload a renderer after its window has been replaced or closed', async () => {
    const { window, webContents } = makeWindow();
    const replacement = makeWindow();
    const recovery = setup(window);
    recovery.rendererGone(webContents);
    recovery.setWindow(replacement.window);
    await vi.advanceTimersByTimeAsync(0);
    expect(webContents.reload).not.toHaveBeenCalled();

    recovery.setWindow(window);
    recovery.rendererGone(webContents);
    vi.mocked(window.isDestroyed).mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(webContents.reload).not.toHaveBeenCalled();
  });
});
