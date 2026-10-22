import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export interface ToastDef {
  id: number;
  message: string;
  kind?: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
  duration?: number;
}

interface ToastState {
  toasts: ToastDef[];
  push(t: Omit<ToastDef, 'id'>): number;
  dismiss(id: number): void;
}

let seq = 1;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
    const ms = t.duration ?? (t.action ? 8000 : t.kind === 'error' ? 8000 : 3500);
    if (ms > 0) setTimeout(() => get().dismiss(id), ms);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  info: (message: string, action?: ToastDef['action']) => useToasts.getState().push({ message, action, kind: 'info' }),
  success: (message: string, action?: ToastDef['action']) => useToasts.getState().push({ message, action, kind: 'success' }),
  error: (message: string, action?: ToastDef['action']) => useToasts.getState().push({ message, action, kind: 'error' }),
  /** Important notices that must not disappear before the user can act (e.g. conflict copies). */
  sticky: (message: string, action?: ToastDef['action']) => useToasts.getState().push({ message, action, kind: 'error', duration: 120_000 }),
};

/** Toast region: polite live region, actions (e.g. "Отменить") are keyboard reachable. */
export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + (t.kind ?? '')}>
          <span className="toast-icon">{t.kind === 'success' ? <CheckCircle2 size={16} /> : t.kind === 'error' ? <AlertCircle size={16} /> : <Info size={16} />}</span>
          <span className="toast-msg">{t.message}</span>
          {t.action && (
            <button
              className="btn sm"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="btn sm" aria-label="Закрыть уведомление" onClick={() => dismiss(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
