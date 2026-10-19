import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useApp } from '../../store';
import type { ResolutionMemoryState } from '../../../shared/types';

export function ResolutionMemoryModal() {
  const open = useApp(s => s.resolutionMemoryOpen), repo = useApp(s => s.activeTab);
  return open && repo ? <MemorySettings key={repo} /> : null;
}
function MemorySettings() {
  const [state, setState] = useState<ResolutionMemoryState | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let live = true; void api.getResolutionMemory().then(s => { if (live) setState(s); }).catch(e => { if (live) setError(String(e)); }); return () => { live = false; }; }, []);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"><div role="dialog" aria-modal="true" aria-label="Conflict resolution memory" className="w-full max-w-lg rounded-xl border border-edge bg-panel p-5 shadow-2xl"><header className="mb-4 flex items-center"><h2 className="flex-1 text-sm font-semibold">Conflict Resolution Memory</h2><button className="btn-icon" title="Close" disabled={busy} onClick={() => useApp.setState({ resolutionMemoryOpen: false })}><X size={15} /></button></header><p className="mb-4 text-xs text-dim">Remember reviewed text resolutions in this repository and offer them when the same conflict occurs again. Preview a suggestion in the merge editor before loading it into your result. Nothing is staged until you explicitly apply it.</p><label className="flex items-center gap-3 rounded border border-edge p-3 text-xs"><input type="checkbox" checked={state?.enabled || false} disabled={!state || busy} onChange={async e => { setBusy(true); setError(''); try { setState(await api.setResolutionMemory(e.target.checked)); } catch (error) { setError(String(error)); } finally { setBusy(false); } }} />Remember and suggest resolutions {busy && <Loader2 size={13} className="animate-spin" />}</label><p className="mt-3 text-xs text-dim">{state ? `${state.remembered} remembered conflict patterns in Git's local cache.` : 'Loading…'} Disabling memory keeps previously saved patterns.</p>{state?.gitAutomatic && <p className="mt-3 text-xs text-warn">Git’s own automatic rerere is also enabled in your Git configuration. Git may already fill working files during merge/rebase; review those results before staging them.</p>}<p className="mt-3 text-xs text-faint">Enabling this mode turns off Git’s automatic application in this repository so results can be reviewed first. Disabling memory keeps automatic application off. Suggestions support text conflicts; binary, submodule, and delete-only conflicts still need an explicit file choice.</p>{error && <p role="alert" className="mt-3 text-xs text-del">{error}</p>}</div></div>;
}
