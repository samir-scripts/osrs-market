import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ item_id: string }> }
) {
  const { item_id } = await params;
  const backendUrl = process.env.BACKEND_URL || 'http://fastapi-backend:8000';
  
  try {
    const res = await fetch(`${backendUrl}/api/prices/latest/${item_id}`, {
      cache: 'no-store'
    });
    
    if (!res.ok) {
      throw new Error(`FastAPI returned ${res.status}`);
    }
    
    const data = await res.json();
    return NextResponse.json({ latest_item_prices_by_pk: data });
  } catch (error: unknown) {
    console.error(`Error in API /api/analytics/latest/${item_id}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
