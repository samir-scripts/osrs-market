'use client';

import React, { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import Panel from './Panel';

export const GET_ITEMS = gql`
  query GetItems {
    items_metadata(order_by: { name: asc }) {
      item_id
      name
      value
      members
    }
  }
`;

interface Item {
  item_id: number;
  name: string;
  value: number;
  members: boolean;
}

interface ItemSidebarProps {
  selectedItemId: number | null;
  onSelectItem: (itemId: number, name: string) => void;
}

export default function ItemSidebar({ selectedItemId, onSelectItem }: ItemSidebarProps) {
  const { data, loading, error } = useQuery<any>(GET_ITEMS);
  const [search, setSearch] = useState('');

  const items: Item[] = data?.items_metadata || [];

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Panel title="OSRS Items" style={{ height: '100%', width: '260px', borderRight: '4px solid var(--color-border)' }}>
      <div style={{ marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="SEARCH ITEM..."
          className="osrs-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div style={{ overflowY: 'auto', height: 'calc(100% - 40px)', border: '1px solid var(--color-border-light)' }}>
        {loading && <div style={{ padding: '12px', color: 'var(--color-text-muted)' }}>LOADING ITEMS...</div>}
        {error && <div style={{ padding: '12px', color: 'var(--color-negative)' }}>ERROR LOADING ITEMS</div>}
        {!loading && !error && filteredItems.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--color-text-muted)' }}>NO ITEMS FOUND</div>
        )}
        {!loading && !error && filteredItems.map(item => (
          <div
            key={item.item_id}
            className={`item-card ${selectedItemId === item.item_id ? 'active' : ''}`}
            onClick={() => onSelectItem(item.item_id, item.name)}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 'bold', fontSize: '12px', color: item.members ? 'var(--color-accent)' : 'var(--color-text)' }}>
                {item.name}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                ID: {item.item_id} {item.members ? '(M)' : '(F)'}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
              {item.value?.toLocaleString()} gp
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
