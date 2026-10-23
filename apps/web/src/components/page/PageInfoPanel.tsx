import '../../styles/panels.css';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { X, Download, FileText, Paperclip, ShieldCheck, AlertTriangle, Plus, Trash2, Scale } from 'lucide-react';
import { get, patch, put, ApiError } from '../../api/client';
import { useMe } from '../../state/session';
import { toast } from '../ui/Toast';
import { Dialog } from '../ui/Dialog';
import type { PageDto } from '../../api/types';
import { Avatar } from '../Avatar';
import { relTime, fullTime, fileSize, STATUS_LABEL } from '../../lib/format';
import { errMsg } from './directory';
import { undoPropertyChange } from '../../lib/undoChange';

interface Backlink {
  id: string;
  title: string;
  icon: string | null;
  kind: string;
}
interface AttachmentItem {
  id: string;
  filename: string;
  mime: string;
  size: number;
  kind: string;
  version: number;
  deleted: boolean;
  createdAt: string;
  downloadUrl: string;
  contentUrl: string;
}

const STATUS_BADGE: Record<string, string> = { draft: '', review: 'amber', published: 'green', archived: 'purple' };

function readingMinutes(words: number) {
  return Math.max(1, Math.round(words / 180));
}

export function PageInfoPanel({ page, wordCount, onClose }: { page: PageDto; wordCount: number; onClose(): void }) {
  const backlinks = useQuery({
    queryKey: ['backlinks', page.id],
    queryFn: ({ signal }) => get<{ backlinks: Backlink[] }>(`/api/v1/pages/${page.id}/backlinks`, signal),
  });
  const files = useQuery({
    queryKey: ['page-attachments', page.id],
    queryFn: ({ signal }) => get<{ canDownload: boolean; attachments: AttachmentItem[] }>(`/api/v1/pages/${page.id}/attachments`, signal),
  });
  const attachments = (files.data?.attachments ?? []).filter((a) => !a.deleted);
  const totalSize = attachments.reduce((s, a) => s + (a.size || 0), 0);
  const reviewOverdue = page.reviewDueAt && new Date(page.reviewDueAt) < new Date();

  return (
    <aside className="kb-panel" aria-label="Сведения о странице">
      <div className="kb-panel-header">
        <div className="kb-panel-title">Сведения о странице</div>
        <button className="icon-btn" aria-label="Закрыть сведения" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="kb-panel-body">
        <div className="kb-section-title">Основное</div>
        <dl className="kb-kv">
          <dt>Владелец</dt>
          <dd>
            {page.owner ? (
              <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                <Avatar name={page.owner.name} id={page.owner.id} /> <span className="ellipsis">{page.owner.name}</span>
              </span>
            ) : (
              <span className="muted">не назначен</span>
            )}
          </dd>
          <dt>Статус</dt>
          <dd>
            <span className={'badge ' + (STATUS_BADGE[page.status] ?? '')}>{STATUS_LABEL[page.status] ?? page.status}</span>
            {page.locked && <span className="badge" style={{ marginLeft: 6 }}>Защищена</span>}
          </dd>
          <dt>Пространство</dt>
          <dd className="ellipsis">
            {page.space.icon ? page.space.icon + ' ' : ''}
            {page.space.name}
          </dd>
          <dt>Создана</dt>
          <dd title={fullTime(page.createdAt)}>
            {fullTime(page.createdAt)}
            {page.createdBy && <div className="kb-meta">{page.createdBy.name}</div>}
          </dd>
          <dt>Изменена</dt>
          <dd title={fullTime(page.contentUpdatedAt ?? page.updatedAt)}>
            {relTime(page.contentUpdatedAt ?? page.updatedAt)}
            {page.updatedBy && <div className="kb-meta">{page.updatedBy.name}</div>}
          </dd>
          <dt>Версия</dt>
          <dd>{page.version}</dd>
        </dl>

        <TagsEditor page={page} />
        <PropertiesEditor page={page} />
        <LegalHold page={page} />

        {(page.reviewDueAt || page.verifiedAt || page.needsReview) && (
          <>
            <div className="kb-section-title">Актуальность</div>
            <dl className="kb-kv">
              {page.verifiedAt && (
                <>
                  <dt>Проверена</dt>
                  <dd title={fullTime(page.verifiedAt)}>
                    <ShieldCheck size={13} style={{ color: 'var(--success)', verticalAlign: -2 }} /> {relTime(page.verifiedAt)}
                  </dd>
                </>
              )}
              {page.reviewDueAt && (
                <>
                  <dt>Проверить до</dt>
                  <dd title={fullTime(page.reviewDueAt)} style={reviewOverdue ? { color: 'var(--warning)' } : undefined}>
                    {reviewOverdue && <AlertTriangle size={13} style={{ verticalAlign: -2 }} />} {new Date(page.reviewDueAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {reviewOverdue && ' — срок прошёл'}
                  </dd>
                </>
              )}
            </dl>
            {page.needsReview && !reviewOverdue && <div className="alert warning" style={{ marginTop: 8 }}>Страница требует проверки актуальности.</div>}
          </>
        )}

        <div className="kb-section-title">Текст</div>
        <dl className="kb-kv">
          <dt>Слов</dt>
          <dd>{wordCount.toLocaleString('ru-RU')}</dd>
          <dt>Время чтения</dt>
          <dd>{wordCount ? `≈ ${readingMinutes(wordCount)} мин` : '—'}</dd>
        </dl>

        <div className="kb-section-title">Ссылаются на эту страницу{backlinks.data ? ` (${backlinks.data.backlinks.length})` : ''}</div>
        {backlinks.isLoading && <div className="skeleton" style={{ height: 32 }} />}
        {backlinks.isError && <div className="kb-error">{errMsg(backlinks.error, 'Не удалось загрузить обратные ссылки')}</div>}
        {backlinks.data && !backlinks.data.backlinks.length && <div className="kb-meta">Других страниц со ссылками сюда нет (или они вам недоступны).</div>}
        <div className="kb-list">
          {backlinks.data?.backlinks.map((b) => (
            <Link key={b.id + b.kind} to={'/p/' + b.id} className="kb-list-item">
              <span style={{ width: 18, textAlign: 'center', flex: 'none' }}>{b.icon ?? <FileText size={15} className="muted" />}</span>
              <span className="grow ellipsis">{b.title || 'Без названия'}</span>
              {b.kind && b.kind !== 'link' && <span className="kb-meta">{b.kind === 'mention' ? 'упоминание' : b.kind === 'embed' ? 'встраивание' : b.kind === 'synced' ? 'синхр. блок' : b.kind}</span>}
            </Link>
          ))}
        </div>

        <div className="kb-section-title">
          Вложения{files.data ? ` (${attachments.length}${totalSize ? ', ' + fileSize(totalSize) : ''})` : ''}
        </div>
        {files.isLoading && <div className="skeleton" style={{ height: 32 }} />}
        {files.isError && <div className="kb-error">{errMsg(files.error, 'Не удалось загрузить вложения')}</div>}
        {files.data && !attachments.length && <div className="kb-meta">Файлов нет.</div>}
        {files.data && !files.data.canDownload && attachments.length > 0 && <div className="kb-meta" style={{ marginBottom: 4 }}>Скачивание файлов запрещено политикой или правами.</div>}
        <div className="kb-list">
          {attachments.map((a) => (
            <div key={a.id} className="kb-list-item">
              <Paperclip size={15} className="muted" style={{ flex: 'none' }} />
              <div className="grow">
                <div className="ellipsis" title={a.filename}>
                  {a.filename}
                </div>
                <div className="kb-meta">
                  {fileSize(a.size)}
                  {a.version > 1 ? ` · версия ${a.version}` : ''} · {relTime(a.createdAt)}
                </div>
              </div>
              {files.data?.canDownload && (
                <a className="icon-btn" href={a.downloadUrl} download aria-label={`Скачать ${a.filename}`} title="Скачать">
                  <Download size={15} />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/**
 * Page tags (R-PAGE-001): added with Enter or comma, removed with ×; every change is saved at once and can be undone.
 * Clicking a tag searches pages with that tag.
 */
function TagsEditor({ page }: { page: PageDto }) {
  const qc = useQueryClient();
  const canEdit = !!page.access.actions.edit && !page.deletedAt && (!page.locked || page.access.level === 'full');
  const tags = page.tags ?? [];
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  if (!tags.length && !canEdit) return null;
  const save = async (next: string[], what: string) => {
    setBusy(true);
    try {
      const r = await patch<{ undoEventId: string | null }>(`/api/v1/pages/${page.id}`, { tags: next });
      if (r.undoEventId) toast.success(what, { label: 'Отменить', run: () => void undoPropertyChange(page.id, r.undoEventId!, () => qc.invalidateQueries({ queryKey: ['page', page.id] })) });
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось сохранить теги'));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['page', page.id] });
    }
  };
  const add = () => {
    const parts = draft.split(',').map((t) => t.replace(/^#+/, '').trim()).filter(Boolean);
    if (!parts.length) return;
    setDraft('');
    const fresh = parts.filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));
    if (fresh.length) void save([...tags, ...fresh], fresh.length > 1 ? 'Теги добавлены' : `Тег «${fresh[0]}» добавлен`);
  };
  return (
    <>
      <div className="kb-section-title">Теги</div>
      <div className="kb-tags" aria-label="Теги страницы" data-testid="page-tags">
        {tags.map((t) => (
          <span key={t} className="badge kb-tag">
            <Link to={`/search?q=${encodeURIComponent(t)}&tag=${encodeURIComponent(t)}`} title={`Найти страницы с тегом «${t}»`}>
              #{t}
            </Link>
            {canEdit && (
              <button className="icon-btn xs" aria-label={`Убрать тег «${t}»`} disabled={busy} onClick={() => void save(tags.filter((x) => x !== t), `Тег «${t}» убран`)}>
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        {!tags.length && <span className="muted small">Тегов нет</span>}
      </div>
      {canEdit && (
        <form
          className="row"
          style={{ gap: 4, marginTop: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input className="input sm grow" aria-label="Новый тег" placeholder="Добавить тег" maxLength={50} value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn sm" type="submit" disabled={busy || !draft.trim()}>
            <Plus size={13} /> Тег
          </button>
        </form>
      )}
    </>
  );
}

function propText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Inline editor of page properties (R-PAGE-022, R-PAGE-023). Each change is saved at once with the page version
 * the user saw; if someone else changed the page meanwhile, nothing is overwritten and fresh values are shown.
 */
function PropertiesEditor({ page }: { page: PageDto }) {
  const qc = useQueryClient();
  const canEdit = !!page.access.actions.edit && !page.deletedAt && (!page.locked || page.access.level === 'full');
  const required = page.requiredProperties ?? [];
  const props = page.properties ?? {};
  const keys = [...new Set([...required, ...Object.keys(props)])];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [busy, setBusy] = useState(false);

  /** Saves the changes; true when they reached the server. */
  const save = async (changes: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await patch<{ undoEventId: string | null }>(`/api/v1/pages/${page.id}`, { properties: changes, expectedVersion: page.version });
      if (r.undoEventId) toast.success('Свойство сохранено', { label: 'Отменить', run: () => void undoPropertyChange(page.id, r.undoEventId!, () => qc.invalidateQueries({ queryKey: ['page', page.id] })) });
      setDrafts((d) => {
        const n = { ...d };
        for (const k of Object.keys(changes)) delete n[k];
        return n;
      });
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'version_conflict') toast.error('Свойства только что изменил другой пользователь — показаны актуальные значения. Повторите правку.');
      else toast.error(e instanceof ApiError ? e.message : 'Не удалось сохранить свойство');
      return false;
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['page', page.id] });
    }
  };
  const dropDraft = (k: string) =>
    setDrafts((d) => {
      const n = { ...d };
      delete n[k];
      return n;
    });
  const commit = (k: string) => {
    if (drafts[k] === undefined) return;
    const text = drafts[k].trim();
    if (text === propText(props[k])) return dropDraft(k);
    const value = Array.isArray(props[k]) ? text.split(',').map((x) => x.trim()).filter(Boolean) : text;
    void save({ [k]: text ? value : null });
  };
  const add = () => {
    const k = newKey.trim();
    if (!k) return;
    // the typed key and value stay for a retry when saving fails (QA-A7)
    void save({ [k]: newValue.trim() }).then((ok) => {
      if (!ok) return;
      setNewKey('');
      setNewValue('');
    });
  };

  if (!keys.length && !canEdit) return null;
  const missing = required.filter((k) => !propText(props[k]).trim());
  return (
    <>
      <div className="kb-section-title">Свойства</div>
      {missing.length > 0 && (
        <div className="alert warning" role="status" style={{ marginBottom: 8 }}>
          Шаблон требует заполнить: {missing.join(', ')}
        </div>
      )}
      <dl className="kb-kv kb-props" aria-label="Свойства страницы">
        {keys.map((k) => {
          const isReq = required.includes(k);
          const value = drafts[k] ?? propText(props[k]);
          return (
            <div key={k} style={{ display: 'contents' }}>
              <dt>
                {k}
                {isReq && <span aria-label="обязательно" title="Обязательное свойство шаблона"> *</span>}
              </dt>
              <dd className="row" style={{ gap: 4 }}>
                {canEdit ? (
                  <>
                    <input
                      className="input sm grow"
                      aria-label={`Свойство «${k}»`}
                      value={value}
                      placeholder={isReq ? 'Заполните' : '—'}
                      disabled={busy}
                      onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
                      onBlur={() => commit(k)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                        if (e.key === 'Escape') dropDraft(k);
                      }}
                    />
                    {!isReq && k in props && (
                      <button className="icon-btn sm" aria-label={`Удалить свойство «${k}»`} disabled={busy} onClick={() => void save({ [k]: null })}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </>
                ) : (
                  <span className="ellipsis">{value || <span className="muted">—</span>}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      {canEdit && (
        <form
          className="row"
          style={{ gap: 4, marginTop: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input className="input sm" style={{ width: '40%' }} aria-label="Название нового свойства" placeholder="Свойство" value={newKey} onChange={(e) => setNewKey(e.target.value)} maxLength={100} />
          <input className="input sm grow" aria-label="Значение нового свойства" placeholder="Значение" value={newValue} onChange={(e) => setNewValue(e.target.value)} maxLength={1000} />
          <button className="icon-btn sm" type="submit" aria-label="Добавить свойство" disabled={busy || !newKey.trim()}>
            <Plus size={14} />
          </button>
        </form>
      )}
    </>
  );
}

/** Legal hold (R-HISTORY-015): visible to everyone, set or released by org admins with a recorded reason. */
function LegalHold({ page }: { page: PageDto }) {
  const me = useMe();
  const qc = useQueryClient();
  const isAdmin = ['owner', 'admin'].includes(me.user.orgRole);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!page.legalHold && !isAdmin) return null;
  const next = !page.legalHold;
  const submit = async () => {
    setBusy(true);
    try {
      await put('/api/v1/admin/legal-hold', { resourceType: 'page', resourceId: page.id, hold: next, reason: reason.trim() });
      toast.success(next ? 'Юридическое удержание установлено' : 'Юридическое удержание снято');
      setOpen(false);
      setReason('');
      qc.invalidateQueries({ queryKey: ['page', page.id] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось изменить удержание');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="kb-section-title">Хранение</div>
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Scale size={14} className="muted" />
        <span className="grow">{page.legalHold ? 'Юридическое удержание: страницу и её историю нельзя удалить окончательно' : 'Юридического удержания нет'}</span>
        {isAdmin && (
          <button className="btn sm" onClick={() => setOpen(true)}>
            {page.legalHold ? 'Снять удержание' : 'Установить удержание'}
          </button>
        )}
      </div>
      <Dialog
        open={open}
        title={next ? 'Установить юридическое удержание' : 'Снять юридическое удержание'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>
              Отмена
            </button>
            <button className="btn primary" disabled={busy || reason.trim().length < 3} onClick={() => void submit()}>
              {next ? 'Установить' : 'Снять'}
            </button>
          </>
        }
      >
        <div className="col" style={{ gap: 8 }}>
          <p className="muted">
            {next
              ? 'Пока действует удержание, страницу нельзя удалить окончательно, а её журнал и версии не очищаются по сроку хранения.'
              : 'После снятия удержания на страницу снова действуют обычные сроки хранения.'}{' '}
            Действие записывается в журнал аудита.
          </p>
          <label className="col" style={{ gap: 4 }}>
            <span>Основание</span>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: судебный запрос №…" autoFocus maxLength={500} />
          </label>
        </div>
      </Dialog>
    </>
  );
}
