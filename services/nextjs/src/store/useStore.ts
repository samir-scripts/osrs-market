import { create } from 'zustand';

interface AppState {
  selectedItemId: number | null;
  selectedItemName: string;
  refreshKey: number;
  triggeredAlerts: string[];
  
  setSelectedItemId: (id: number | null) => void;
  setSelectedItemName: (name: string) => void;
  incrementRefreshKey: () => void;
  setTriggeredAlerts: (alerts: string[]) => void;
  addTriggeredAlert: (alert: string) => void;
  removeTriggeredAlert: (index: number) => void;
}

export const useStore = create<AppState>((set) => ({
  selectedItemId: 2, // Default to Cannonball (ID 2)
  selectedItemName: 'Cannonball',
  refreshKey: 0,
  triggeredAlerts: [],
  
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
}));
