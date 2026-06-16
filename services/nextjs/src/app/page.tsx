'use client';

import React, { useState, useEffect } from 'react';
import { ApolloProvider, useSubscription, useMutation } from '@apollo/client/react';
import { gql } from '@apollo/client';
import { client } from '../lib/apollo-client';
import ItemSidebar from '../components/ItemSidebar';
import Panel from '../components/Panel';
import PriceChart from '../components/PriceChart';
import PriceTable from '../components/PriceTable';
import StatRow from '../components/StatRow';
import LiveIndicator from '../components/LiveIndicator';
import AlertBanner from '../components/AlertBanner';

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

// Helper component that subscribes to the selected item's live price and alert data
function DashboardContent() {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedItemName, setSelectedItemName] = useState<string>('');
  
  // Alert settings form state
  const [alertThreshold, setAlertThreshold] = useState<string>('');
  const [alertOperator, setAlertOperator] = useState<string>('>');
  const [triggeredAlerts, setTriggeredAlerts] = useState<string[]>([]);

  // Default to selecting Item #2 (Cannonball) or first item if nothing is selected
  useEffect(() => {
    if (selectedItemId === null) {
      setSelectedItemId(2); // Set Cannonball as default selection
      setSelectedItemName('Cannonball');
    }
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

  const handleSelectItem = (itemId: number, name: string) => {
    setSelectedItemId(itemId);
    setSelectedItemName(name);
    setTriggeredAlerts([]);
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || !alertThreshold) return;

    try {
      // In a real project we would invoke a mutation, but since Hasura is connected to Postgres,
      // we can run a simple insert mutation!
      // Let's execute insert active_price_alerts
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
      <ItemSidebar selectedItemId={selectedItemId} onSelectItem={handleSelectItem} />

      {/* Main Content Area */}
      <main className="main-content">
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
          <h1 style={{ fontSize: '15px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            OSRS MARKET VALUE TRACKER
          </h1>
          <LiveIndicator />
        </div>

        {/* Triggered Alerts banner */}
        {triggeredAlerts.map((msg, index) => (
          <AlertBanner
            key={index}
            message={msg}
            type="negative"
            onClose={() => setTriggeredAlerts(prev => prev.filter((_, i) => i !== index))}
          />
        ))}

        {/* Top section: Selected Item Metrics + History Chart */}
        <div style={{ display: 'flex', gap: '12px', flex: 1, minHeight: '380px' }}>
          {/* Real-time stats panel */}
          <Panel title="LIVE MARKET METRICS" style={{ width: '320px' }}>
            {selectedItemId ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '16px', color: 'var(--color-accent)', marginBottom: '12px', borderBottom: '2px solid var(--color-border)' }}>
                    {selectedItemName.toUpperCase()}
                  </h2>
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
            <PriceChart itemId={selectedItemId} itemName={selectedItemName} />
          )}
        </div>

        {/* Bottom section: Top movers database table */}
        <div style={{ flex: 1, minHeight: '280px', display: 'flex' }}>
          {selectedItemId && (
            <div style={{ flex: 1 }}>
              <PriceTable onSelectItem={handleSelectItem} />
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
      <DashboardContent />
    </ApolloProvider>
  );
}
