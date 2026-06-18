'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import { client } from '../lib/apollo-client';
import { GET_ITEMS } from './ItemSidebar';
import { LoadingScreen } from './LoadingScreen';

const CHECK_READINESS = gql`
  query CheckReadiness {
    items_metadata_aggregate {
      aggregate {
        count
      }
    }
    latest_item_prices_aggregate {
      aggregate {
        count
      }
    }
  }
`;

export default function ReadinessGate({ children }: { children: React.ReactNode }) {
  const { data, loading, error } = useQuery<any>(CHECK_READINESS, {
    pollInterval: 3000,
  });

  useEffect(() => {
    if (error) {
      console.log('Hasura connection error:', error);
    }
  }, [error]);

  const [analyticsReady, setAnalyticsReady] = useState(false);

  useEffect(() => {
    const checkAnalytics = async () => {
      try {
        const res = await fetch('/api/analytics/top-movers');
        if (res.ok) {
          setAnalyticsReady(true);
        } else {
          setAnalyticsReady(false);
        }
      } catch (err) {
        setAnalyticsReady(false);
      }
    };

    checkAnalytics();
    const interval = setInterval(checkAnalytics, 3000);
    return () => clearInterval(interval);
  }, []);

  const itemsMetadataCount = data?.items_metadata_aggregate?.aggregate?.count || 0;
  const priceStreamCount = data?.latest_item_prices_aggregate?.aggregate?.count || 0;

  const itemsMetadataReady = itemsMetadataCount > 0;
  const priceStreamReady = priceStreamCount > 0;

  const isReady = itemsMetadataReady && priceStreamReady && analyticsReady;

  const [iconsReady, setIconsReady] = useState(false);

  useEffect(() => {
    if (!isReady || iconsReady) return;

    let isMounted = true;

    const preloadAllIcons = async () => {
      try {
        console.log("Preloading item icons from WeirdGloop...");
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
          const { data: itemsData } = await client.query<any>({
            query: GET_ITEMS,
          });
          const items = itemsData?.items_metadata || [];
          items.slice(0, 20).forEach((item: any) => {
            urlsToPreload.add(`https://chisel.weirdgloop.org/static/img/osrs-sprite/${item.item_id}.png`);
          });
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
