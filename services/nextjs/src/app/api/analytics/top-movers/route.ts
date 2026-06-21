import { NextResponse } from 'next/server';

export async function GET() {
  const hasuraUrl = process.env.HASURA_URL || 'http://hasura:8080/v1/graphql';
  const query = `
    query GetTopMovers {
      daily_top_movers(order_by: {percent_change: desc}, limit: 10) {
        item_id
        name
        start_price
        end_price
        percent_change
      }
    }
  `;

  try {
    const res = await fetch(hasuraUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'hasura_secure_admin_secret',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });
    
    if (!res.ok) {
      throw new Error(`Hasura GraphQL returned ${res.status}`);
    }
    
    const { data, errors } = await res.json();
    if (errors) {
      console.error('Hasura GraphQL errors:', errors);
      throw new Error('GraphQL query failed');
    }

    // Transform Hasura response to match frontend expectations
    const movers = (data?.daily_top_movers || []).map((m: { item_id: number; name: string; start_price: number; end_price: number; percent_change: number }) => ({
      item_id: m.item_id,
      name: m.name,
      start_price: m.start_price,
      end_price: m.end_price,
      percent_change: m.percent_change
    }));

    return NextResponse.json({ movers });
  } catch (error: unknown) {
    console.error('Error in API /api/analytics/top-movers:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
