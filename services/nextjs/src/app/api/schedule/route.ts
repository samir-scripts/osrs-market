import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const backendUrl = process.env.BACKEND_URL || 'http://fastapi-backend:8000';
  try {
    const res = await fetch(`${backendUrl}/schedule`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Backend schedule returned status ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching schedule from backend:', error);
    return NextResponse.json({
      last_fetched_at: 0,
      next_update_at: 0,
      poll_interval_sec: 300,
      connection_status: 'offline',
      error: error.message || 'Failed to connect to backend'
    });
  }
}
