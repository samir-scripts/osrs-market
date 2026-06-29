import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../store/useStore';

export interface PriceTick {
  timestamp: number;
  avg_high_price: number | null;
  avg_low_price: number | null;
  high_price_volume: number | null;
  low_price_volume: number | null;
}

const historyCache: Record<string, { data: PriceTick[], refreshKey: number }> = {};

export function usePriceHistory(itemId: number | null, daysframe: number) {
  const refreshKey = useStore((state) => state.refreshKey);

  const [data, setData] = useState<PriceTick[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevItemIdRef = useRef<number | null>(null);

  const fetchHistory = async (signal: AbortSignal) => {
    if (!itemId) return;

    const cacheKey = `${itemId}-30`;
    const cached = historyCache[cacheKey];

    if (cached && cached.refreshKey === refreshKey) {
      setData(cached.data);
      setError(null);
      prevItemIdRef.current = itemId;
      return;
    }

    const isNewItem = prevItemIdRef.current !== itemId;

    try {
      if (isNewItem || data.length === 0) {
        setLoading(true);
        setData([]); 
      }
      const res = await fetch(`/api/analytics/history/${itemId}?days=30`, { signal });
      if (!res.ok) throw new Error('Failed to fetch price history');
      const json = await res.json();
      if (!signal.aborted) {
        const fetchedData = json.data || [];
        setData(fetchedData);
        setError(null);
        historyCache[cacheKey] = { data: fetchedData, refreshKey };
        prevItemIdRef.current = itemId;
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
  }, [itemId, refreshKey]);

  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    if (daysframe === 30) return data;
    
    const maxTimestamp = Math.max(...data.map(d => d.timestamp));
    const cutoff = maxTimestamp - (daysframe * 86400);
    return data.filter(d => d.timestamp >= cutoff);
  }, [data, daysframe]);

  return { data: filteredData, loading, error };
}
