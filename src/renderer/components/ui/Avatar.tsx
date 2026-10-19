import React from 'react';

const PALETTE = ['#4f8cff', '#9b7bff', '#4fc3f7', '#66bb6a', '#ffb74d', '#ef6c9a', '#26c6da', '#ab47bc'];

function hashHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function gravatarUrl(hash: string, size = 40): string {
  return `https://www.gravatar.com/avatar/${hash}?d=retro&s=${size}`;
}

export function Avatar({
  name,
  email,
  avatarHash,
  size = 18
}: {
  name: string;
  email?: string;
  /** MD5 of the normalized email, computed in the main process */
  avatarHash?: string;
  size?: number;
}) {
  const color = hashHue(email || name || '?');
  const px = Math.max(2 * Math.ceil(size / 2), 32);
  const [failed, setFailed] = React.useState(false);
  const useImage = !!avatarHash && !failed;
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold shrink-0 select-none overflow-hidden"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        background: useImage ? undefined : `${color}33`,
        color,
        border: `1px solid ${color}55`
      }}
      title={name}
    >
      {useImage ? (
        <img
          src={gravatarUrl(avatarHash!, px)}
          width={size}
          height={size}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
          draggable={false}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}
