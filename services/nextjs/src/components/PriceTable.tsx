'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Panel from './Panel';
import { useStore } from '../store/useStore';

interface Mover {
  item_id: number;
  name?: string;
  start_price: number;
  end_price: number;
  percent_change: number;
}

export default function PriceTable() {
  const [movers, setMovers] = useState<Mover[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  const refreshKey = useStore((state) => state.refreshKey);
  const setSelectedItemId = useStore((state) => state.setSelectedItemId);
  const setSelectedItemName = useStore((state) => state.setSelectedItemName);
  const setTriggeredAlerts = useStore((state) => state.setTriggeredAlerts);

  // Fetch items list
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch('/api/analytics/items');
        if (!res.ok) throw new Error();
        const data = await res.json();
        setItems(data.items_metadata || []);
      } catch (err) {
        console.error('Error fetching items for mapping:', err);
      }
    };
    fetchItems();
  }, []);

  const itemsMap = useMemo(() => {
    const map = new Map<number, string>();
    items.forEach((item: any) => {
      map.set(item.item_id, item.name);
    });
    return map;
  }, [items]);

  const handleImageError = (itemId: number) => {
    setFailedImages(prev => ({ ...prev, [itemId]: true }));
  };

  const onSelectItem = (itemId: number, name: string) => {
    setSelectedItemId(Number(itemId));
    setSelectedItemName(name);
    setTriggeredAlerts([]);
  };

  const fetchMovers = async () => {
    try {
      if (movers.length === 0) {
        setLoading(true);
      }
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
  }, [refreshKey]);

  return (
    <Panel
      title="TOP 10 PRICE MOVERS (LAST 24 HOURS)"
      headerRight={
        <button onClick={fetchMovers} className="osrs-btn" style={{ padding: '2px 8px', fontSize: '10px' }}>
          REFRESH
        </button>
      }
    >
      <div style={{ overflowX: 'auto', height: '100%' }}>
        {loading && <div style={{ padding: '12px', color: 'var(--color-text-muted)' }}>COMPUTING TOP MOVERS FROM CLICKHOUSE...</div>}
        {error && <div style={{ padding: '12px', color: 'var(--color-negative)' }}>{error}</div>}
        {!loading && !error && movers.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--color-text-muted)' }}>NO MOVERS DATA AVAILABLE</div>
        )}
        {!loading && !error && movers.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th className="hide-on-mobile" style={{ width: '40px' }}>ICON</th>
                <th>ITEM</th>
                <th className="hide-on-mobile" style={{ textAlign: 'right' }}>START PRICE (GP)</th>
                <th style={{ textAlign: 'right' }}>END PRICE (GP)</th>
                <th style={{ textAlign: 'right' }}>CHANGE</th>
                <th className="hide-on-mobile">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {movers.map(mover => {
                const isPositive = mover.percent_change >= 0;
                const moverId = Number(mover.item_id);
                const itemName = mover.name || itemsMap.get(moverId) || `Item #${moverId}`;
                return (
                  <tr 
                    key={moverId}
                    onClick={() => onSelectItem(moverId, itemName)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="hide-on-mobile">
                      {!failedImages[moverId] ? (
                        <img
                          src={`https://chisel.weirdgloop.org/static/img/osrs-sprite/${moverId}.png`}
                          alt={`Item ${moverId}`}
                          className="item-icon item-icon-sm"
                          onError={() => handleImageError(moverId)}
                        />
                      ) : (
                        <div style={{
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'var(--color-panel-dark)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text-muted)',
                          fontWeight: 'bold',
                          fontSize: '10px'
                        }}>
                          ?
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{itemName}</td>
                    <td className="hide-on-mobile" style={{ textAlign: 'right' }}>{mover.start_price?.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{mover.end_price?.toLocaleString()}</td>
                    <td
                      style={{ textAlign: 'right', fontWeight: 'bold' }}
                      className={isPositive ? 'text-positive' : 'text-negative'}
                    >
                      {isPositive ? '+' : ''}{mover.percent_change}%
                    </td>
                    <td className="hide-on-mobile">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectItem(moverId, itemName);
                        }}
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
