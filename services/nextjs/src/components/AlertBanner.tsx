import React from 'react';

interface AlertBannerProps {
  message: string;
  type?: 'positive' | 'negative' | 'info';
  onClose?: () => void;
}

export default function AlertBanner({ message, type = 'info', onClose }: AlertBannerProps) {
  const bgColors = {
    positive: 'rgba(0, 200, 0, 0.15)',
    negative: 'rgba(255, 0, 0, 0.15)',
    info: 'var(--color-panel-dark)',
  };

  const borderColors = {
    positive: 'var(--color-positive)',
    negative: 'var(--color-negative)',
    info: 'var(--color-border)',
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        backgroundColor: bgColors[type],
        border: `2px solid ${borderColors[type]}`,
        color: 'var(--color-text)',
        fontWeight: 'bold',
        fontSize: '12px',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: borderColors[type] }}>[!]</span>
        <span>{message}</span>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 'bold',
          }}
        >
          [X]
        </button>
      )}
    </div>
  );
}
