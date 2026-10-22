import '../../styles/panels.css';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { X, Download, FileText, Paperclip, ShieldCheck, AlertTriangle } from 'lucide-react';
import { get } from '../../api/client';
import type { PageDto } from '../../api/types';
import { Avatar } from '../Avatar';
import { relTime, fullTime, fileSize, STATUS_LABEL } from '../../lib/format';
import { errMsg } from './directory';

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
