'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ApolloProvider, useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import { client } from '../../../lib/apollo-client';
import DashboardContent from '../../../components/DashboardContent';
import { useStore } from '../../../store/useStore';

const GET_ITEM_NAME = gql`
  query GetItemName($itemId: Int!) {
    items_metadata_by_pk(item_id: $itemId) {
      name
    }
  }
`;

function ItemPageContent({ id }: { id: string }) {
  const itemId = parseInt(id, 10);
  const setSelectedItemId = useStore((state) => state.setSelectedItemId);
  const setSelectedItemName = useStore((state) => state.setSelectedItemName);
  
  const { data } = useQuery<any>(GET_ITEM_NAME, {
    variables: { itemId },
    skip: isNaN(itemId)
  });

  useEffect(() => {
    if (!isNaN(itemId)) {
      setSelectedItemId(itemId);
      if (data?.items_metadata_by_pk?.name) {
        setSelectedItemName(data.items_metadata_by_pk.name);
      } else {
        setSelectedItemName(`Item #${itemId}`);
      }
    }
  }, [itemId, data, setSelectedItemId, setSelectedItemName]);

  if (isNaN(itemId)) {
    return <div style={{ padding: '24px', color: '#f5f5f4' }}>INVALID ITEM ID</div>;
  }

  return <DashboardContent />;
}

export default function ItemPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <ApolloProvider client={client}>
      <ItemPageContent id={id} />
    </ApolloProvider>
  );
}
