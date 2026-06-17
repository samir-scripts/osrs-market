import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';

export const UpdateTimer: React.FC = () => {
  const nextUpdateAt = useStore((state) => state.nextUpdateAt);
  const setSchedule = useStore((state) => state.setSchedule);
  const incrementRefreshKey = useStore((state) => state.incrementRefreshKey);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [pulse, setPulse] = useState(false);

  // 1. Initial Schedule Fetch
  useEffect(() => {
    const fetchInitialSchedule = async () => {
      try {
        const res = await fetch('/api/schedule');
        if (res.ok) {
          const data = await res.json();
          if (data.next_update_at) {
            setSchedule(data.last_fetched_at, data.next_update_at);
          }
        }
      } catch (err) {
        console.error('Failed to fetch initial schedule:', err);
      }
    };
    fetchInitialSchedule();
  }, [setSchedule]);

  // 2. Subscribe to SSE updates
  useEffect(() => {
    const eventSource = new EventSource('/api/sse/schedule');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.nextUpdateAt) {
          setSchedule(data.lastFetchedAt, data.nextUpdateAt);
          
          // Trigger reload of tables and charts
          incrementRefreshKey();
          
          // Pulse animation
          setPulse(true);
          setTimeout(() => setPulse(false), 2000);
        }
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error, attempting reconnect...', err);
    };

    return () => {
      eventSource.close();
    };
  }, [setSchedule, incrementRefreshKey]);

  // 3. Keep updating the countdown
  useEffect(() => {
    if (!nextUpdateAt) {
      setTimeLeft(null);
      return;
    }

    const calculateTimeLeft = () => {
      const diff = nextUpdateAt - Math.floor(Date.now() / 1000);
      setTimeLeft(diff > 0 ? diff : 0);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [nextUpdateAt]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return 'LOADING...';
    if (seconds <= 0) return 'UPDATING...';
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
