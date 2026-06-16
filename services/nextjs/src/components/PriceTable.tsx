'use client';

import React, { useState, useEffect } from 'react';
import Panel from './Panel';

interface Mover {
  item_id: number;
  name?: string; // Resolved from metadata if available
  start_price: number;
  end_price: number;
  percent_change: number;
}

export default function PriceTable({ onSelectItem }: { onSelectItem: (itemId: number, name: string) => void }) {
  const [movers, setMovers] = useState<Mover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMovers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/analytics/top-movers');
      if (!res.ok) throw new Error('Failed to fetch top movers');
      const data = await res.json();
      setMovers(data.movers || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Error fetching analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovers();
    // Poll every 5 minutes
    const interval = setInterval(fetchMovers, 300000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Panel
      title="TOP PRICE MOVERS (LAST 24 HOURS)"
      headerRight={
        <button onClick={fetchMovers} className="osrs-btn" style={{ padding: '2px 8px', fontSize: '10px' }}>
          REFRESH
        </button>
      }
    >
      <div style={{ overflowX: 'auto', height: '100%' }}>
        {loading && <div style={{ padding: '12px', color: 'var(--color-text-muted)' }}>COMPUTING TOP MOVERS FROM PARQUET...</div>}
        {error && <div style={{ padding: '12px', color: 'var(--color-negative)' }}>{error}</div>}
        {!loading && !error && movers.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--color-text-muted)' }}>NO MOVERS DATA AVAILABLE</div>
        )}
        {!loading && !error && movers.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>ITEM ID</th>
                <th style={{ textAlign: 'right' }}>START PRICE (GP)</th>
                <th style={{ textAlign: 'right' }}>END PRICE (GP)</th>
                <th style={{ textAlign: 'right' }}>CHANGE</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {movers.map(mover => {
                const isPositive = mover.percent_change >= 0;
                return (
                  <tr key={mover.item_id}>
                    <td style={{ fontWeight: 'bold' }}>Item #{mover.item_id}</td>
                    <td style={{ textAlign: 'right' }}>{mover.start_price?.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{mover.end_price?.toLocaleString()}</td>
                    <td
                      style={{ textAlign: 'right', fontWeight: 'bold' }}
                      className={isPositive ? 'text-positive' : 'text-negative'}
                    >
                      {isPositive ? '+' : ''}{mover.percent_change}%
                    </td>
                    <td>
                      <button
                        onClick={() => onSelectItem(mover.item_id, `Item #${mover.item_id}`)}
                        className="osrs-btn"
                        style={{ padding: '2px 6px', fontSize: '10px', border: '1px solid var(--color-border)' }}
                      >
                        VIEW
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
