// @vitest-environment jsdom
import './setup';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, gravatarUrl, initials } from '../../src/renderer/components/ui/Avatar';

describe('author avatars', () => {
  it.each([['', '?'], ['   ', '?'], ['alice', 'AL'], ['a', 'A'], [' Alice  Bob Smith ', 'AS'], ['Élodie Martin', 'ÉM']])('derives initials for %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
  it('uses Gravatar at a suitable even pixel size and falls back after image failure', () => {
    expect(gravatarUrl('hash')).toBe('https://www.gravatar.com/avatar/hash?d=retro&s=40');
    const { container } = render(<Avatar name="Alice Smith" avatarHash="hash" size={35} />);
    const image = screen.getByRole('img', { name: 'Alice Smith' });
    expect(image).toHaveAttribute('src', gravatarUrl('hash', 36));
    expect(image).toHaveAttribute('draggable', 'false');
    expect(container.firstChild).toHaveStyle({ width: '35px', height: '35px', fontSize: '15.4px' });
    fireEvent.error(image);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('AS')).toBeVisible();
  });
  it('uses an email-stable palette and minimum image resolution', () => {
    const { container, rerender } = render(<Avatar name="Alice" email="same@example.test" />);
    const color = (container.firstChild as HTMLElement).style.color;
    rerender(<Avatar name="Bob" email="same@example.test" />);
    expect((container.firstChild as HTMLElement).style.color).toBe(color);
    rerender(<Avatar name="" />);
    expect(screen.getByText('?')).toBeVisible();
    rerender(<Avatar name="Tiny" avatarHash="tiny" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', gravatarUrl('tiny', 32));
  });
});
