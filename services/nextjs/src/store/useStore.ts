import { create } from 'zustand';

interface AppState {
  selectedItemId: number | null;
  selectedItemName: string;
  refreshKey: number;
  triggeredAlerts: string[];
  lastFetchedAt: number;
  nextUpdateAt: number;
  connectionStatus: 'online' | 'offline';
  sidebarOpen: boolean;
  
  setSelectedItemId: (id: number | null) => void;
  setSelectedItemName: (name: string) => void;
  incrementRefreshKey: () => void;
  setTriggeredAlerts: (alerts: string[]) => void;
  addTriggeredAlert: (alert: string) => void;
  removeTriggeredAlert: (index: number) => void;
  setSchedule: (lastFetchedAt: number, nextUpdateAt: number) => void;
  setConnectionStatus: (status: 'online' | 'offline') => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useStore = create<AppState>((set) => ({
  selectedItemId: 2, // Default to Cannonball (ID 2)
  selectedItemName: 'Cannonball',
  refreshKey: 0,
  triggeredAlerts: [],
  lastFetchedAt: 0,
  nextUpdateAt: 0,
  connectionStatus: 'online',
  sidebarOpen: false,
  
  setSelectedItemId: (id) => set({ selectedItemId: id }),
  setSelectedItemName: (name) => set({ selectedItemName: name }),
  incrementRefreshKey: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
  setTriggeredAlerts: (alerts) => set((state) => {
    if (JSON.stringify(state.triggeredAlerts) === JSON.stringify(alerts)) return state;
    return { triggeredAlerts: alerts };
  }),
  addTriggeredAlert: (alert) => set((state) => ({ triggeredAlerts: [...state.triggeredAlerts, alert] })),
  removeTriggeredAlert: (index) => set((state) => ({
    triggeredAlerts: state.triggeredAlerts.filter((_, i) => i !== index)
  })),
  setSchedule: (lastFetchedAt, nextUpdateAt) => set({ lastFetchedAt, nextUpdateAt }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
