// @vitest-environment jsdom
import './setup';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ app: { milestoneCelebration: null as null | { id: number; kind: 'rebase' | 'conflicts-resolved' }, clearMilestoneCelebration: vi.fn() }, enabled: true }));
vi.mock('../../src/renderer/store', () => ({ useApp: (selector: (state: typeof mocks.app) => unknown) => selector(mocks.app) }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: (selector: (state: { milestoneAnimations: boolean }) => unknown) => selector({ milestoneAnimations: mocks.enabled }) }));
import { MilestoneCelebration } from '../../src/renderer/components/Common/MilestoneCelebration';

beforeEach(() => {
  vi.useRealTimers(); mocks.enabled = true; mocks.app.milestoneCelebration = null; mocks.app.clearMilestoneCelebration.mockReset();
});

describe('subtle milestone celebrations', () => {
  it('renders nothing and schedules no work without a milestone', () => {
    vi.useFakeTimers(); render(<MilestoneCelebration />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument(); expect(vi.getTimerCount()).toBe(0);
  });

  it('shows and clears the rebase celebration after a short timeout', async () => {
    vi.useFakeTimers(); mocks.app.milestoneCelebration = { id: 3, kind: 'rebase' };
    const { unmount } = render(<MilestoneCelebration />);
    expect(screen.getByRole('status')).toHaveTextContent('Rebase completed');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    expect(mocks.app.clearMilestoneCelebration).toHaveBeenCalledWith(3);
    unmount();
  });

  it('shows the resolved-conflict message and cancels its timer on unmount', () => {
    vi.useFakeTimers(); mocks.app.milestoneCelebration = { id: 4, kind: 'conflicts-resolved' };
    const { unmount } = render(<MilestoneCelebration />);
    expect(screen.getByRole('status')).toHaveTextContent('All conflicts resolved');
    expect(vi.getTimerCount()).toBe(1); unmount(); expect(vi.getTimerCount()).toBe(0);
    expect(mocks.app.clearMilestoneCelebration).not.toHaveBeenCalled();
  });

  it('clears pending celebration state immediately when the preference is disabled', async () => {
    vi.useFakeTimers(); mocks.enabled = false; mocks.app.milestoneCelebration = { id: 9, kind: 'rebase' };
    render(<MilestoneCelebration />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await act(async () => { await Promise.resolve(); });
    expect(mocks.app.clearMilestoneCelebration).toHaveBeenCalledWith(9);
    expect(vi.getTimerCount()).toBe(0);
  });
});
