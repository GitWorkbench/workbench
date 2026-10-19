import React from 'react';
import './loading.css';

export function LoadingProgress({ label, value }: { label: string; value?: number }) {
  return (
    <div className="loading-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <div className={`loading-progress-fill${value === undefined ? ' is-indeterminate' : ''}`} style={value === undefined ? undefined : { width: `${value}%` }} />
    </div>
  );
}
