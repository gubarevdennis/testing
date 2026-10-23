import { useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { Dialog } from './Dialog';

interface ConfirmReq {
  title: string;
  body: ReactNode;
  /** The button names the action («Удалить», «Переместить»): a generic «OK» hides what happens (R-UI-027). */
  confirmLabel: string;
  danger?: boolean;
  /** Text the user must type to confirm (dangerous irreversible operations). */
  typeToConfirm?: string;
  resolve(v: boolean): void;
}

const useConfirmStore = create<{ req: ConfirmReq | null; set(r: ConfirmReq | null): void }>((set) => ({ req: null, set: (req) => set({ req }) }));

export function confirm(opts: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...opts, resolve }));
}

export function ConfirmHost() {
  const { req, set } = useConfirmStore();
  const [typed, setTyped] = useState('');
  if (!req) return null;
  const close = (v: boolean) => {
    req.resolve(v);
    set(null);
    setTyped('');
  };
  const ok = !req.typeToConfirm || typed.trim() === req.typeToConfirm;
  return (
    <Dialog
      open
      title={req.title}
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn" onClick={() => close(false)}>
            Отмена
          </button>
          <button className={'btn ' + (req.danger ? 'danger solid' : 'primary')} disabled={!ok} onClick={() => close(true)}>
            {req.confirmLabel}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <div>{req.body}</div>
        {req.typeToConfirm && (
          <div className="field">
            <label htmlFor="confirm-type">
              Для подтверждения введите: <b>{req.typeToConfirm}</b>
            </label>
            <input id="confirm-type" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
      </div>
    </Dialog>
  );
}
