import { NextResponse } from 'next/server';

export async function GET() {
  const analyticsUrl = process.env.ANALYTICS_SERVICE_URL || 'http://fastapi-analytics:8001';
  try {
    const res = await fetch(`${analyticsUrl}/analytics/top-movers?days=24`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Analytics service returned ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in API /api/analytics/top-movers:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
