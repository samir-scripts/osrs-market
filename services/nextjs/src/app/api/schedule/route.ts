import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const producerUrl = process.env.PRODUCER_URL || 'http://fastapi-producer:8000';
  try {
    const res = await fetch(`${producerUrl}/schedule`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Producer schedule returned status ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching schedule from producer:', error);
    return NextResponse.json({
      last_fetched_at: 0,
      next_update_at: 0,
      poll_interval_sec: 300,
      error: error.message || 'Failed to connect to producer'
    });
  }
}
