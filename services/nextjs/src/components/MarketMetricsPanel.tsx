'use client';

import React, { useState } from 'react';
import StatRow from './StatRow';
import AlertCreationForm from './AlertCreationForm';

interface MarketMetricsPanelProps {
  selectedItemId: number | null;
  selectedItemName: string;
  latestPrice: any;
  priceLoading: boolean;
}

export default function MarketMetricsPanel({
  selectedItemId,
  selectedItemName,
  latestPrice,
  priceLoading,
}: MarketMetricsPanelProps) {
  const [largeIconFailed, setLargeIconFailed] = useState(false);

  if (!selectedItemId) {
    return <div style={{ color: 'var(--color-text-dim)' }}>SELECT AN ITEM TO INSPECT LIVE DATA</div>;
  }

  return (
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

      <AlertCreationForm selectedItemId={selectedItemId} />
    </div>
  );
}
