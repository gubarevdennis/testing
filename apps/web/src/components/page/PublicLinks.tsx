import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe2, Trash2, Copy, AlertTriangle } from 'lucide-react';
import { get, post, del } from '../../api/client';
import { toast } from '../ui/Toast';
import { confirm } from '../ui/Confirm';
import { errMsg } from './directory';
import { ExpiryPresets, endOfDay, inDays } from '../space/SpaceAccess';

interface LinkDto {
  id: string;
  createdAt: string;
  createdByName: string | null;
  expiresAt: string | null;
  includeChildren: boolean;
  allowDownload: boolean;
  allowIndex: boolean;
  hasPassword: boolean;
  accessCount: number;
}

/**
 * Public links (R-PUBLISH-009): off unless the organisation policy enables them; creation requires acknowledging that
 * downloaded copies cannot be revoked; noindex by default; expiry, password, download control; revocation.
 */
export function PublicLinksSection({ pageId, canDownloadPolicy }: { pageId: string; canDownloadPolicy: boolean }) {
  const q = useQuery({ queryKey: ['share-links', pageId], queryFn: ({ signal }) => get<{ enabled: boolean; links: LinkDto[] }>(`/api/v1/pages/${pageId}/share-links`, signal) });
  const [open, setOpen] = useState(false);
  const [expiry, setExpiry] = useState(inDays(7));
  const [password, setPassword] = useState('');
  const [download, setDownload] = useState(false);
  const [children, setChildren] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  if (q.isLoading) return null;
  if (q.isError) return <div className="kb-meta">{errMsg(q.error, 'Не удалось загрузить публичные ссылки')}</div>;
  const data = q.data!;
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Публичная ссылка скопирована');
    } catch {
      window.prompt('Скопируйте ссылку', url);
    }
  };
  const create = async () => {
    setBusy(true);
    try {
      const r = await post<{ url: string; path: string }>(`/api/v1/pages/${pageId}/share-links`, { expiresAt: endOfDay(expiry), password: password || null, allowDownload: download, includeChildren: children, acknowledged: true });
      const url = window.location.origin + r.path;
      setCreated(url);
      setOpen(false);
      setPassword('');
      setAck(false);
      q.refetch();
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось создать ссылку'));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (l: LinkDto) => {
    if (!(await confirm({ title: 'Отозвать публичную ссылку?', body: 'Ссылка перестанет открываться сразу. Уже скачанные по ней копии отозвать нельзя.', confirmLabel: 'Отозвать', danger: true }))) return;
    try {
      await del(`/api/v1/share-links/${l.id}`);
      toast.success('Публичная ссылка отозвана');
      if (created) setCreated(null);
      q.refetch();
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось отозвать ссылку'));
    }
  };
  return (
    <section aria-labelledby="pl-title">
      <div className="kb-section-title" id="pl-title">
        Публичная ссылка
      </div>
      {!data.enabled ? (
        <div className="kb-meta">Публичные ссылки отключены администратором организации — страницу открывают только сотрудники с доступом.</div>
      ) : (
        <div className="col" style={{ gap: 6 }}>
          {data.links.map((l) => (
            <div className="share-row" key={l.id}>
              <span className="share-subject-icon">
                <Globe2 size={14} />
              </span>
              <div className="grow">
                <div>Ссылка для всех, у кого она есть</div>
                <div className="kb-meta">
                  {l.expiresAt ? `до ${new Date(l.expiresAt).toLocaleDateString('ru-RU')}` : 'бессрочно'}
                  {l.hasPassword ? ' · с паролем' : ''}
                  {l.allowDownload ? ' · скачивание разрешено' : ' · без скачивания'}
                  {l.includeChildren ? ' · с подстраницами' : ''}
                  {' · не индексируется'}
                  {` · просмотров: ${l.accessCount}`}
                </div>
              </div>
              <button className="btn sm danger" onClick={() => revoke(l)} aria-label="Отозвать публичную ссылку">
                <Trash2 size={14} /> Отозвать
              </button>
            </div>
          ))}
          {created && (
            <div className="alert info" role="status">
              <div className="grow ellipsis">
                Ссылка создана: <code>{created}</code>
              </div>
              <button className="btn sm" onClick={() => copy(created)}>
                <Copy size={14} /> Скопировать
              </button>
            </div>
          )}
          {!open ? (
            <div>
              <button className="btn sm" onClick={() => setOpen(true)}>
                <Globe2 size={14} /> Создать публичную ссылку
              </button>
            </div>
          ) : (
            <div className="share-explain col" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="small muted">Действует:</span>
                <ExpiryPresets value={expiry} onChange={setExpiry} />
                <input type="date" className="input" style={{ width: 150 }} aria-label="Ссылка действует до" value={expiry} min={inDays(0)} onChange={(e) => setExpiry(e.target.value)} />
              </div>
              <input className="input" type="password" autoComplete="new-password" placeholder="Пароль (необязательно, от 6 символов)" aria-label="Пароль ссылки" value={password} onChange={(e) => setPassword(e.target.value)} />
              <label className="checkbox">
                <input type="checkbox" checked={download} disabled={!canDownloadPolicy} onChange={(e) => setDownload(e.target.checked)} /> Разрешить скачивание вложений
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={children} onChange={(e) => setChildren(e.target.checked)} /> Включая подстраницы
              </label>
              <div className="alert warning" role="note">
                <AlertTriangle size={14} className="alert-icon" />
                <div>Страницу сможет открыть любой, у кого есть ссылка, без входа. Отозвать ссылку можно в любой момент, но уже скачанные или скопированные материалы отозвать нельзя. Поисковые системы ссылку не индексируют.</div>
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Понимаю, что скачанное по ссылке нельзя отозвать
              </label>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn primary sm" disabled={!ack || busy || (password.length > 0 && password.length < 6)} aria-busy={busy} onClick={create}>
                  {busy && <span className="spinner" />} Создать ссылку
                </button>
                <button className="btn sm" onClick={() => setOpen(false)}>
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
