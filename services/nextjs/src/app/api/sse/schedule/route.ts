import { NextRequest } from 'next/server';
import { scheduleState, subscribe, ScheduleData } from './state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: ScheduleData) => {
        try {
          const sseMessage = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(sseMessage));
        } catch (err) {
          console.error('SSE enqueue error:', err);
        }
      };

      // Send current state on connection
      sendEvent(scheduleState);

      // Subscribe to future updates
      const unsubscribe = subscribe((updatedState) => {
        sendEvent(updatedState);
      });

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        try {
          controller.close();
        } catch (e) {
          // Stream might be closed already
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
