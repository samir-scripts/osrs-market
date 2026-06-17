export interface ScheduleData {
  lastFetchedAt: number;
  nextUpdateAt: number;
}

export const scheduleState: ScheduleData = {
  lastFetchedAt: 0,
  nextUpdateAt: 0,
};

type Listener = (data: ScheduleData) => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyClients(data: ScheduleData): void {
  listeners.forEach((listener) => {
    try {
      listener(data);
    } catch (err) {
      console.error('Error notifying SSE listener:', err);
    }
  });
}
