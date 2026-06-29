import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertCreationForm from '../AlertCreationForm';

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ data: {} }),
  })
) as jest.Mock;

describe('AlertCreationForm', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
    jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders correctly with snapshot', () => {
    const { container } = render(<AlertCreationForm selectedItemId={2} />);
    expect(container).toMatchSnapshot();
  });

  it('submits form correctly', async () => {
    render(<AlertCreationForm selectedItemId={2} />);
    
    const input = screen.getByPlaceholderText('THRESHOLD (GP)');
    const button = screen.getByRole('button', { name: /REGISTER ALERT/i });

    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(window.alert).toHaveBeenCalledWith('Alert registered in database successfully!');
  });
});
