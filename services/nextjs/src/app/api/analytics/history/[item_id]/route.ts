import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ item_id: string }> }
) {
  const { item_id } = await params;
  
  try {
    const { searchParams } = new URL(request.url);
    const days = searchParams.get('days') || '7';
    
    const backendUrl = process.env.BACKEND_URL || 'http://fastapi-backend:8000';
    const res = await fetch(`${backendUrl}/api/prices/historical/${item_id}`);
    
    if (!res.ok) {
      return NextResponse.json({ timestamps: [], avg_high_prices: [], avg_low_prices: [], total_volumes: [] });
    }
    
    const backendData = await res.json();
    return NextResponse.json(backendData);
  } catch (error: unknown) {
    console.error(`Error in API /api/analytics/history/${item_id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
