'use client';

import React, { useEffect } from 'react';
import Panel from './Panel';
import PriceChart from './PriceChart';
import LiveIndicator from './LiveIndicator';
import AlertBanner from './AlertBanner';
import { UpdateTimer } from './UpdateTimer';
import { useStore } from '../store/useStore';
import ConnectionToast from './ConnectionToast';
import MarketMetricsPanel from './MarketMetricsPanel';
import { useMarketData } from '../hooks/useMarketData';

export default function DashboardContent() {
  const selectedItemId = useStore((state) => state.selectedItemId);
  const setSelectedItemId = useStore((state) => state.setSelectedItemId);
  const selectedItemName = useStore((state) => state.selectedItemName);
  const setSelectedItemName = useStore((state) => state.setSelectedItemName);
  const triggeredAlerts = useStore((state) => state.triggeredAlerts);
  const setTriggeredAlerts = useStore((state) => state.setTriggeredAlerts);
  const removeTriggeredAlert = useStore((state) => state.removeTriggeredAlert);

  useEffect(() => {
    if (selectedItemId === null) {
      setSelectedItemId(2);
      setSelectedItemName('Cannonball');
    }
  }, [selectedItemId]);

  const { latestPrice, priceLoading, activeAlerts } = useMarketData(selectedItemId);

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
            <MarketMetricsPanel 
              selectedItemId={selectedItemId}
              selectedItemName={selectedItemName}
              latestPrice={latestPrice}
              priceLoading={priceLoading}
            />
          </Panel>

          {selectedItemId && (
            <PriceChart />
          )}
        </div>
      </main>
    </div>
  );
}
