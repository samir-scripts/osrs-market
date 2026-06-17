import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
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

import { useStore } from '../store/useStore';

interface Item {
  item_id: number;
  name: string;
  value: number;
  members: boolean;
}

interface RowData {
  items: Item[];
  selectedItemId: number | null;
  failedImages: Record<number, boolean>;
  onSelectItem: (itemId: number, name: string) => void;
  onImageError: (itemId: number) => void;
}

const Row = React.memo(({ index, style, data }: ListChildComponentProps<RowData>) => {
  const { items, selectedItemId, failedImages, onSelectItem, onImageError } = data;
  const item = items[index];
  if (!item) return null;

  return (
    <div style={style}>
      <div
        className={`item-card ${selectedItemId === item.item_id ? 'active' : ''}`}
        onClick={() => onSelectItem(item.item_id, item.name)}
        style={{ height: '100%', boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!failedImages[item.item_id] ? (
            <img
              src={`https://chisel.weirdgloop.org/static/img/osrs-sprite/${item.item_id}.png`}
              alt={item.name}
              className="item-icon item-icon-md"
              onError={() => onImageError(item.item_id)}
            />
          ) : (
            <div style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-panel-dark)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              fontWeight: 'bold',
              fontSize: '11px'
            }}>
              ?
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 'bold', fontSize: '12px', color: item.members ? 'var(--color-accent)' : 'var(--color-text)' }}>
              {item.name}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
              ID: {item.item_id} {item.members ? '(M)' : '(F)'}
            </span>
          </div>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {item.value?.toLocaleString()} gp
        </div>
      </div>
    </div>
  );
});

Row.displayName = 'ItemRow';

export default function ItemSidebar() {
  const { data, loading, error } = useQuery<any>(GET_ITEMS);
  const [search, setSearch] = useState('');
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  
  const selectedItemId = useStore((state) => state.selectedItemId);
  const setSelectedItemId = useStore((state) => state.setSelectedItemId);
  const setSelectedItemName = useStore((state) => state.setSelectedItemName);
  const setTriggeredAlerts = useStore((state) => state.setTriggeredAlerts);

  const onSelectItem = (itemId: number, name: string) => {
    setSelectedItemId(itemId);
    setSelectedItemName(name);
    setTriggeredAlerts([]);
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerHeight(Math.max(100, entry.contentRect.height - 4));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleImageError = (itemId: number) => {
    setFailedImages(prev => ({ ...prev, [itemId]: true }));
  };

  const items: Item[] = data?.items_metadata || [];

  const filteredItems = useMemo(() => {
    return items.filter(item =>
      item.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [items, search]);

  const itemData = useMemo(() => ({
    items: filteredItems,
    selectedItemId,
    failedImages,
    onSelectItem,
    onImageError: handleImageError
  }), [filteredItems, selectedItemId, failedImages, onSelectItem]);

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
      <div 
        ref={containerRef}
        style={{ height: 'calc(100% - 40px)', border: '1px solid var(--color-border-light)', overflow: 'hidden' }}
      >
        {loading && <div style={{ padding: '12px', color: 'var(--color-text-muted)' }}>LOADING ITEMS...</div>}
        {error && <div style={{ padding: '12px', color: 'var(--color-negative)' }}>ERROR LOADING ITEMS</div>}
        {!loading && !error && filteredItems.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--color-text-muted)' }}>NO ITEMS FOUND</div>
        )}
        {!loading && !error && filteredItems.length > 0 && (
          <FixedSizeList
            height={containerHeight}
            itemCount={filteredItems.length}
            itemSize={64}
            width="100%"
            itemData={itemData}
          >
            {Row}
          </FixedSizeList>
        )}
      </div>
    </Panel>
  );
}


