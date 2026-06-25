'use client';

import React, { useState, useMemo } from 'react';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import { client } from '../../lib/apollo-client';
import { useRouter } from 'next/navigation';
import Fuse from 'fuse.js';

const GET_CATALOGUE = gql`
  query GetCatalogue {
    items_metadata {
      item_id
      name
      value
      item_type {
        type_name
      }
      prices(limit: 1, order_by: { last_updated: desc }) {
        avg_high_price
        avg_low_price
        high_price_volume
        low_price_volume
      }
    }
  }
`;

function CatalogueContent() {
  const { data, loading, error } = useQuery<any>(GET_CATALOGUE);
  const router = useRouter();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('volume'); // 'price', 'volume', 'name', 'type'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  let items = data?.items_metadata || [];

  const processedItems = useMemo(() => {
    let baseItems = items.map((item: any) => {
      const priceData = item.prices?.[0] || {};
      const price = priceData.avg_high_price || item.value || 0;
      const volume = (priceData.high_price_volume || 0) + (priceData.low_price_volume || 0);
      const type = item.item_type?.type_name || 'Misc';
      return {
        ...item,
        currentPrice: price,
        volume,
        type
      };
    });

    if (searchQuery.trim()) {
      const fuse = new Fuse(baseItems, {
        keys: ['name'],
        threshold: 0.3,
      });
      baseItems = fuse.search(searchQuery).map(result => result.item);
    }

    baseItems.sort((a: any, b: any) => {
      let comparison = 0;
      if (sortField === 'price') comparison = (a.currentPrice || 0) - (b.currentPrice || 0);
      else if (sortField === 'volume') comparison = (a.volume || 0) - (b.volume || 0);
      else if (sortField === 'name') comparison = (a.name || '').localeCompare(b.name || '');
      else if (sortField === 'type') comparison = (a.type || '').localeCompare(b.type || '');
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return baseItems;
  }, [items, searchQuery, sortField, sortOrder]);

  if (loading) return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', letterSpacing: '0.1em', color: '#f5f5f4' }}>
        [ LOADING MARKET DATA ]
      </div>
      <div style={{ width: '300px', height: '2px', background: '#333', overflow: 'hidden', position: 'relative' }}>
        <div style={{ 
          width: '40%', 
          height: '100%', 
          background: '#44ff44', 
          position: 'absolute',
          animation: 'loadingBar 1.5s infinite ease-in-out' 
        }} />
      </div>
      <style>{`
        @keyframes loadingBar {
          0% { left: -40%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
  if (error) return <div style={{ padding: '24px', color: '#ff4444' }}>[ ERROR LOADING CATALOGUE ]</div>;

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getSortIndicator = (field: string) => {
    if (sortField !== field) return '';
    return sortOrder === 'desc' ? ' ▼' : ' ▲';
  };

  const thStyle = {
    padding: '12px 16px',
    textAlign: 'left' as const,
    borderBottom: '1px solid #f5f5f4',
    cursor: 'pointer',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  };

  const tdStyle = {
    padding: '12px 16px',
    borderBottom: '1px solid #333',
  };

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.05em', margin: 0 }}>
          [ ITEM CATALOGUE ]
        </h1>
        <input 
          type="text" 
          placeholder="SEARCH ITEM..." 
          className="osrs-input"
          style={{ width: '300px' }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      
      <div style={{ border: '1px solid #f5f5f4', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead style={{ background: '#f5f5f4', color: '#0c0a09', position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <th style={thStyle} onClick={() => handleSort('name')}>Item {getSortIndicator('name')}</th>
              <th style={thStyle} onClick={() => handleSort('type')}>Type {getSortIndicator('type')}</th>
              <th style={{...thStyle, textAlign: 'right'}} onClick={() => handleSort('price')}>Price {getSortIndicator('price')}</th>
              <th style={{...thStyle, textAlign: 'right'}} onClick={() => handleSort('volume')}>Volume {getSortIndicator('volume')}</th>
            </tr>
          </thead>
          <tbody>
            {processedItems.slice(0, 500).map((item: any) => (
              <tr 
                key={item.item_id}
                onClick={() => router.push(`/item/${item.item_id}`)}
                style={{ cursor: 'pointer', background: '#0c0a09' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#1a1a1a'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#0c0a09'}
              >
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {!failedImages[item.item_id] ? (
                      <img
                        src={`https://chisel.weirdgloop.org/static/img/osrs-sprite/${item.item_id}.png`}
                        alt={item.name}
                        style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                        onError={() => setFailedImages(prev => ({ ...prev, [item.item_id]: true }))}
                      />
                    ) : (
                      <div style={{
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        color: '#666',
                        fontWeight: 'bold',
                        fontSize: '10px'
                      }}>
                        ?
                      </div>
                    )}
                    {item.name}
                  </div>
                </td>
                <td style={{...tdStyle, color: '#aaa'}}>{item.type}</td>
                <td style={{...tdStyle, textAlign: 'right', fontFamily: 'monospace'}}>
                  {item.currentPrice.toLocaleString()} gp
                </td>
                <td style={{...tdStyle, textAlign: 'right', fontFamily: 'monospace'}}>
                  {item.volume.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CataloguePage() {
  return (
    <ApolloProvider client={client}>
      <CatalogueContent />
    </ApolloProvider>
  );
}
