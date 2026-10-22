import { create } from 'zustand';
import type { Me } from '../api/types';

interface SessionState {
  me: Me | null;
  setMe: (m: Me | null) => void;
}

export const useSession = create<SessionState>((set) => ({ me: null, setMe: (me) => set({ me }) }));

export function useMe(): Me {
  const me = useSession((s) => s.me);
  if (!me) throw new Error('useMe outside of an authenticated area');
  return me;
}
