import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as pty from 'node-pty';
import type { TerminalEvent, TerminalSession } from '../shared/types';

const HISTORY_LIMIT = 256 * 1024;

interface Session {
  state: TerminalSession;
  process: pty.IPty;
  owner: WebContents;
  listeners: pty.IDisposable[];
  pending: Map<number, number>;
  pendingSize: number;
  paused: boolean;
  attached: boolean;
}

export function registerTerminal(getWindow: () => BrowserWindow | null, getRepo: () => string | null) {
  const sessions = new Map<string, Session>();
  const owners = new Set<WebContents>();
  const dispose = (session: Session) => {
    sessions.delete(session.state.id);
    session.listeners.forEach(listener => listener.dispose());
    if (session.state.exitCode === undefined) session.process.kill();
  };
  app.once('before-quit', () => { for (const session of sessions.values()) dispose(session); });

  const owner = (event: IpcMainInvokeEvent) => {
    if (getWindow()?.webContents !== event.sender || event.sender.isDestroyed()) throw new Error('Terminal access is unavailable.');
    return event.sender;
  };
  const find = (event: IpcMainInvokeEvent, id: string) => {
    const sender = owner(event);
    const session = sessions.get(id);
    if (!session || session.owner !== sender) throw new Error('This terminal session has closed. Open a new terminal.');
    return session;
  };
  const dimensions = (cols: number, rows: number) => {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || cols > 500 || rows < 1 || rows > 300) {
      throw new Error('Invalid terminal dimensions.');
    }
  };
  const send = (session: Session, event: TerminalEvent) => {
    if (!session.owner.isDestroyed()) session.owner.send('terminal:event', event);
  };

  ipcMain.handle('terminal:open', (event, repoPath: string, cols: number, rows: number): TerminalSession => {
    const sender = owner(event);
    dimensions(cols, rows);
    if (typeof repoPath !== 'string' || !path.isAbsolute(repoPath) || repoPath !== getRepo()) {
      throw new Error('The active repository changed. Reopen the terminal in the selected repository.');
    }
    const existing = [...sessions.values()].find(session => session.owner === sender && session.state.repoPath === repoPath);
    if (existing) {
      existing.state.connectionId = randomUUID();
      existing.attached = true;
      if (existing.state.exitCode === undefined) existing.process.resize(cols, rows);
      existing.pending.clear();
      existing.pendingSize = 0;
      if (existing.paused) { existing.process.resume(); existing.paused = false; }
      return { ...existing.state };
    }
    if (sessions.size >= 8) throw new Error('Eight repository terminals are already open. Stop a session in another repository before opening a new one.');
    // A terminal owns its interactive environment. Remove Electron/Node launch
    // overrides and inherited Git repository/index overrides from the parent app.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:ELECTRON_|NODE_OPTIONS$|NODE_CHANNEL_FD$|GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES)$)/.test(key)));
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
    const args = process.platform === 'win32' ? ['-NoLogo'] : ['-l'];
    const child = pty.spawn(shell, args, { name: 'xterm-256color', cols, rows, cwd: repoPath, env: { ...env, TERM_PROGRAM: 'git-workbench', COLORTERM: 'truecolor' } });
    const state: TerminalSession = { id: randomUUID(), connectionId: randomUUID(), repoPath, shell: path.basename(shell), output: '', sequence: 0 };
    const session: Session = { state, process: child, owner: sender, listeners: [], pending: new Map(), pendingSize: 0, paused: false, attached: true };
    sessions.set(state.id, session);
    session.listeners.push(child.onData(data => {
      state.output = (state.output + data).slice(-HISTORY_LIMIT);
      state.sequence++;
      if (!session.attached) return;
      session.pending.set(state.sequence, data.length);
      session.pendingSize += data.length;
      send(session, { id: state.id, sequence: state.sequence, type: 'data', data });
      if (!session.paused && session.pendingSize >= HISTORY_LIMIT) {
        child.pause(); session.paused = true;
      }
    }), child.onExit(({ exitCode }) => {
      state.exitCode = exitCode;
      state.sequence++;
      send(session, { id: state.id, sequence: state.sequence, type: 'exit', exitCode });
    }));
    if (!owners.has(sender)) {
      owners.add(sender);
      sender.once('destroyed', () => {
        for (const entry of sessions.values()) if (entry.owner === sender) dispose(entry);
        owners.delete(sender);
      });
    }
    return { ...state };
  });
  ipcMain.handle('terminal:write', (event, id: string, data: string) => {
    const session = find(event, id);
    if (typeof data !== 'string' || data.length > 64 * 1024) throw new Error('Terminal input is too large. Paste smaller sections.');
    if (session.state.exitCode !== undefined) throw new Error('The shell has exited. Restart the terminal to continue.');
    session.process.write(data);
  });
  ipcMain.handle('terminal:resize', (event, id: string, cols: number, rows: number) => {
    const session = find(event, id);
    dimensions(cols, rows);
    if (session.state.exitCode === undefined) session.process.resize(cols, rows);
  });
  ipcMain.handle('terminal:acknowledge', (event, id: string, sequence: number) => {
    const session = find(event, id);
    if (!Number.isInteger(sequence) || sequence < 0 || sequence > session.state.sequence) throw new Error('Invalid terminal output acknowledgement.');
    for (const [key, size] of session.pending) if (key <= sequence) { session.pending.delete(key); session.pendingSize -= size; }
    if (session.paused && session.pendingSize < HISTORY_LIMIT / 4) {
      session.process.resume(); session.paused = false;
    }
  });
  ipcMain.handle('terminal:close', (event, id: string) => dispose(find(event, id)));
  ipcMain.handle('terminal:detach', (event, id: string, connectionId: string) => {
    const session = find(event, id);
    if (connectionId !== session.state.connectionId) return;
    session.attached = false;
    session.pending.clear();
    session.pendingSize = 0;
    if (session.paused) { session.process.resume(); session.paused = false; }
  });
}
