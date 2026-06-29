import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import MoversTable from '../MoversTable';

// Mock useRouter
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('MoversTable', () => {
  const mockItems = [
    {
      item_metadata: { item_id: 2, name: 'Cannonball', item_type: { type_name: 'Ammunition' } },
      avg_high_price: 150,
      high_price_volume: 1000,
      low_price_volume: 500,
    }
  ];

  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders correctly with snapshot', () => {
    const { container } = render(
      <MoversTable items={mockItems} title="TOP VOLUME" isPriceTable={false} />
    );
    expect(container).toMatchSnapshot();
  });

  it('handles row click', () => {
    render(<MoversTable items={mockItems} title="TOP VOLUME" isPriceTable={false} />);
    const row = screen.getByText('Cannonball').closest('tr');
    fireEvent.click(row!);
    expect(mockPush).toHaveBeenCalledWith('/item/2');
  });
});
