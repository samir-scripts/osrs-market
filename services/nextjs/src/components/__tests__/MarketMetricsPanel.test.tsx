import React from 'react';
import { render, screen } from '@testing-library/react';
import MarketMetricsPanel from '../MarketMetricsPanel';

// Mock AlertCreationForm to simplify snapshot
jest.mock('../AlertCreationForm', () => {
  return function MockAlertCreationForm() {
    return <div data-testid="mock-alert-form" />;
  };
});

describe('MarketMetricsPanel', () => {
  const mockPrice = {
    avg_high_price: 150,
    avg_low_price: 140,
    high_price_volume: 1000,
    low_price_volume: 500,
    last_updated: '2023-01-01T12:00:00Z',
  };

  it('renders correctly with snapshot', () => {
    const { container } = render(
      <MarketMetricsPanel 
        selectedItemId={2}
        selectedItemName="Cannonball"
        latestPrice={mockPrice}
        priceLoading={false}
      />
    );
    expect(container).toMatchSnapshot();
  });

  it('displays loading state correctly', () => {
    render(
      <MarketMetricsPanel 
        selectedItemId={2}
        selectedItemName="Cannonball"
        latestPrice={null}
        priceLoading={true}
      />
    );
    expect(screen.getByText('Awaiting stream connection...')).toBeInTheDocument();
  });

  it('displays no selection state correctly', () => {
    render(
      <MarketMetricsPanel 
        selectedItemId={null}
        selectedItemName=""
        latestPrice={null}
        priceLoading={false}
      />
    );
    expect(screen.getByText('SELECT AN ITEM TO INSPECT LIVE DATA')).toBeInTheDocument();
  });
});
