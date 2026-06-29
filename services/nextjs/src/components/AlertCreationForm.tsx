'use client';

import React, { useState } from 'react';

interface AlertCreationFormProps {
  selectedItemId: number | null;
}

export default function AlertCreationForm({ selectedItemId }: AlertCreationFormProps) {
  const [alertThreshold, setAlertThreshold] = useState<string>('');
  const [alertOperator, setAlertOperator] = useState<string>('>');

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
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', marginTop: '12px' }}>
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
  );
}
