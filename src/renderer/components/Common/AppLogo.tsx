import React from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

export function AppLogo({ size = 24, className = '', animated = false }: AppLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: size, height: size, aspectRatio: '1 / 1' }}
      className={`block shrink-0 select-none ${className}`}
      aria-label="Git Workbench Logo"
    >
      <defs>
        {/* Background Gradient */}
        <linearGradient id="git-workbench-react-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a1e2b" />
          <stop offset="50%" stopColor="#11131c" />
          <stop offset="100%" stopColor="#08090e" />
        </linearGradient>

        {/* Squircle Border Gradient */}
        <linearGradient id="git-workbench-react-border" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#818cf8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.85" />
        </linearGradient>

        {/* Center Radial Glow */}
        <radialGradient id="git-workbench-react-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Base Squircle */}
      <rect
        x="28"
        y="28"
        width="456"
        height="456"
        rx="108"
        ry="108"
        fill="url(#git-workbench-react-bg)"
        stroke="url(#git-workbench-react-border)"
        strokeWidth="4.5"
      />
      <circle cx="256" cy="256" r="180" fill="url(#git-workbench-react-glow)" />

      {/* STRATA LANES */}
      {/* 1. Top Strata Lane (Cyan) */}
      <path
        d="M 120 144 L 392 144"
        stroke="#38bdf8"
        strokeWidth="22"
        strokeLinecap="round"
      />

      {/* 2. Middle Strata Lane (Indigo / Violet) */}
      <path
        d="M 120 256 L 392 256"
        stroke="#818cf8"
        strokeWidth="22"
        strokeLinecap="round"
      />

      {/* 3. Bottom Strata Lane (Emerald) */}
      <path
        d="M 120 368 L 392 368"
        stroke="#34d399"
        strokeWidth="22"
        strokeLinecap="round"
      />

      {/* BRANCH FORKS & MERGES (Cubic Beziers) */}
      {/* Fork from Middle to Top: (195, 256) -> (285, 144) */}
      <path
        d="M 195 256 C 240 256, 240 144, 285 144"
        stroke="#38bdf8"
        strokeWidth="22"
        strokeLinecap="round"
        fill="none"
      />

      {/* Merge from Bottom to Middle: (225, 368) -> (315, 256) */}
      <path
        d="M 225 368 C 270 368, 270 256, 315 256"
        stroke="#34d399"
        strokeWidth="22"
        strokeLinecap="round"
        fill="none"
      />

      {/* COMMIT NODES */}
      {/* Top Lane Nodes */}
      <circle cx="150" cy="144" r="26" fill="#0284c7" fillOpacity="0.3" />
      <circle cx="150" cy="144" r="17" fill="#0ea5e9" />
      <circle cx="150" cy="144" r="7.5" fill="#ffffff" />

      <circle cx="285" cy="144" r="32" fill="#38bdf8" fillOpacity="0.4" />
      <circle cx="285" cy="144" r="21" fill="#38bdf8" />
      <circle cx="285" cy="144" r="9" fill="#ffffff" />

      <circle cx="365" cy="144" r="26" fill="#0284c7" fillOpacity="0.3" />
      <circle cx="365" cy="144" r="17" fill="#0ea5e9" />
      <circle cx="365" cy="144" r="7.5" fill="#ffffff" />

      {/* Middle Lane Nodes */}
      <circle cx="135" cy="256" r="26" fill="#a855f7" fillOpacity="0.3" />
      <circle cx="135" cy="256" r="17" fill="#a855f7" />
      <circle cx="135" cy="256" r="7.5" fill="#ffffff" />

      <circle cx="195" cy="256" r="32" fill="#818cf8" fillOpacity="0.4" />
      <circle cx="195" cy="256" r="21" fill="#818cf8" />
      <circle cx="195" cy="256" r="9" fill="#ffffff" />

      {/* Center Nexus Merge Node */}
      <circle
        cx="315"
        cy="256"
        r="34"
        fill="#818cf8"
        fillOpacity="0.45"
        className={animated ? 'animate-pulse' : undefined}
      />
      <circle cx="315" cy="256" r="22" fill="#6366f1" />
      <circle cx="315" cy="256" r="9.5" fill="#ffffff" />

      <circle cx="375" cy="256" r="26" fill="#818cf8" fillOpacity="0.3" />
      <circle cx="375" cy="256" r="17" fill="#818cf8" />
      <circle cx="375" cy="256" r="7.5" fill="#ffffff" />

      {/* Bottom Lane Nodes */}
      <circle cx="145" cy="368" r="26" fill="#059669" fillOpacity="0.3" />
      <circle cx="145" cy="368" r="17" fill="#059669" />
      <circle cx="145" cy="368" r="7.5" fill="#ffffff" />

      <circle cx="225" cy="368" r="32" fill="#34d399" fillOpacity="0.4" />
      <circle cx="225" cy="368" r="21" fill="#10b981" />
      <circle cx="225" cy="368" r="9" fill="#ffffff" />

      <circle cx="360" cy="368" r="26" fill="#34d399" fillOpacity="0.3" />
      <circle cx="360" cy="368" r="17" fill="#34d399" />
      <circle cx="360" cy="368" r="7.5" fill="#ffffff" />
    </svg>
  );
}
