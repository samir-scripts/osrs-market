'use client';

import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import Panel from './Panel';
import { useStore } from '../store/useStore';

interface PriceTick {
  timestamp: number;
  avg_high_price: number | null;
  avg_low_price: number | null;
  high_price_volume: number | null;
  low_price_volume: number | null;
}

const OSRS_CHART_THEME = {
  cartesianGrid: { stroke: '#474745', strokeDasharray: '3 3' },
  xAxis:         { stroke: '#694D23', tick: { fill: '#A89060', fontSize: 11, fontFamily: 'var(--font-jetbrains-mono)' } },
  yAxisPrice:    { stroke: '#694D23', tick: { fill: '#A89060', fontSize: 11, fontFamily: 'var(--font-jetbrains-mono)' } },
  yAxisVolume:   { stroke: '#694D23', tick: { fill: '#A89060', fontSize: 11, fontFamily: 'var(--font-jetbrains-mono)' }, orientation: 'right' as const },
  tooltip: {
    contentStyle: {
      background: '#46433A',
      border: '2px solid #694D23',
      borderRadius: 0,
      fontFamily: "var(--font-jetbrains-mono), monospace",
      fontSize: 12,
      color: '#FFCF3F',
    },
  },
  highPrice: '#00C800',
  lowPrice:  '#FF0000',
  volume:    '#E6A519',
};

// React 19 compatible Error Boundary to catch Recharts rendering failures
class ChartErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ChartErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', color: 'var(--color-negative)', textAlign: 'center', fontFamily: 'var(--font-jetbrains-mono)' }}>
          [ERROR] FAILED TO RENDER CHART COMPONENT (DATA CORRUPTION DETECTED)
        </div>
      );
    }
    return this.props.children;
  }
}

export default function PriceChart() {
  const itemId = useStore((state) => state.selectedItemId);
  const itemName = useStore((state) => state.selectedItemName);
  const refreshKey = useStore((state) => state.refreshKey);

  const [data, setData] = useState<PriceTick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daysframe, setDaysframe] = useState(7);

  const fetchHistory = async (signal: AbortSignal) => {
    if (!itemId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/analytics/history/${itemId}?days=${daysframe}`, { signal });
      if (!res.ok) throw new Error('Failed to fetch price history');
      const json = await res.json();
      if (!signal.aborted) {
        setData(json.data || []);
        setError(null);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || signal.aborted) {
        return;
      }
      setError(err.message || 'Error loading history');
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchHistory(controller.signal);
    return () => {
      controller.abort();
    };
  }, [itemId, daysframe, refreshKey]);

  const formatDate = (epochSec: number) => {
    const d = new Date(epochSec * 1000);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (!itemId) {
    return (
      <Panel title="HISTORICAL PRICE & VOLUME" style={{ flex: 1, minHeight: '350px' }}>
        <div style={{ padding: '24px', color: 'var(--color-text-dim)', textAlign: 'center' }}>
          SELECT AN ITEM FROM THE SIDEBAR TO VIEW HISTORY
        </div>
      </Panel>
    );
  }

  const safeItemName = (itemName || `Item #${itemId}`).toUpperCase();

  return (
    <Panel
      title={`${safeItemName} (ID: ${itemId}) - HISTORICAL PRICE & VOLUME`}
      headerRight={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setDaysframe(1)}
            className="osrs-btn"
            style={{ padding: '2px 8px', fontSize: '10px', borderColor: daysframe === 1 ? 'var(--color-accent)' : 'var(--color-border)' }}
          >
            24H
          </button>
          <button
            onClick={() => setDaysframe(7)}
            className="osrs-btn"
            style={{ padding: '2px 8px', fontSize: '10px', borderColor: daysframe === 7 ? 'var(--color-accent)' : 'var(--color-border)' }}
          >
            7D
          </button>
          <button
            onClick={() => setDaysframe(30)}
            className="osrs-btn"
            style={{ padding: '2px 8px', fontSize: '10px', borderColor: daysframe === 30 ? 'var(--color-accent)' : 'var(--color-border)' }}
          >
            30D
          </button>
        </div>
      }
      style={{ flex: 1, minHeight: '350px' }}
    >
      {loading && <div style={{ padding: '24px', color: 'var(--color-text-muted)' }}>LOADING HISTORICAL DATA...</div>}
      {error && <div style={{ padding: '24px', color: 'var(--color-negative)' }}>{error}</div>}
      {!loading && !error && data.length === 0 && (
        <div style={{ padding: '24px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
          NO HISTORICAL DATA FOR THIS ITEM IN MINIO PARQUET YET
        </div>
      )}
      {!loading && !error && data.length > 0 && (
        <div style={{ width: '100%', height: '100%', minHeight: '300px' }}>
          <ChartErrorBoundary>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid stroke={OSRS_CHART_THEME.cartesianGrid.stroke} strokeDasharray={OSRS_CHART_THEME.cartesianGrid.strokeDasharray} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatDate}
                  stroke={OSRS_CHART_THEME.xAxis.stroke}
                  tick={OSRS_CHART_THEME.xAxis.tick}
                  dy={10}
                />
                <YAxis
                  yAxisId="price"
                  stroke={OSRS_CHART_THEME.yAxisPrice.stroke}
                  tick={OSRS_CHART_THEME.yAxisPrice.tick}
                  tickFormatter={(tick) => `${Number(tick).toLocaleString()} gp`}
                />
                <YAxis
                  yAxisId="volume"
                  orientation={OSRS_CHART_THEME.yAxisVolume.orientation}
                  stroke={OSRS_CHART_THEME.yAxisVolume.stroke}
                  tick={OSRS_CHART_THEME.yAxisVolume.tick}
                  tickFormatter={(tick) => Number(tick).toLocaleString()}
                />
                <Tooltip
                  contentStyle={OSRS_CHART_THEME.tooltip.contentStyle}
                  labelFormatter={(label) => `Time: ${formatDate(Number(label))}`}
                  formatter={(value: any, name: any) => {
                    if (name && name.includes('Price')) return [`${Number(value).toLocaleString()} gp`, name];
                    return [Number(value).toLocaleString(), name || ''];
                  }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '11px' }} />
                
                {/* Volume Area (drawn first/behind) */}
                <Area
                  yAxisId="volume"
                  type="monotone"
                  dataKey="high_price_volume"
                  name="Volume (High Traded)"
                  fill={OSRS_CHART_THEME.volume}
                  stroke={OSRS_CHART_THEME.volume}
                  fillOpacity={0.2}
                  dot={false}
                />

                {/* Price Lines */}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="avg_high_price"
                  name="Avg High Price"
                  stroke={OSRS_CHART_THEME.highPrice}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="avg_low_price"
                  name="Avg Low Price"
                  stroke={OSRS_CHART_THEME.lowPrice}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartErrorBoundary>
        </div>
      )}
    </Panel>
  );
}
