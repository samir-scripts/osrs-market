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
      prices(limit: 1) {
        avg_high_price
        avg_low_price
        previous_avg_high_price
        previous_avg_low_price
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
      
      let priceChange = 0;
      let volumeChange = 0;
      let hasPrevData = false;

      if (priceData.previous_avg_high_price !== undefined && priceData.previous_avg_high_price !== null) {
        hasPrevData = true;
        const prevPrice = priceData.previous_avg_high_price || item.value || 0;
        priceChange = price - prevPrice;
        
        // Since we didn't add previous volume tracking, we can leave volumeChange 0 or add it later if needed.
        volumeChange = 0; 
      }

      return {
        ...item,
        currentPrice: price,
        volume,
        type,
        priceChange,
        volumeChange,
        hasPrevData
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
      <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', letterSpacing: '0.1em', color: 'var(--color-text)' }}>
        [ LOADING MARKET DATA ]
      </div>
      <div style={{ width: '300px', height: '2px', background: 'var(--color-border-light)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ 
          width: '40%', 
          height: '100%', 
          background: 'var(--color-positive)', 
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
  if (error) return <div style={{ padding: '24px', color: 'var(--color-negative)' }}>[ ERROR LOADING CATALOGUE ]</div>;

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
    borderBottom: '1px solid var(--color-border)',
    cursor: 'pointer',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  };

  const tdStyle = {
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border-light)',
  };

  const renderIndicator = (change: number, hasData: boolean) => {
    if (!hasData) return <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px' }}>=</span>;
    if (change > 0) return <span className="text-positive" style={{ marginLeft: '8px' }}>▲</span>;
    if (change < 0) return <span className="text-negative" style={{ marginLeft: '8px' }}>▼</span>;
    return <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px' }}>=</span>;
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
      
      <div style={{ border: '1px solid var(--color-border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead style={{ background: 'var(--color-text)', color: 'var(--color-bg)', position: 'sticky', top: 0, zIndex: 10 }}>
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
                style={{ cursor: 'pointer', background: 'var(--color-bg)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-panel-dark)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-bg)'}
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
                        background: 'var(--color-panel-dark)',
                        border: '1px solid var(--color-border-light)',
                        color: 'var(--color-text-dim)',
                        fontWeight: 'bold',
                        fontSize: '10px'
                      }}>
                        ?
                      </div>
                    )}
                    {item.name}
                  </div>
                </td>
                <td style={{...tdStyle, color: 'var(--color-text-muted)'}}>{item.type}</td>
                <td style={{...tdStyle, textAlign: 'right', fontFamily: 'monospace'}}>
                  {item.currentPrice.toLocaleString()} gp
                  {renderIndicator(item.priceChange, item.hasPrevData)}
                </td>
                <td style={{...tdStyle, textAlign: 'right', fontFamily: 'monospace'}}>
                  {item.volume.toLocaleString()}
                  {renderIndicator(item.volumeChange, item.hasPrevData)}
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
