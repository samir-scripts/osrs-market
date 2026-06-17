import React from 'react';
import { useStore } from '../store/useStore';

export default function LiveIndicator() {
  const connectionStatus = useStore((state) => state.connectionStatus);
  const isOnline = connectionStatus === 'online';

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      fontSize: '11px', 
      color: isOnline ? 'var(--color-positive)' : 'var(--color-negative)', 
      fontWeight: 'bold',
      transition: 'color 0.3s ease'
    }}>
      <span className="live-indicator" style={{ marginRight: '4px' }}>■</span>
      <span>{isOnline ? 'LIVE' : 'OFFLINE'}</span>
    </div>
  );
}
