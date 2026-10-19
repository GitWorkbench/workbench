// @vitest-environment jsdom
import './setup';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ render: vi.fn(), createRoot: vi.fn(), App: () => null, SettingsPage: () => null }));
vi.mock('react-dom/client', () => ({ createRoot: mock.createRoot }));
vi.mock('../../src/renderer/App', () => ({ App: mock.App }));
vi.mock('../../src/renderer/components/Settings/SettingsPage', () => ({ SettingsPage: mock.SettingsPage }));
describe('renderer boot entrypoint', () => {
  it('mounts the application in strict mode on its root element', async () => { const root = document.createElement('div'); root.id = 'root'; document.body.append(root); mock.createRoot.mockReturnValue({ render: mock.render }); await import('../../src/renderer/index'); expect(mock.createRoot).toHaveBeenCalledWith(root); expect(mock.render).toHaveBeenCalledOnce(); const element = mock.render.mock.calls[0][0]; expect(element.type).toBe(React.StrictMode); expect(element.props.children.type).toBe(mock.App); root.remove(); });
  it('keeps the settings modal export compatible with the settings page', async () => { const { SettingsModal } = await import('../../src/renderer/components/Settings/SettingsModal'); expect(SettingsModal).toBe(mock.SettingsPage); });
});
