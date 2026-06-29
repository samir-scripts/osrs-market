'use client';

import React from 'react';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import { client } from '../../lib/apollo-client';
import MoversTable from '../../components/MoversTable';

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

  if (loading) return <div style={{ padding: '24px', color: 'var(--color-text)' }}>[ LOADING TOP MOVERS ]</div>;
  if (error) return <div style={{ padding: '24px', color: 'var(--color-negative)' }}>[ ERROR LOADING MOVERS ]</div>;

  const topVolume = data?.top_volume || [];
  const topPrice = data?.top_price || [];

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.05em', marginBottom: '24px' }}>
        [ MARKET MOVERS ]
      </h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
        <MoversTable items={topVolume} title="TOP VOLUME" isPriceTable={false} />
        <MoversTable items={topPrice} title="TOP PRICE" isPriceTable={true} />
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
