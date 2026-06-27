import { NextResponse } from 'next/server';

export async function GET() {
  const backendUrl = process.env.BACKEND_URL || 'http://fastapi-backend:8000';
  
  try {
    const res = await fetch(`${backendUrl}/api/analytics/top-stats`, {
      cache: 'no-store'
    });
    
    if (!res.ok) {
      throw new Error(`FastAPI returned ${res.status}`);
    }
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error in API /api/analytics/top-stats:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
