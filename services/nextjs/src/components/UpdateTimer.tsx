import React, { useState, useEffect } from 'react';

interface UpdateTimerProps {
  onTimerFire: () => void;
}

export const UpdateTimer: React.FC<UpdateTimerProps> = ({ onTimerFire }) => {
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onTimerFire();
          setPulse(true);
          setTimeout(() => setPulse(false), 2000);
          return 300; // Reset
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onTimerFire]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px',
        color: pulse ? 'var(--color-accent)' : 'var(--color-text-muted)',
        fontFamily: 'var(--font-jetbrains-mono), monospace',
        fontSize: '11px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        transition: 'color 0.2s ease',
        borderLeft: '1px solid var(--color-border)',
        paddingLeft: '12px',
        marginLeft: '12px',
        height: '100%'
      }}
    >
      <span style={{ 
        fontSize: '9px', 
        color: pulse ? 'var(--color-accent)' : 'var(--color-text-dim)',
        animation: pulse ? 'blink 0.5s step-start infinite' : 'none' 
      }}>●</span>
      <span>NEXT UPDATE: {formatTime(timeLeft)}</span>
    </div>
  );
};
