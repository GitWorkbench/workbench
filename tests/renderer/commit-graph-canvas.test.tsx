// @vitest-environment jsdom
import './setup';
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GitGraphCanvas } from '../../src/renderer/components/CommitGraph/GitGraphCanvas';
import type { GitGraphData } from '../../src/renderer/components/CommitGraph/gitgraph';

const graph: GitGraphData = {
  width: 140, height: 90,
  branchesPaths: [{ name: 'main', color: '#26c6da', d: 'M 0 0 L 0 30' }],
  commits: [
    { hash: 'first', shortHash: 'first', x: 0, y: 0, color: '#26c6da', authorName: 'Alice Example', avatarHash: 'avatar', hasRefs: true },
    { hash: 'second', shortHash: 'second', x: 30, y: 30, color: '#4f8cff', authorName: 'Bob Example', hasRefs: false },
    { hash: 'third', shortHash: 'third', x: 0, y: 60, color: '#26c6da', hasRefs: true }
  ]
};

describe('commit graph SVG canvas', () => {
  it('renders branch rails, avatar clipping and author initials at the configured geometry', () => {
    const { container } = render(<GitGraphCanvas graphData={graph} rowTop={30} rowH={30} laneW={40} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '140');
    expect(container.querySelector('svg')).toHaveAttribute('height', '150');
    expect(container.querySelector('svg > g')).toHaveAttribute('transform', 'translate(28, 45)');
    expect(container.querySelector('path')).toHaveAttribute('d', 'M 0 0 L 0 30');
    expect(container.querySelector('image')).toHaveAttribute('href', 'https://www.gravatar.com/avatar/avatar?d=retro&s=48');
    expect(container.querySelector('image')).toHaveAttribute('clip-path', 'url(#avatar-clip-first)');
    expect(container.querySelectorAll('line')).toHaveLength(2);
    expect(Array.from(container.querySelectorAll('text')).map(node => node.textContent)).toEqual(['BE', '?']);
  });

  it('falls back to author initials when the Gravatar image cannot load', () => {
    const { container } = render(<GitGraphCanvas graphData={graph} />);
    fireEvent.error(container.querySelector('image')!);
    expect(container.querySelector('image')).not.toBeInTheDocument();
    expect(container.querySelector('text')).toHaveTextContent('AE');
  });

  it('emits pointer coordinates, selection and context actions without bubbling row clicks', () => {
    const hover = vi.fn(), select = vi.fn(), context = vi.fn(), parentClick = vi.fn(), parentContext = vi.fn();
    const { container } = render(<div onClick={parentClick} onContextMenu={parentContext}><GitGraphCanvas graphData={graph} onHover={hover} onSelect={select} onContextMenu={context} /></div>);
    const node = container.querySelector('g.cursor-pointer')!;
    fireEvent.mouseEnter(node, { clientX: 120, clientY: 70 });
    expect(hover).toHaveBeenCalledWith('first', { x: 120, y: 70 });
    fireEvent.mouseLeave(node); expect(hover).toHaveBeenLastCalledWith(null);
    fireEvent.click(node); expect(select).toHaveBeenCalledWith('first'); expect(parentClick).not.toHaveBeenCalled();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fireEvent(node, event);
    expect(event.defaultPrevented).toBe(true); expect(context).toHaveBeenCalledWith(expect.anything(), 'first'); expect(parentContext).not.toHaveBeenCalled();
  });

  it('renders selection and hover rings with selection taking precedence', () => {
    const { container, rerender } = render(<GitGraphCanvas graphData={graph} selectedHash="first" hoveredHash="first" />);
    const first = container.querySelector('g.cursor-pointer')!;
    expect(first.querySelector('circle.animate-pulse')).toHaveAttribute('stroke', '#ffffff');
    expect(first.querySelector('circle[opacity="0.8"]')).toBeNull();
    rerender(<GitGraphCanvas graphData={graph} hoveredHash="first" />);
    expect(first.querySelector('circle.animate-pulse')).toBeNull();
    expect(first.querySelector('circle[opacity="0.8"]')).toHaveAttribute('stroke', '#26c6da');
  });

  it('virtualizes avatar nodes and ref connectors using inclusive range boundaries', () => {
    const { container } = render(<GitGraphCanvas graphData={graph} visibleRange={{ startIndex: 1, endIndex: 1 }} />);
    expect(container.querySelectorAll('g.cursor-pointer')).toHaveLength(1);
    expect(container.querySelector('text')).toHaveTextContent('BE');
    expect(container.querySelectorAll('line')).toHaveLength(0);
    expect(container.querySelector('path')).toBeInTheDocument();
  });

  it('connects WIP to the newest commit and renders a dashed working-tree node', () => {
    const { container } = render(<GitGraphCanvas graphData={graph} hasWip rowTop={26} rowH={26} />);
    const connection = container.querySelector('line[stroke-dasharray="3 3"]');
    expect(connection).toHaveAttribute('y1', '-26'); expect(connection).toHaveAttribute('y2', '0');
    expect(container.querySelector('circle[stroke-dasharray="3 2"]')).toHaveAttribute('stroke', '#26c6da');
  });

  it('renders an empty graph and WIP-only graph with default colors without interaction handlers', () => {
    const empty = { commits: [], branchesPaths: [], width: 80, height: 26 };
    const { container, rerender } = render(<GitGraphCanvas graphData={empty} />);
    expect(container.querySelector('svg')).toBeInTheDocument(); expect(container.querySelectorAll('circle')).toHaveLength(0);
    rerender(<GitGraphCanvas graphData={empty} hasWip />);
    expect(container.querySelector('circle')).toHaveAttribute('stroke', '#26c6da'); expect(container.querySelector('line')).toBeNull();
    rerender(<GitGraphCanvas graphData={graph} />);
    const node = container.querySelector('g.cursor-pointer')!;
    expect(() => { fireEvent.mouseEnter(node); fireEvent.mouseLeave(node); fireEvent.click(node); fireEvent.contextMenu(node); }).not.toThrow();
  });
});
