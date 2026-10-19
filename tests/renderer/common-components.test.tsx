// @vitest-environment jsdom
import './setup';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenu } from '../../src/renderer/components/ui/ContextMenu';
import { Dropdown, MenuDivider, MenuItem } from '../../src/renderer/components/ui/Dropdown';
import { TypographySizeControl } from '../../src/renderer/components/Settings/TypographySizeControl';
import { AboutPage } from '../../src/renderer/components/Settings/AboutPage';
import { APP_VERSION } from '../../src/renderer/lib/appVersion';
import packageJson from '../../package.json';

describe('AboutPage', () => {
  it('shows the installed version, developer, support links and embedded updates without implementation details', () => {
    const explore = vi.fn();
    render(<AboutPage installedVersion="0.7.1" onExplore={explore}><section>Software updates</section></AboutPage>);
    expect(screen.getByRole('heading', { name: 'About Git Workbench' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Git Workbench', exact: true })).toBeVisible();
    expect(screen.getByText('Version 0.7.1')).toBeVisible();
    expect(screen.getByText('Naowas Morshed Eimon')).toBeVisible();
    expect(screen.getByText('Software updates')).toBeVisible();
    expect(screen.queryByText(/Built with/i)).not.toBeInTheDocument();
    const destinations = [
      ['View on GitHub', 'https://github.com/GitWorkbench/workbench'],
      ['@naowas', 'https://github.com/naowas'],
      ['GitWorkbench/workbench', 'https://github.com/GitWorkbench/workbench'],
      ['Report an issue or request a feature', 'https://github.com/GitWorkbench/workbench/issues'],
      ['MIT license', 'https://github.com/GitWorkbench/workbench/blob/main/LICENSE']
    ];
    for (const [name, href] of destinations) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
      expect(screen.getByRole('link', { name })).toHaveAttribute('target', '_blank');
      expect(screen.getByRole('link', { name })).toHaveAttribute('rel', 'noopener noreferrer');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Explore Git Workbench' }));
    expect(explore).toHaveBeenCalledOnce();
    expect(APP_VERSION).toBe(packageJson.version);
  });
});

describe('TypographySizeControl', () => {
  const props = {
    id: 'interface-size', label: 'Interface', description: 'Interface text only',
    value: 14, min: 11, max: 16, defaultValue: 13, presets: [11, 13, 16],
    onChange: vi.fn(), preview: 'Readable preview', previewFontVariable: '--font-size-ui'
  };
  it('exposes an accessible range, selected preset, reset and actual-size preview', () => {
    const onChange = vi.fn();
    render(<TypographySizeControl {...props} value={16} onChange={onChange} />);
    const range = screen.getByRole('slider', { name: 'Interface' });
    expect(range).toHaveAttribute('min', '11');
    expect(range).toHaveAttribute('max', '16');
    expect(range).toHaveAttribute('step', '1');
    expect(range).toHaveAttribute('aria-valuetext', '16 pixels');
    expect(range).toHaveAccessibleDescription('Interface text only');
    expect(screen.getByRole('button', { name: 'Interface: 16 pixels' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(range, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Interface: 11 pixels' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset interface to 13 pixels' }));
    expect(onChange.mock.calls).toEqual([[12], [11], [13]]);
    expect(screen.getByText('Readable preview')).toHaveStyle({ fontSize: 'var(--font-size-ui, 16px)', fontFamily: 'var(--font-sans)' });
  });
  it('disables reset at the default and uses the code font only for a monospace preview', () => {
    render(<TypographySizeControl {...props} value={13} monospace />);
    expect(screen.getByRole('button', { name: 'Reset interface to 13 pixels' })).toBeDisabled();
    expect(screen.getByText('Readable preview')).toHaveStyle({ fontFamily: 'var(--font-mono)' });
  });
});

describe('ContextMenu', () => {
  it('runs enabled actions once and closes, preserving disabled/danger/divider/icon states', () => {
    const action = vi.fn(), disabledAction = vi.fn(), onClose = vi.fn();
    const { container } = render(<ContextMenu x={10} y={10} onClose={onClose} items={[
      { label: 'Delete', icon: <span>icon</span>, danger: true, onClick: action },
      { label: 'Blocked', disabled: true, onClick: disabledAction },
      { label: '', divider: true }, { label: 'Inspect' }
    ]} />);
    expect(screen.getByRole('button', { name: 'iconDelete' })).toHaveClass('text-del');
    fireEvent.click(screen.getByRole('button', { name: 'Blocked' }));
    expect(disabledAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'iconDelete' }));
    expect(action).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.border-t')).toBeInTheDocument();
  });
  it('clamps a wide menu inside viewport boundaries', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(240);
    const { container } = render(<ContextMenu x={999} y={999} width={999} items={[{ label: 'One' }]} onClose={vi.fn()} />);
    expect(container.firstChild).toHaveStyle({ width: '304px', left: '8px', top: '158px', maxHeight: '120px' });
  });
  it('enforces minimum width and top-left margins', () => {
    const { container } = render(<ContextMenu x={-10} y={-10} width={10} items={[]} onClose={vi.fn()} />);
    expect(container.firstChild).toHaveStyle({ width: '200px', left: '8px', top: '8px' });
  });
  it('closes on outside pointer, Escape or resize, ignores inside pointer and removes listeners', () => {
    const onClose = vi.fn();
    const { unmount } = render(<ContextMenu x={20} y={20} items={[{ label: 'Inside' }]} onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inside' }));
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.resize(window);
    expect(onClose).toHaveBeenCalledTimes(3);
    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseDown(document.body);
    fireEvent.resize(window);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
  it.each(['click', 'Enter'])('submits a trimmed prompt through %s and retains compact readable button styling', (method) => {
    const onSubmit = vi.fn(), onClose = vi.fn();
    render(<ContextMenu x={0} y={0} onClose={onClose} items={[{ label: 'URL', prompt: { placeholder: 'Remote URL', initial: ' old ', submitLabel: 'Save URL', onSubmit } }]} />);
    const input = screen.getByPlaceholderText('Remote URL');
    expect(input).toHaveValue(' old ');
    expect(input).toHaveFocus();
    const button = screen.getByRole('button', { name: 'Save URL' });
    expect(button).toHaveClass('btn-primary', 'context-menu-prompt-submit');
    fireEvent.change(input, { target: { value: ' git@example.com:owner/project.git ' } });
    if (method === 'click') fireEvent.click(button);
    else fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('git@example.com:owner/project.git');
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('rejects whitespace-only input and ignores unrelated keys', () => {
    const onSubmit = vi.fn(), onClose = vi.fn();
    render(<ContextMenu x={0} y={0} onClose={onClose} items={[{ label: 'Name', prompt: { placeholder: 'Name', submitLabel: 'Rename', onSubmit } }]} />);
    const input = screen.getByPlaceholderText('Name');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.keyDown(input, { key: 'a' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Dropdown', () => {
  it('toggles, positions its menu and closes using the supplied callback', () => {
    render(<Dropdown trigger={<button>Options</button>} align="right" width={321}>{close => <><MenuItem icon={<span>icon</span>} label="Use selection" trailing="Ctrl+U" onClick={close} /><MenuDivider /></>}</Dropdown>);
    expect(screen.queryByText('Use selection')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Options'));
    expect(screen.getByText('Use selection').closest('button')?.parentElement).toHaveStyle({ right: '0px', width: '321px' });
    expect(screen.getByText('Ctrl+U')).toBeVisible();
    fireEvent.mouseDown(screen.getByText('Use selection'));
    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.getByText('Use selection')).toBeVisible();
    fireEvent.click(screen.getByText('Use selection'));
    expect(screen.queryByText('Use selection')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Options'));
    fireEvent.click(screen.getByText('Options'));
    expect(screen.queryByText('Use selection')).not.toBeInTheDocument();
  });
  it.each(['outside', 'Escape'])('dismisses on %s', method => {
    render(<Dropdown trigger={<button>Open</button>}>{() => <MenuItem label="Delete" danger />}</Dropdown>);
    fireEvent.click(screen.getByText('Open'));
    expect(screen.getByText('Delete').closest('button')).toHaveClass('text-del');
    if (method === 'outside') fireEvent.mouseDown(document.body);
    else fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
  it('does not activate a disabled item and supports default left alignment', () => {
    const onClick = vi.fn();
    render(<Dropdown trigger={<button>Open</button>}>{() => <MenuItem label="Unavailable" disabled onClick={onClick} />}</Dropdown>);
    fireEvent.click(screen.getByText('Open'));
    const button = screen.getByRole('button', { name: 'Unavailable' });
    expect(button.parentElement).toHaveStyle({ left: '0px', width: '240px' });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});


describe('AppLogo', () => {
  it('keeps square sizing and enables the pulse only when explicitly requested', async () => {
    const { AppLogo } = await import('../../src/renderer/components/Common/AppLogo');
    const { container, rerender } = render(<AppLogo size={48} className="brand" animated />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '48');
    expect(container.querySelector('svg')).toHaveAttribute('height', '48');
    expect(container.querySelector('svg')).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    rerender(<AppLogo />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '24');
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });
});
