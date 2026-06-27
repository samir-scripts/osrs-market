import { NextResponse } from 'next/server';

export async function GET() {
  const backendUrl = process.env.BACKEND_URL || 'http://fastapi-backend:8000';
  
  try {
    const res = await fetch(`${backendUrl}/api/items`, {
      next: { revalidate: 3600 } // cache for 1 hour
    });
    
    if (!res.ok) {
      throw new Error(`FastAPI returned ${res.status}`);
    }
    
    const data = await res.json();
    return NextResponse.json({ items_metadata: data });
  } catch (error: unknown) {
    console.error('Error in API /api/analytics/items:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
