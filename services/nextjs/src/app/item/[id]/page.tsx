'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import DashboardContent from '../../../components/DashboardContent';
import { useStore } from '../../../store/useStore';

export default function ItemPage() {
  const params = useParams();
  const id = params.id as string;
  const itemId = parseInt(id, 10);
  
  const setSelectedItemId = useStore((state) => state.setSelectedItemId);
  const setSelectedItemName = useStore((state) => state.setSelectedItemName);
  
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch('/api/analytics/items');
        if (!res.ok) throw new Error();
        const data = await res.json();
        setItems(data.items_metadata || []);
      } catch (err) {
        console.error('Error fetching items for detail page:', err);
      }
    };
    fetchItems();
  }, []);

  useEffect(() => {
    if (!isNaN(itemId)) {
      setSelectedItemId(itemId);
      const matched = items.find(item => item.item_id === itemId);
      if (matched) {
        setSelectedItemName(matched.name);
      } else {
        setSelectedItemName(`Item #${itemId}`);
      }
    }
  }, [itemId, items, setSelectedItemId, setSelectedItemName]);

  if (isNaN(itemId)) {
    return <div style={{ padding: '24px', color: '#f5f5f4' }}>INVALID ITEM ID</div>;
  }

  return <DashboardContent />;
}
