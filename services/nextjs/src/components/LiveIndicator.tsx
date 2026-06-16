import React from 'react';

export default function LiveIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: 'var(--color-positive)', fontWeight: 'bold' }}>
      <span className="live-indicator">■</span>
      <span>LIVE</span>
    </div>
  );
}
