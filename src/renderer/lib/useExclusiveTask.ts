import { useRef, useState } from 'react';

/** Reserve a UI operation synchronously, before React renders disabled controls. */
export function useExclusiveTask() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try { await task(); }
    finally { running.current = false; setBusy(false); }
  };
  return { busy, run };
}
