import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  X,
  Play,
  Copy,
  Trash2,
  ExternalLink,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  Minimize2,
  Check
} from 'lucide-react';
import { useApp } from '../../store';
import { api } from '../../lib/api';

interface CommandLog {
  id: string;
  command: string;
  timestamp: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

const PRESET_COMMANDS = [
  'git status -s',
  'git log --oneline -5',
  'git diff --stat',
  'git branch -a',
  'git remote -v',
  'git stash list'
];

export function TerminalDrawer() {
  const isOpen = useApp((s) => s.terminalDrawerOpen);
  const height = useApp((s) => s.terminalDrawerHeight);
  const setHeight = useApp((s) => s.setTerminalDrawerHeight);
  const close = () => useApp.setState({ terminalDrawerOpen: false });
  const activeTab = useApp((s) => s.activeTab);
  const refresh = useApp((s) => s.refresh);
  const notify = useApp((s) => s.notify);

  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [logs]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleResize = (e: React.MouseEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: MouseEvent) => {
      setHeight(startH - (ev.clientY - startY));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const runCmd = async (cmdToRun: string) => {
    const trimmed = cmdToRun.trim();
    if (!trimmed || isRunning) return;

    setIsRunning(true);
    setCommand('');
    setHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)]);
    setHistoryIndex(-1);

    const startTime = Date.now();
    try {
      const res = await api.runCommand(trimmed);
      const durationMs = Date.now() - startTime;

      const logEntry: CommandLog = {
        id: `${Date.now()}-${Math.random()}`,
        command: trimmed,
        timestamp: new Date().toLocaleTimeString(),
        stdout: res.stdout || '',
        stderr: res.stderr || (res.error ? String(res.error) : ''),
        exitCode: res.exitCode ?? (res.ok ? 0 : 1),
        durationMs
      };

      setLogs((prev) => [...prev, logEntry]);

      // If a git command modified repo state (e.g. checkout, add, commit, rebase), refresh UI
      if (
        trimmed.startsWith('git ') &&
        !trimmed.startsWith('git log') &&
        !trimmed.startsWith('git status') &&
        !trimmed.startsWith('git diff')
      ) {
        void refresh();
      }
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          command: trimmed,
          timestamp: new Date().toLocaleTimeString(),
          stdout: '',
          stderr: String(err),
          exitCode: 1,
          durationMs: Date.now() - startTime
        }
      ]);
    } finally {
      setIsRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void runCmd(command);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = historyIndex + 1 < history.length ? historyIndex + 1 : historyIndex;
        setHistoryIndex(nextIdx);
        setCommand(history[nextIdx] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCommand(history[nextIdx] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  };

  const copyLog = (log: CommandLog) => {
    const text = `$ ${log.command}\n${log.stdout || ''}${log.stderr || ''}`;
    void navigator.clipboard.writeText(text);
    setCopiedLogId(log.id);
    setTimeout(() => setCopiedLogId(null), 1500);
  };

  const copyAll = () => {
    const text = logs
      .map((l) => `$ ${l.command}\n${l.stdout || ''}${l.stderr || ''}`)
      .join('\n\n');
    void navigator.clipboard.writeText(text);
    notify('success', 'Terminal output copied to clipboard');
  };

  if (!isOpen) return null;

  const currentHeight = isMaximized ? '75vh' : `${height}px`;

  return (
    <div
      className="relative flex flex-col bg-panel border-t border-edge z-20 shrink-0 shadow-2xl overflow-hidden font-mono transition-all duration-150"
      style={{ height: currentHeight }}
    >
      {/* Draggable resize handle */}
      {!isMaximized && (
        <div
          className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-accent/50 transition-colors z-30"
          title="Drag to resize terminal drawer"
          onMouseDown={handleResize}
        />
      )}

      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-edge bg-panel2/70 text-xs select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon size={14} className="text-purple-400" />
          <span className="font-semibold text-fg tracking-wide font-sans">TERMINAL</span>
          <span className="text-dim text-[11px] truncate max-w-xs">{activeTab}</span>
        </div>

        {/* Quick Presets */}
        <div className="hidden md:flex items-center gap-1.5 ml-4 flex-1">
          {PRESET_COMMANDS.map((preset) => (
            <button
              key={preset}
              onClick={() => void runCmd(preset)}
              disabled={isRunning}
              className="px-1.5 py-0.5 rounded text-[10px] bg-panel3 hover:bg-panel border border-edge text-dim hover:text-fg transition-colors cursor-pointer"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMaximized((m) => !m)}
            className="btn-icon !w-6 !h-6"
            title={isMaximized ? 'Restore height' : 'Maximize terminal'}
          >
            {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button
            onClick={copyAll}
            disabled={logs.length === 0}
            className="btn-icon !w-6 !h-6"
            title="Copy all output"
          >
            <Copy size={12} />
          </button>
          <button
            onClick={() => setLogs([])}
            disabled={logs.length === 0}
            className="btn-icon !w-6 !h-6"
            title="Clear output"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={() => void api.openTerminal()}
            className="btn-icon !w-6 !h-6"
            title="Open external terminal"
          >
            <ExternalLink size={12} />
          </button>
          <button
            onClick={close}
            className="btn-icon !w-6 !h-6 hover:text-fg text-dim"
            title="Close terminal drawer (Ctrl+`)"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-3 text-xs space-y-3 bg-[#0d1117] selection:bg-accent/30"
      >
        {logs.length === 0 && (
          <div className="text-faint italic select-none text-[11px]">
            Git Workbench Embedded Terminal — Execute Git or shell commands in repository root. Type command below and press Enter.
          </div>
        )}

        {logs.map((log) => (
          <div key={log.id} className="space-y-1 group">
            <div className="flex items-center gap-2 text-dim text-[11px] select-none">
              <span className="text-emerald-400 font-semibold">$</span>
              <span className="code-surface text-fg font-medium break-all">{log.command}</span>
              <span className="flex-1" />
              <button
                onClick={() => copyLog(log)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-panel3 text-dim hover:text-fg transition-opacity"
                title="Copy command output"
              >
                {copiedLogId === log.id ? (
                  <Check size={11} className="text-add" />
                ) : (
                  <Copy size={11} />
                )}
              </button>
              <span className="text-[10px] text-faint">{log.timestamp}</span>
              <span className="text-[10px] text-faint">({log.durationMs}ms)</span>
              {log.exitCode === 0 ? (
                <span className="inline-flex items-center gap-0.5 text-add text-[10px]">
                  <CheckCircle2 size={10} /> 0
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-del text-[10px]">
                  <AlertCircle size={10} /> {log.exitCode}
                </span>
              )}
            </div>

            {log.stdout && (
              <pre
                className="code-surface text-fg/90 whitespace-pre-wrap pl-3 border-l-2 border-accent/30 overflow-x-auto"
              >
                {log.stdout}
              </pre>
            )}

            {log.stderr && (
              <pre
                className="code-surface text-red-300 whitespace-pre-wrap pl-3 border-l-2 border-red-500/50 overflow-x-auto"
              >
                {log.stderr}
              </pre>
            )}
          </div>
        ))}
      </div>

      {/* Terminal Input Line */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-edge bg-panel2/80">
        <span className="text-emerald-400 font-bold select-none text-sm">$</span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
          placeholder="Enter command (e.g. git status, git log -n 5, npm test)…"
          className="code-surface flex-1 min-w-0 bg-transparent text-fg outline-hidden border-none p-0 focus:ring-0 placeholder:text-dim"
        />
        {isRunning ? (
          <Loader2 size={14} className="animate-spin text-accent shrink-0" />
        ) : (
          <button
            onClick={() => void runCmd(command)}
            disabled={!command.trim() || isRunning}
            className="p-1 rounded text-dim hover:text-fg hover:bg-panel3 disabled:opacity-30 transition-colors"
            title="Run command (Enter)"
          >
            <Play size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
