import { useSubscription } from '@apollo/client/react';
import { gql } from '@apollo/client';

const LATEST_PRICE_SUBSCRIPTION = gql`
  subscription GetLatestPrice($itemId: Int!) {
    latest_item_prices_by_pk(item_id: $itemId) {
      item_id
      avg_high_price
      avg_low_price
      high_price_volume
      low_price_volume
      last_updated
    }
  }
`;

const ACTIVE_ALERTS_SUBSCRIPTION = gql`
  subscription GetActiveAlerts($itemId: Int!) {
    active_price_alerts(where: { item_id: { _eq: $itemId }, is_active: { _eq: true } }) {
      alert_id
      price_threshold
      comparison_operator
    }
  }
`;

export function useMarketData(selectedItemId: number | null) {
  const { data: priceData, loading: priceLoading } = useSubscription<any>(
    LATEST_PRICE_SUBSCRIPTION,
    {
      variables: { itemId: selectedItemId || 2 },
      skip: selectedItemId === null,
    }
  );

  const { data: alertsData } = useSubscription<any>(
    ACTIVE_ALERTS_SUBSCRIPTION,
    {
      variables: { itemId: selectedItemId || 2 },
      skip: selectedItemId === null,
    }
  );

  const latestPrice = priceData?.latest_item_prices_by_pk;
  const activeAlerts = alertsData?.active_price_alerts || [];

  return { latestPrice, priceLoading, activeAlerts };
}
