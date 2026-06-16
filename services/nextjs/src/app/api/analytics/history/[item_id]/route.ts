import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ item_id: string }> }
) {
  const { item_id } = await params;
  const { searchParams } = new URL(request.url);
  const days = searchParams.get('days') || '7';
  
  const analyticsUrl = process.env.ANALYTICS_SERVICE_URL || 'http://fastapi-analytics:8001';
  try {
    const res = await fetch(`${analyticsUrl}/items/${item_id}/history?days=${days}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Analytics service returned ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`Error in API /api/analytics/history/${item_id}:`, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
