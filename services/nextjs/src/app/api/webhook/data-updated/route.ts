import { NextRequest, NextResponse } from 'next/server';
import { scheduleState, notifyClients } from '../../sse/schedule/state';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (body.event !== 'data_updated') {
      return NextResponse.json({ error: 'Unknown event type' }, { status: 400 });
    }

    scheduleState.lastFetchedAt = Number(body.fetched_at || 0);
    scheduleState.nextUpdateAt = Number(body.next_update_at || 0);

    // Notify all active SSE streams
    notifyClients({ ...scheduleState });

    return NextResponse.json({
      status: 'success',
      received: {
        lastFetchedAt: scheduleState.lastFetchedAt,
        nextUpdateAt: scheduleState.nextUpdateAt,
      },
    });
  } catch (error: any) {
    console.error('Error in webhook/data-updated route:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
