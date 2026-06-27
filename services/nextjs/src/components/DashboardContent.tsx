'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import Panel from './Panel';
import PriceChart from './PriceChart';
import StatRow from './StatRow';
import LiveIndicator from './LiveIndicator';
import AlertBanner from './AlertBanner';
import { UpdateTimer } from './UpdateTimer';
import ConnectionToast from './ConnectionToast';

// Client-side alerts using localStorage
interface PriceAlert {
  alert_id: string;
  item_id: number;
  price_threshold: number;
  comparison_operator: string;
}

export default function DashboardContent() {
  const selectedItemId = useStore((state) => state.selectedItemId);
  const setSelectedItemId = useStore((state) => state.setSelectedItemId);
  const selectedItemName = useStore((state) => state.selectedItemName);
  const setSelectedItemName = useStore((state) => state.setSelectedItemName);
  const refreshKey = useStore((state) => state.refreshKey);
  const incrementRefreshKey = useStore((state) => state.incrementRefreshKey);
  const triggeredAlerts = useStore((state) => state.triggeredAlerts);
  const setTriggeredAlerts = useStore((state) => state.setTriggeredAlerts);
  const removeTriggeredAlert = useStore((state) => state.removeTriggeredAlert);

  const [largeIconFailed, setLargeIconFailed] = useState(false);
  
  const [alertThreshold, setAlertThreshold] = useState<string>('');
  const [alertOperator, setAlertOperator] = useState<string>('>');

  useEffect(() => {
    if (selectedItemId === null) {
      setSelectedItemId(2);
      setSelectedItemName('Cannonball');
    }
    setLargeIconFailed(false);
  }, [selectedItemId]);

  const [latestPrice, setLatestPrice] = useState<any>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [activeAlerts, setActiveAlerts] = useState<PriceAlert[]>([]);

  // Fetch latest price
  useEffect(() => {
    if (!selectedItemId) return;
    let active = true;
    
    const fetchLatest = async () => {
      try {
        const res = await fetch(`/api/analytics/latest/${selectedItemId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (active) {
          setLatestPrice(data.latest_item_prices_by_pk);
          setPriceLoading(false);
        }
      } catch (err) {
        if (active) {
          setPriceLoading(false);
        }
      }
    };
    
    fetchLatest();
    const interval = setInterval(fetchLatest, 10000); // Poll every 10s
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedItemId, refreshKey]);

  // Load alerts from localStorage
  useEffect(() => {
    if (!selectedItemId) return;
    const stored = localStorage.getItem('osrs_alerts');
    const alerts: PriceAlert[] = stored ? JSON.parse(stored) : [];
    setActiveAlerts(alerts.filter(a => a.item_id === selectedItemId));
  }, [selectedItemId]);

  useEffect(() => {
    if (latestPrice && activeAlerts.length > 0) {
      const price = latestPrice.avg_high_price || latestPrice.avg_low_price;
      if (!price) return;

      const newTriggers: string[] = [];
      activeAlerts.forEach((alert: any) => {
        const threshold = Number(alert.price_threshold);
        let triggered = false;

        if (alert.comparison_operator === '>' && price > threshold) triggered = true;
        if (alert.comparison_operator === '<' && price < threshold) triggered = true;
        if (alert.comparison_operator === '>=' && price >= threshold) triggered = true;
        if (alert.comparison_operator === '<=' && price <= threshold) triggered = true;

        if (triggered) {
          newTriggers.push(
            `ALERT: ${selectedItemName} crossed threshold ${alert.price_threshold} gp (Current: ${price} gp)`
          );
        }
      });

      if (newTriggers.length > 0) {
        setTriggeredAlerts(newTriggers);
      } else {
        setTriggeredAlerts([]);
      }
    } else {
      setTriggeredAlerts([]);
    }
  }, [latestPrice, activeAlerts, selectedItemName]);

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || !alertThreshold) return;

    try {
      const stored = localStorage.getItem('osrs_alerts');
      const alerts: PriceAlert[] = stored ? JSON.parse(stored) : [];
      
      const newAlert: PriceAlert = {
        alert_id: Math.random().toString(36).substring(2, 9),
        item_id: selectedItemId,
        price_threshold: Number(alertThreshold),
        comparison_operator: alertOperator
      };
      
      const updated = [...alerts, newAlert];
      localStorage.setItem('osrs_alerts', JSON.stringify(updated));
      
      setActiveAlerts(updated.filter(a => a.item_id === selectedItemId));
      setAlertThreshold('');
      alert('Alert registered successfully in local storage!');
    } catch (err) {
      console.error('Error creating alert:', err);
    }
  };

  if (priceLoading) {
    return (
      <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', letterSpacing: '0.1em', color: '#f5f5f4' }}>
          [ LOADING DASHBOARD DATA ]
        </div>
        <div style={{ width: '300px', height: '2px', background: '#333', overflow: 'hidden', position: 'relative' }}>
          <div style={{ 
            width: '40%', 
            height: '100%', 
            background: '#44ff44', 
            position: 'absolute',
            animation: 'loadingBar 1.5s infinite ease-in-out' 
          }} />
        </div>
        <style>{`
          @keyframes loadingBar {
            0% { left: -40%; }
            100% { left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <main className="main-content" style={{ flex: 1, overflowY: 'auto' }}>
        <ConnectionToast />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            padding: '8px 16px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h1 style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.05em', margin: 0 }}>
              OSRS MARKET VALUE TRACKER
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '100%', flexWrap: 'wrap' }}>
            <LiveIndicator />
            <UpdateTimer />
          </div>
        </div>

        {triggeredAlerts.map((msg, index) => (
          <AlertBanner
            key={index}
            message={msg}
            type="negative"
            onClose={() => removeTriggeredAlert(index)}
          />
        ))}

        <div className="metrics-chart-row" style={{ display: 'flex', gap: '12px', flex: 1, minHeight: '380px', flexWrap: 'wrap' }}>
          <Panel title="LIVE MARKET METRICS" className="metrics-panel" style={{ width: '320px', flexShrink: 0 }}>
            {selectedItemId ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    marginBottom: '12px', 
                    borderBottom: '1px solid var(--color-border)',
                    paddingBottom: '8px'
                  }}>
                    {!largeIconFailed ? (
                      <img
                        src={`https://chisel.weirdgloop.org/static/img/osrs-sprite/${selectedItemId}.png`}
                        alt={selectedItemName}
                        className="item-icon item-icon-lg"
                        onError={() => setLargeIconFailed(true)}
                      />
                    ) : (
                      <div style={{
                        width: '48px',
                        height: '48px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text-muted)',
                        fontWeight: 'bold',
                        fontSize: '18px'
                      }}>
                        ?
                      </div>
                    )}
                    <h2 style={{ fontSize: '16px', color: 'var(--color-text)', margin: 0 }}>
                      {selectedItemName.toUpperCase()}
                    </h2>
                  </div>
                  {priceLoading && <div style={{ color: 'var(--color-text-dim)' }}>Awaiting stream connection...</div>}
                  {latestPrice ? (
                    <div>
                      <StatRow
                        label="Average High Price"
                        value={`${latestPrice.avg_high_price?.toLocaleString() || 'N/A'} gp`}
                        valueClass="text-positive"
                      />
                      <StatRow
                        label="Average Low Price"
                        value={`${latestPrice.avg_low_price?.toLocaleString() || 'N/A'} gp`}
                        valueClass="text-negative"
                      />
                      <StatRow
                        label="High Traded Volume"
                        value={latestPrice.high_price_volume?.toLocaleString() || 0}
                      />
                      <StatRow
                        label="Low Traded Volume"
                        value={latestPrice.low_price_volume?.toLocaleString() || 0}
                      />
                      <div style={{ marginTop: '12px', fontSize: '10px', color: 'var(--color-text-dim)', textAlign: 'right' }}>
                        UPDATED: {new Date(latestPrice.last_updated).toLocaleTimeString()}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                      Awaiting live updates from Spark streaming engine...
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', marginTop: '12px' }}>
                  <h3 style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    SET PRICE ALERT
                  </h3>
                  <form onSubmit={handleCreateAlert} style={{ display: 'flex', gap: '6px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <select
                        className="osrs-input"
                        style={{ width: '60px' }}
                        value={alertOperator}
                        onChange={e => setAlertOperator(e.target.value)}
                      >
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                      </select>
                      <input
                        type="number"
                        placeholder="THRESHOLD (GP)"
                        className="osrs-input"
                        value={alertThreshold}
                        onChange={e => setAlertThreshold(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="osrs-btn" style={{ width: '100%' }}>
                      REGISTER ALERT
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--color-text-dim)' }}>SELECT AN ITEM TO INSPECT LIVE DATA</div>
            )}
          </Panel>

          {selectedItemId && (
            <PriceChart />
          )}
        </div>
      </main>
    </div>
  );
}
