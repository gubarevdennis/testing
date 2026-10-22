import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Hourglass, Search, Trash } from 'lucide-react';
import { del, get } from '../api/client';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { fullTime, relTime, LEVEL_LABEL } from '../lib/format';
import { Badge, Empty, ErrorState, LoadingRows, SectionHeader, errMsg } from './common';

interface ExpGrant {
  id: string;
  resource_type: 'page' | 'space';
  resource_id: string;
  subject_type: 'user' | 'group' | 'org';
  subject_id: string | null;
  subject_name: string;
  resource_name: string | null;
  level: string;
  expires_at: string;
  reason: string | null;
  expired: boolean;
}

const SUBJECT: Record<string, string> = { user: 'Пользователь', group: 'Группа', org: 'Организация' };

export function ExpiringSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'expiring'], queryFn: () => get<{ grants: ExpGrant[] }>('/api/v1/admin/grants/expiring') });
  const [range, setRange] = useState<'7' | '30' | 'expired' | 'all'>('30');
  const [text, setText] = useState('');
  const now = Date.now();
  const all = q.data?.grants ?? [];
  const list = all.filter((g) => {
    const t = new Date(g.expires_at).getTime();
    if (range === 'expired' && !g.expired) return false;
    if ((range === '7' || range === '30') && (g.expired || t > now + Number(range) * 86400_000)) return false;
    const s = text.trim().toLowerCase();
    return !s || g.subject_name?.toLowerCase().includes(s) || (g.resource_name ?? '').toLowerCase().includes(s);
  });
  const revoke = async (g: ExpGrant) => {
    if (!(await confirm({ title: 'Отозвать доступ сейчас?', body: `${g.subject_name} потеряет доступ «${LEVEL_LABEL[g.level] ?? g.level}» к «${g.resource_name ?? 'ресурсу'}» немедленно, не дожидаясь срока.`, confirmLabel: 'Отозвать', danger: true }))) return;
    try {
      await del(`/api/v1/grants/${g.id}`);
      toast.success('Доступ отозван');
      qc.invalidateQueries({ queryKey: ['admin', 'expiring'] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const soon = all.filter((g) => !g.expired && new Date(g.expires_at).getTime() < now + 7 * 86400_000).length;
  const expired = all.filter((g) => g.expired).length;
  return (
    <section>
      <SectionHeader title="Истекающие доступы" sub={q.data ? `Временных доступов: ${all.length}; истекают в течение недели: ${soon}; уже истекли: ${expired}.` : 'Временные права, выданные на срок.'} />
      <div className="admin-toolbar">
        <div className="admin-search grow">
          <Search size={15} className="admin-search-icon" aria-hidden />
          <input className="input" type="search" placeholder="Кому или к чему выдан доступ" aria-label="Поиск" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <select className="select" aria-label="Период" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
          <option value="7">Истекают в течение 7 дней</option>
          <option value="30">Истекают в течение 30 дней</option>
          <option value="expired">Уже истекли</option>
          <option value="all">Все временные</option>
        </select>
      </div>
      {q.isLoading ? (
        <LoadingRows rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <Empty icon={<Hourglass size={32} />} title={all.length ? 'Нет доступов за выбранный период' : 'Временных доступов нет'}>
          {all.length ? 'Выберите другой период.' : 'Доступы, выданные на срок, появятся здесь.'}
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Кому</th>
                <th>К чему</th>
                <th>Уровень</th>
                <th>Срок</th>
                <th>Причина</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {list.map((g) => (
                <tr key={g.id}>
                  <td>
                    <div>{g.subject_name}</div>
                    <div className="muted small">{SUBJECT[g.subject_type] ?? g.subject_type}</div>
                  </td>
                  <td>
                    <Link to={g.resource_type === 'page' ? `/p/${g.resource_id}` : `/s/${g.resource_id}`}>{g.resource_name ?? '(без названия)'}</Link>
                    <div className="muted small">{g.resource_type === 'page' ? 'Страница' : 'Пространство'}</div>
                  </td>
                  <td className="small">{LEVEL_LABEL[g.level] ?? g.level}</td>
                  <td title={fullTime(g.expires_at)}>
                    <Badge color={g.expired ? 'red' : new Date(g.expires_at).getTime() < now + 7 * 86400_000 ? 'amber' : 'blue'}>{g.expired ? 'истёк ' : ''}{relTime(g.expires_at)}</Badge>
                  </td>
                  <td className="small muted">{g.reason ?? ''}</td>
                  <td className="admin-cell-actions">
                    {!g.expired && (
                      <button className="icon-btn" title="Отозвать сейчас" aria-label={`Отозвать доступ ${g.subject_name}`} onClick={() => revoke(g)}>
                        <Trash size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
