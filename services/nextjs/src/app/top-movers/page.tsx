'use client';

import React from 'react';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import { client } from '../../lib/apollo-client';
import { useRouter } from 'next/navigation';

const GET_TOP_MOVERS = gql`
  query GetTopMovers {
    top_volume: latest_item_prices(
      order_by: { high_price_volume: desc },
      limit: 100,
      where: { high_price_volume: { _is_null: false } }
    ) {
      item_metadata {
        item_id
        name
        item_type {
          type_name
        }
      }
      avg_high_price
      high_price_volume
      low_price_volume
    }
    
    top_price: latest_item_prices(
      order_by: { avg_high_price: desc },
      limit: 100,
      where: { avg_high_price: { _is_null: false } }
    ) {
      item_metadata {
        item_id
        name
        item_type {
          type_name
        }
      }
      avg_high_price
      high_price_volume
      low_price_volume
    }
  }
`;

function TopMoversContent() {
  const { data, loading, error } = useQuery<any>(GET_TOP_MOVERS);
  const router = useRouter();

  if (loading) return <div style={{ padding: '24px', color: '#f5f5f4' }}>[ LOADING TOP MOVERS ]</div>;
  if (error) return <div style={{ padding: '24px', color: '#ff4444' }}>[ ERROR LOADING MOVERS ]</div>;

  const topVolume = data?.top_volume || [];
  const topPrice = data?.top_price || [];

  const thStyle = {
    padding: '12px 16px',
    textAlign: 'left' as const,
    borderBottom: '1px solid #f5f5f4',
    whiteSpace: 'nowrap' as const,
  };

  const tdStyle = {
    padding: '12px 16px',
    borderBottom: '1px solid #333',
  };

  const renderTable = (items: any[], title: string, isPriceTable: boolean) => (
    <div style={{ border: '1px solid #f5f5f4', overflow: 'hidden' }}>
      <div style={{ background: '#f5f5f4', color: '#0c0a09', padding: '12px 16px', fontWeight: 'bold' }}>
        [ {title} ]
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead style={{ background: '#1a1a1a', color: '#f5f5f4' }}>
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
                style={{ cursor: 'pointer', background: '#0c0a09' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#1a1a1a'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#0c0a09'}
              >
                <td style={tdStyle}>
                  {item.name}
                  <span style={{ color: '#aaa', marginLeft: '8px', fontSize: '12px' }}>
                    {item.item_type?.type_name || ''}
                  </span>
                </td>
                <td style={{
                  ...tdStyle, 
                  textAlign: 'right', 
                  fontFamily: 'monospace',
                  color: isPriceTable ? '#44ff44' : 'inherit'
                }}>
                  {priceRow.avg_high_price?.toLocaleString()} gp
                </td>
                <td style={{
                  ...tdStyle, 
                  textAlign: 'right', 
                  fontFamily: 'monospace',
                  color: !isPriceTable ? '#44ff44' : 'inherit'
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

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.05em', marginBottom: '24px' }}>
        [ MARKET MOVERS ]
      </h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        {renderTable(topVolume, 'TOP VOLUME', false)}
        {renderTable(topPrice, 'TOP PRICE', true)}
      </div>
    </div>
  );
}

export default function TopMoversPage() {
  return (
    <ApolloProvider client={client}>
      <TopMoversContent />
    </ApolloProvider>
  );
}
