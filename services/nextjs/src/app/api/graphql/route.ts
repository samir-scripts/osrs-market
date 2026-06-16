import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const hasuraUrl = process.env.HASURA_URL || 'http://hasura:8080/v1/graphql';
  try {
    const body = await request.json();
    const res = await fetch(hasuraUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': 'hasura_secure_admin_secret',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error proxying GraphQL mutation:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
