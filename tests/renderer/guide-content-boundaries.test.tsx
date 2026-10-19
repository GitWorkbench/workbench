// @vitest-environment jsdom
import './setup';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ state: { activeTab: '/repo' as string | null, isOpeningRepo: false }, setState: vi.fn(), closeSettings: vi.fn() }));
vi.mock('../../src/renderer/store', () => ({ useApp: Object.assign(
  function useApp<T>(select: (state: typeof mock.state) => T) { return select(mock.state); },
  { getState: () => mock.state, setState: mock.setState }
) }));
vi.mock('../../src/renderer/store/settings', () => ({ useSettings: { getState: () => ({ closeSettings: mock.closeSettings }) } }));
vi.mock('../../src/renderer/components/Help/usageGuideContent', async original => {
  const content = await original<typeof import('../../src/renderer/components/Help/usageGuideContent')>();
  const base = content.guideTopics[0];
  return { ...content, guideTopics: [...content.guideTopics,
    { ...base, id: 'minimal-fixture', title: 'Minimal fixture article', prerequisites: undefined, tips: undefined, caution: undefined, actions: undefined, related: undefined },
    { ...base, id: 'empty-fixture', title: 'Empty fixture article', tips: [], related: [], actions: [{ id: 'terminal', label: 'Open fixture terminal' }] },
    { ...base, id: 'stale-fixture', title: 'Stale fixture article', related: ['removed-guide-reference'] }
  ] };
});
import { UsageGuideModal } from '../../src/renderer/components/Help/UsageGuideModal';
beforeEach(() => {
  localStorage.clear(); mock.state.activeTab = '/repo'; mock.state.isOpeningRepo = false; mock.setState.mockReset(); mock.closeSettings.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
function open(title: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Search Git Workbench guides' }), { target: { value: title } });
  const button = screen.getByRole('heading', { name: title, level: 4 }).closest('button');
  if (!button) throw new Error('Guide card was not an accessible button');
  fireEvent.click(button);
}
it.each(['Minimal fixture article', 'Empty fixture article'])('renders optional sections omitted from %s', title => {
  render(<UsageGuideModal onClose={vi.fn()} />); open(title);
  expect(screen.queryByText('Helpful details')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Continue exploring' })).not.toBeInTheDocument();
});
it('ignores a related article that was removed from the guide catalog', () => {
  render(<UsageGuideModal onClose={vi.fn()} />); open('Stale fixture article');
  expect(screen.getByRole('heading', { name: 'Continue exploring' })).toBeVisible();
  expect(screen.queryByText('removed-guide-reference')).not.toBeInTheDocument();
});
it.each(['closed', 'opening'])('does not launch an operation after the repository becomes %s', reason => {
  const close = vi.fn(); render(<UsageGuideModal onClose={close} />); open('Empty fixture article');
  const action = screen.getByRole('button', { name: 'Open fixture terminal' }); expect(action).toBeEnabled();
  if (reason === 'closed') mock.state.activeTab = null; else mock.state.isOpeningRepo = true;
  fireEvent.click(action); expect(close).not.toHaveBeenCalled(); expect(mock.setState).not.toHaveBeenCalled();
});
it('ignores a queued focus-trap callback after its dialog unmounts', () => {
  const listeners = vi.spyOn(window, 'addEventListener');
  const { unmount } = render(<UsageGuideModal onClose={vi.fn()} />);
  const callback = listeners.mock.calls.find(([name]) => name === 'keydown')?.[1];
  expect(typeof callback).toBe('function'); unmount();
  if (typeof callback === 'function') expect(() => callback(new KeyboardEvent('keydown', { key: 'Tab' }))).not.toThrow();
});
