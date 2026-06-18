'use client';

import React, { useState, useEffect } from 'react';
import { useSubscription } from '@apollo/client/react';
import { gql } from '@apollo/client';
import ItemSidebar from './ItemSidebar';
import Panel from './Panel';
import PriceChart from './PriceChart';
import PriceTable from './PriceTable';
import StatRow from './StatRow';
import LiveIndicator from './LiveIndicator';
import AlertBanner from './AlertBanner';
import { UpdateTimer } from './UpdateTimer';
import { useStore } from '../store/useStore';
import ConnectionToast from './ConnectionToast';

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

export default function DashboardContent() {
  const selectedItemId = useStore((state) => state.selectedItemId);
  const setSelectedItemId = useStore((state) => state.setSelectedItemId);
  const selectedItemName = useStore((state) => state.selectedItemName);
  const setSelectedItemName = useStore((state) => state.setSelectedItemName);
  const refreshKey = useStore((state) => state.refreshKey);
  const incrementRefreshKey = useStore((state) => state.incrementRefreshKey);
  const triggeredAlerts = useStore((state) => state.triggeredAlerts);
  const setTriggeredAlerts = useStore((state) => state.setTriggeredAlerts);
  const removeTriggeredAlert = useStore((state) => state.removeTriggeredAlert);
  const sidebarOpen = useStore((state) => state.sidebarOpen);
  const setSidebarOpen = useStore((state) => state.setSidebarOpen);
  const toggleSidebar = useStore((state) => state.toggleSidebar);

  const [largeIconFailed, setLargeIconFailed] = useState(false);
  
  const [alertThreshold, setAlertThreshold] = useState<string>('');
  const [alertOperator, setAlertOperator] = useState<string>('>');

  useEffect(() => {
    if (selectedItemId === null) {
      setSelectedItemId(2);
      setSelectedItemName('Cannonball');
    }
    setLargeIconFailed(false);
  }, [selectedItemId]);

  const { data: priceData, loading: priceLoading } = useSubscription<any>(
    LATEST_PRICE_SUBSCRIPTION,
    {
      variables: { itemId: selectedItemId || 2 },
      skip: selectedItemId === null,
    }
  );

  const { data: alertsData } = useSubscription<any>(
    ACTIVE_ALERTS_SUBSCRIPTION,
    {
      variables: { itemId: selectedItemId || 2 },
      skip: selectedItemId === null,
    }
  );

  const latestPrice = priceData?.latest_item_prices_by_pk;
  const activeAlerts = alertsData?.active_price_alerts || [];

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
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} 
        onClick={() => setSidebarOpen(false)} 
      />
      <ItemSidebar />

      <main className="main-content">
        <ConnectionToast />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--color-panel)',
            border: '2px solid var(--color-border)',
            padding: '8px 16px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={toggleSidebar}
              className="osrs-btn mobile-menu-btn"
              style={{
                marginRight: '12px',
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              ITEMS ☰
            </button>
            <h1 style={{ fontSize: '15px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
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

          {selectedItemId && (
            <PriceChart />
          )}
        </div>

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
