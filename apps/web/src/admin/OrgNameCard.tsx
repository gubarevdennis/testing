import { useState } from 'react';
import { patch } from '../api/client';
import { useSession } from '../state/session';
import { toast } from '../components/ui/Toast';
import { errMsg } from './common';

/** Organisation (workspace) name — the top level of the hierarchy (R-SPACE-001). */
export function OrgNameCard() {
  const { me, setMe } = useSession();
  const [name, setName] = useState(me?.org.name ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = !!me && name.trim() !== me.org.name && !!name.trim();
  const save = async () => {
    setBusy(true);
    try {
      const r = await patch<{ org: { name: string } }>('/api/v1/admin/org', { name: name.trim() });
      if (me) setMe({ ...me, org: { ...me.org, name: r.org.name } });
      toast.success('Название организации изменено');
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="card admin-card row"
      style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) void save();
      }}
    >
      <div className="field grow">
        <label htmlFor="org-name">Название организации</label>
        <input id="org-name" className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </div>
      <button type="submit" className="btn" disabled={!dirty || busy} aria-busy={busy}>
        Переименовать
      </button>
    </form>
  );
}
