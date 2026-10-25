import { create } from 'zustand';
import type { AppUpdateState } from '../../shared/types';
import { api } from '../lib/api';

interface Updates {
  update: AppUpdateState | null;
  dialogOpen: boolean;
  dismissedVersion: string | null;
  busy: boolean;
  actionError: string | null;
  receive: (update: AppUpdateState) => void;
  show: () => void;
  dismiss: () => void;
  act: () => Promise<void>;
}

export const useAppUpdates = create<Updates>((set, get) => ({
  update: null, dialogOpen: false, dismissedVersion: null, busy: false, actionError: null,
  receive: update => set(current => ({
    update,
    dialogOpen: current.dialogOpen || (Boolean(update.availableVersion) && update.availableVersion !== current.dismissedVersion && (update.status === 'available' || update.status === 'downloaded'))
  })),
  show: () => set({ dialogOpen: true, actionError: null }),
  dismiss: () => set({ dialogOpen: false, dismissedVersion: get().update?.availableVersion ?? null, actionError: null }),
  act: async () => {
    const { update, busy } = get();
    if (!update || busy) return;
    set({ busy: true, actionError: null });
    try {
      if (update.status === 'downloaded' || (update.status === 'error' && update.errorStage === 'install')) {
        if (!await api.installAppUpdate()) set({ actionError: 'Installation could not start. Retry or open the release page to install manually.' });
      } else if (!update.canInstallInApp) {
        await api.openAppReleasePage();
      } else {
        // A failed download must be checked again before it can be retried.
        const next = update.status === 'available' ? update : await api.checkForAppUpdates();
        get().receive(next);
        if (next.status === 'available') get().receive(await api.downloadAppUpdate());
      }
    } catch (error) {
      set({ actionError: error instanceof Error ? error.message : 'The update action failed. Please try again.' });
    } finally {
      set({ busy: false });
    }
  }
}));

/** Subscribe before reading the snapshot so startup results cannot be missed. */
export function connectAppUpdates() {
  let active = true;
  let eventReceived = false;
  const unsubscribe = api.onAppUpdateState(update => {
    eventReceived = true;
    if (active) useAppUpdates.getState().receive(update);
  });
  void api.getAppUpdateState().then(update => {
    if (active && !eventReceived) useAppUpdates.getState().receive(update);
  }).catch(() => {});
  return () => { active = false; unsubscribe(); };
}
