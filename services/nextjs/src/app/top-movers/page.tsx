'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TopMoversPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMovers = async () => {
      try {
        const res = await fetch('/api/analytics/top-stats');
        if (!res.ok) throw new Error('Failed to fetch top stats');
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || 'Error loading stats');
      } finally {
        setLoading(false);
      }
    };
    fetchMovers();
  }, []);

  if (loading) return <div style={{ padding: '24px', color: 'var(--color-text)' }}>[ LOADING TOP MOVERS ]</div>;
  if (error) return <div style={{ padding: '24px', color: 'var(--color-negative)' }}>[ ERROR LOADING MOVERS ]</div>;

  const topVolume = data?.top_volume || [];
  const topPrice = data?.top_price || [];

  const thStyle = {
    padding: '12px 16px',
    textAlign: 'left' as const,
    borderBottom: '1px solid var(--color-border)',
  };

  const tdStyle = {
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border-light)',
  };

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        
        {/* Top Price Column */}
        <div style={{ flex: 1, minWidth: '300px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', letterSpacing: '0.05em' }}>
            [ TOP 100 MOST EXPENSIVE ITEMS ]
          </h2>
          <div style={{ border: '1px solid var(--color-border)', maxHeight: '600px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ background: 'var(--color-text)', color: 'var(--color-bg)', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={thStyle}>Item</th>
                  <th style={{...thStyle, textAlign: 'right'}}>Price (GP)</th>
                </tr>
              </thead>
              <tbody>
                {topPrice.map((entry: any, index: number) => (
                  <tr 
                    key={`${entry.item_metadata.item_id}-price-${index}`}
                    onClick={() => router.push(`/item/${entry.item_metadata.item_id}`)}
                    style={{ cursor: 'pointer', background: 'var(--color-bg)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-panel-dark)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-bg)'}
                  >
                    <td style={tdStyle}>{entry.item_metadata.name}</td>
                    <td style={{...tdStyle, textAlign: 'right', fontFamily: 'monospace'}}>{entry.avg_high_price?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Volume Column */}
        <div style={{ flex: 1, minWidth: '300px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', letterSpacing: '0.05em' }}>
            [ TOP 100 HIGHEST VOLUME ITEMS ]
          </h2>
          <div style={{ border: '1px solid var(--color-border)', maxHeight: '600px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead style={{ background: 'var(--color-text)', color: 'var(--color-bg)', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={thStyle}>Item</th>
                  <th style={{...thStyle, textAlign: 'right'}}>Volume</th>
                </tr>
              </thead>
              <tbody>
                {topVolume.map((entry: any, index: number) => (
                  <tr 
                    key={`${entry.item_metadata.item_id}-volume-${index}`}
                    onClick={() => router.push(`/item/${entry.item_metadata.item_id}`)}
                    style={{ cursor: 'pointer', background: 'var(--color-bg)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-panel-dark)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-bg)'}
                  >
                    <td style={tdStyle}>{entry.item_metadata.name}</td>
                    <td style={{...tdStyle, textAlign: 'right', fontFamily: 'monospace'}}>{entry.high_price_volume?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
