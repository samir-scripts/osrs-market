'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

interface MoversTableProps {
  items: any[];
  title: string;
  isPriceTable: boolean;
}

const thStyle = {
  padding: '12px 16px',
  textAlign: 'left' as const,
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap' as const,
};

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--color-border-light)',
};

export default function MoversTable({ items, title, isPriceTable }: MoversTableProps) {
  const router = useRouter();

  return (
    <div style={{ border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      <div style={{ background: 'var(--color-text)', color: 'var(--color-bg)', padding: '12px 16px', fontWeight: 'bold' }}>
        [ {title} ]
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead style={{ background: 'var(--color-panel-dark)', color: 'var(--color-text)' }}>
          <tr>
            <th style={thStyle}>Item</th>
            <th style={{...thStyle, textAlign: 'right'}}>Price</th>
            <th style={{...thStyle, textAlign: 'right'}}>Volume</th>
          </tr>
        </thead>
        <tbody>
          {items.map((priceRow: any) => {
            const item = priceRow.item_metadata;
            if (!item) return null;
            const vol = (priceRow.high_price_volume || 0) + (priceRow.low_price_volume || 0);
            
            return (
              <tr 
                key={item.item_id}
                onClick={() => router.push(`/item/${item.item_id}`)}
                style={{ cursor: 'pointer', background: 'var(--color-bg)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-panel-dark)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-bg)'}
              >
                <td style={tdStyle}>
                  {item.name}
                  <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px', fontSize: '12px' }}>
                    {item.item_type?.type_name || ''}
                  </span>
                </td>
                <td style={{
                  ...tdStyle, 
                  textAlign: 'right', 
                  fontFamily: 'monospace',
                  color: isPriceTable ? 'var(--color-positive)' : 'inherit'
                }}>
                  {priceRow.avg_high_price?.toLocaleString()} gp
                </td>
                <td style={{
                  ...tdStyle, 
                  textAlign: 'right', 
                  fontFamily: 'monospace',
                  color: !isPriceTable ? 'var(--color-positive)' : 'inherit'
                }}>
                  {vol.toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
