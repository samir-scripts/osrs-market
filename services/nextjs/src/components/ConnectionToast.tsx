import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../store/useStore';

export default function ConnectionToast() {
  const connectionStatus = useStore((state) => state.connectionStatus);
  const [visible, setVisible] = useState(false);
  const [toastStatus, setToastStatus] = useState<'online' | 'offline'>('online');
  const [message, setMessage] = useState('');
  
  const prevStatusRef = useRef<'online' | 'offline'>('online');

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;

    if (connectionStatus === 'offline') {
      setToastStatus('offline');
      setMessage('Attempting to establish internet connection to retrieve data...');
      setVisible(true);
    } else if (connectionStatus === 'online' && prevStatus === 'offline') {
      setToastStatus('online');
      setMessage('Internet connection established. Data retrieved.');
      const timer = setTimeout(() => {
        setVisible(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [connectionStatus]);

  if (!visible) return null;

  const isOffline = toastStatus === 'offline';

  return (
    <div className={`connection-toast ${isOffline ? 'offline' : 'online'}`}>
      {isOffline ? (
        <span style={{ 
          display: 'inline-block', 
          width: '8px', 
          height: '8px', 
          background: '#fff', 
          borderRadius: '50%',
          animation: 'blink 1s infinite'
        }} />
      ) : (
        <span style={{ fontSize: '14px' }}>✓</span>
      )}
      <span>{message}</span>
      
      <style>{`
        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
