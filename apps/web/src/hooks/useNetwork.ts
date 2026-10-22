import { create } from 'zustand';

/** Browser connectivity + server reachability (updated by API/WebSocket failures). */
export const useNetwork = create<{ online: boolean; serverReachable: boolean; set(p: Partial<{ online: boolean; serverReachable: boolean }>): void }>((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  serverReachable: true,
  set: (p) => set(p),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useNetwork.getState().set({ online: true }));
  window.addEventListener('offline', () => useNetwork.getState().set({ online: false }));
}
