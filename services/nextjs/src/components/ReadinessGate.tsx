'use client';

import React, { useState, useEffect } from 'react';
import { LoadingScreen } from './LoadingScreen';

export default function ReadinessGate({ children }: { children: React.ReactNode }) {
  const [readinessData, setReadinessData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyticsReady, setAnalyticsReady] = useState(false);

  useEffect(() => {
    let active = true;
    const checkReadiness = async () => {
      try {
        const res = await fetch('/api/analytics/readiness');
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setReadinessData(data);
            setLoading(false);
          }
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Error checking readiness');
          setLoading(false);
        }
      }
    };

    const checkAnalytics = async () => {
      try {
        const res = await fetch('/api/analytics/top-movers');
        if (res.ok) {
          if (active) setAnalyticsReady(true);
        } else {
          if (active) setAnalyticsReady(false);
        }
      } catch (err) {
        if (active) setAnalyticsReady(false);
      }
    };

    checkReadiness();
    checkAnalytics();

    const interval = setInterval(() => {
      checkReadiness();
      checkAnalytics();
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const itemsMetadataReady = readinessData?.metadata_count > 0;
  const priceStreamReady = readinessData?.clean_count > 0;

  const isReady = itemsMetadataReady && priceStreamReady && analyticsReady;

  const [iconsReady, setIconsReady] = useState(false);

  useEffect(() => {
    if (!isReady || iconsReady) return;

    let isMounted = true;

    const preloadAllIcons = async () => {
      try {
        console.log("Preloading item icons...");
        const urlsToPreload = new Set<string>();

        try {
          const res = await fetch('/api/analytics/top-movers');
          if (res.ok) {
            const data = await res.json();
            const movers = data.movers || [];
            movers.forEach((mover: any) => {
              urlsToPreload.add(`https://chisel.weirdgloop.org/static/img/osrs-sprite/${mover.item_id}.png`);
            });
          }
        } catch (err) {
          console.error("Error fetching movers for preloading:", err);
        }

        try {
          const res = await fetch('/api/analytics/items');
          if (res.ok) {
            const data = await res.json();
            const items = data.items_metadata || [];
            items.slice(0, 20).forEach((item: any) => {
              urlsToPreload.add(`https://chisel.weirdgloop.org/static/img/osrs-sprite/${item.item_id}.png`);
            });
          }
        } catch (err) {
          console.error("Error querying items for preloading:", err);
        }

        urlsToPreload.add('https://chisel.weirdgloop.org/static/img/osrs-sprite/2.png');

        const preloadPromises = Array.from(urlsToPreload).map((url) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = url;
          });
        });

        await Promise.all(preloadPromises);
        console.log(`Preloaded ${urlsToPreload.size} icons successfully.`);
      } catch (err) {
        console.error("Error preloading icons:", err);
      } finally {
        if (isMounted) {
          setIconsReady(true);
        }
      }
    };

    preloadAllIcons();

    return () => {
      isMounted = false;
    };
  }, [isReady, iconsReady]);

  const allReady = isReady && iconsReady;

  if (!allReady) {
    return (
      <LoadingScreen
        itemsMetadataReady={itemsMetadataReady}
        priceStreamReady={priceStreamReady}
        analyticsReady={analyticsReady}
        iconsReady={iconsReady}
      />
    );
  }

  return <>{children}</>;
}
