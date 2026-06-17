'use client';

import React, { useState, useEffect } from 'react';
import { ApolloProvider, useSubscription, useQuery } from '@apollo/client/react';
import { client } from '../lib/apollo-client';
import { gql } from '@apollo/client';
import ItemSidebar, { GET_ITEMS } from '../components/ItemSidebar';
import Panel from '../components/Panel';
import PriceChart from '../components/PriceChart';
import PriceTable from '../components/PriceTable';
import StatRow from '../components/StatRow';
import LiveIndicator from '../components/LiveIndicator';
import AlertBanner from '../components/AlertBanner';
import { LoadingScreen } from '../components/LoadingScreen';
import { UpdateTimer } from '../components/UpdateTimer';
import { useStore } from '../store/useStore';
import ConnectionToast from '../components/ConnectionToast';

// GraphQL Subscriptions
const LATEST_PRICE_SUBSCRIPTION = gql`
  subscription GetLatestPrice($itemId: Int!) {
    latest_item_prices_by_pk(item_id: $itemId) {
      item_id
      avg_high_price
      avg_low_price
      high_price_volume
      low_price_volume
      last_updated
    }
  }
`;

const ACTIVE_ALERTS_SUBSCRIPTION = gql`
  subscription GetActiveAlerts($itemId: Int!) {
    active_price_alerts(where: { item_id: { _eq: $itemId }, is_active: { _eq: true } }) {
      alert_id
      price_threshold
      comparison_operator
    }
  }
`;

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

function ReadinessGate({ children }: { children: React.ReactNode }) {
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

        // 1. Fetch top movers to get their item IDs
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

        // 2. Fetch sidebar items (first 20) via Apollo Client query
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

        // 3. Add default selected item (Cannonball ID 2)
        urlsToPreload.add('https://chisel.weirdgloop.org/static/img/osrs-sprite/2.png');

        // 4. Preload all
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

// Helper component that subscribes to the selected item's live price and alert data
function DashboardContent() {
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
  
  // Alert settings form state
  const [alertThreshold, setAlertThreshold] = useState<string>('');
  const [alertOperator, setAlertOperator] = useState<string>('>');

  // Default to selecting Item #2 (Cannonball) if nothing is selected
  useEffect(() => {
    if (selectedItemId === null) {
      setSelectedItemId(2); // Set Cannonball as default selection
      setSelectedItemName('Cannonball');
    }
    setLargeIconFailed(false);
  }, [selectedItemId]);


  // Subscribe to live price tick
  const { data: priceData, loading: priceLoading } = useSubscription<any>(
    LATEST_PRICE_SUBSCRIPTION,
    {
      variables: { itemId: selectedItemId || 2 },
      skip: selectedItemId === null,
    }
  );

  // Subscribe to active alerts
  const { data: alertsData } = useSubscription<any>(
    ACTIVE_ALERTS_SUBSCRIPTION,
    {
      variables: { itemId: selectedItemId || 2 },
      skip: selectedItemId === null,
    }
  );

  const latestPrice = priceData?.latest_item_prices_by_pk;
  const activeAlerts = alertsData?.active_price_alerts || [];

  // Evaluate alerts locally when price changes
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
      const insertQuery = `
        mutation CreateAlert($itemId: Int!, $threshold: bigint!, $operator: String!) {
          insert_active_price_alerts_one(object: {
            item_id: $itemId,
            price_threshold: $threshold,
            comparison_operator: $operator
          }) {
            alert_id
          }
        }
      `;
      
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': 'hasura_secure_admin_secret',
        },
        body: JSON.stringify({
          query: insertQuery,
          variables: {
            itemId: selectedItemId,
            threshold: alertThreshold,
            operator: alertOperator,
          },
        }),
      });

      if (res.ok) {
        setAlertThreshold('');
        alert('Alert registered in database successfully!');
      }
    } catch (err) {
      console.error('Error creating alert:', err);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar - OSRS items */}
      <ItemSidebar />

      {/* Main Content Area */}
      <main className="main-content">
        <ConnectionToast />
        {/* Top Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-panel)',
            border: '2px solid var(--color-border)',
            padding: '8px 16px',
          }}
        >
          <h1 style={{ fontSize: '15px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            OSRS MARKET VALUE TRACKER
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '100%' }}>
            <LiveIndicator />
            <UpdateTimer />
          </div>
        </div>

        {/* Triggered Alerts banner */}
        {triggeredAlerts.map((msg, index) => (
          <AlertBanner
            key={index}
            message={msg}
            type="negative"
            onClose={() => removeTriggeredAlert(index)}
          />
        ))}

        {/* Top section: Selected Item Metrics + History Chart */}
        <div style={{ display: 'flex', gap: '12px', flex: 1, minHeight: '380px' }}>
          {/* Real-time stats panel */}
          <Panel title="LIVE MARKET METRICS" style={{ width: '320px' }}>
            {selectedItemId ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    marginBottom: '12px', 
                    borderBottom: '2px solid var(--color-border)',
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
                        background: 'var(--color-panel-dark)',
                        border: '2px solid var(--color-border)',
                        color: 'var(--color-text-muted)',
                        fontWeight: 'bold',
                        fontSize: '18px'
                      }}>
                        ?
                      </div>
                    )}
                    <h2 style={{ fontSize: '16px', color: 'var(--color-accent)', margin: 0 }}>
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

                {/* Create Alert Box */}
                <div style={{ borderTop: '2px solid var(--color-border)', paddingTop: '12px', marginTop: '12px' }}>
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

          {/* Historical price chart */}
          {selectedItemId && (
            <PriceChart />
          )}
        </div>

        {/* Bottom section: Top movers database table */}
        <div style={{ flex: 1, minHeight: '280px', display: 'flex' }}>
          {selectedItemId && (
            <div style={{ flex: 1 }}>
              <PriceTable />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <ApolloProvider client={client}>
      <ReadinessGate>
        <DashboardContent />
      </ReadinessGate>
    </ApolloProvider>
  );
}
