import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ item_id: string }> }
) {
  const { item_id } = await params;
  
  try {
    const backendUrl = process.env.ANALYTICS_SERVICE_URL || 'http://rust-processor:8001';
    const res = await fetch(`${backendUrl}/items/${item_id}/history`);
    
    if (!res.ok) {
      return NextResponse.json({ data: [] });
    }
    
    const backendData = await res.json();
    const mappedData = (backendData.data || []).map((tick: any) => ({
      timestamp: tick.timestamp,
      avg_high_price: tick.avgHighPrice ?? null,
      avg_low_price: tick.avgLowPrice ?? null,
      high_price_volume: tick.highPriceVolume ?? null,
      low_price_volume: tick.lowPriceVolume ?? null,
    }));
    return NextResponse.json({ data: mappedData });
  } catch (error: unknown) {
    console.error(`Error in API /api/analytics/history/${item_id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
