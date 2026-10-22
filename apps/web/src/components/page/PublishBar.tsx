import '../../styles/panels.css';
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, CheckCircle2, Undo2, Globe2, EyeOff, Archive, ArchiveRestore, History } from 'lucide-react';
import { get, post, ApiError } from '../../api/client';
import type { PageDto } from '../../api/types';
import { Dialog } from '../ui/Dialog';
import { confirm } from '../ui/Confirm';
import { toast } from '../ui/Toast';
import { relTime, fullTime } from '../../lib/format';
import { useMe } from '../../state/session';
import { DirectoryPicker, errMsg, type DirUser } from './directory';

type Approval = NonNullable<PageDto['approval']>;

const STATUS_TEXT: Record<string, string> = { draft: 'Черновик', review: 'На согласовании', published: 'Опубликовано', archived: 'Архив' };
const STATUS_BADGE: Record<string, string> = { draft: '', review: 'amber', published: 'green', archived: 'purple' };

/** Asks the page view to open the history panel (PageView listens for this event). */
function openHistory(revisionId?: string | null) {
  window.dispatchEvent(new CustomEvent('kb:open-history', { detail: { revisionId: revisionId ?? null } }));
}

export function PublishBar({ page, onChanged }: { page: PageDto; onChanged(): void }) {
  const me = useMe();
  const qc = useQueryClient();
  const policy = page.access.policy;
  const mode = policy?.publishingMode ?? 'live';
  const requireApproval = !!policy?.requireApproval;
  const a = page.access.actions;
  const canEdit = !!a.edit;
  const canPublish = !!a.publish;
  const canArchive = !!a.manage_structure;
  const workflow = mode === 'publish' || requireApproval;
  const hasState = page.status === 'review' || page.status === 'archived';
  const visible = workflow || hasState;

  const pending = page.status === 'review' ? page.approval : null;

  const publishedId = page.published?.revisionId ?? page.publishedRevisionId;
  // Unpublished changes: compare the published revision with the live document (editors only).
  const changes = useQuery({
    queryKey: ['revision-diff', page.id, publishedId, 'current', page.version],
    queryFn: ({ signal }) => get<{ stats: { added: number; removed: number; changed: number } }>(`/api/v1/pages/${page.id}/revisions/${publishedId}/diff?against=current`, signal),
    enabled: visible && canEdit && !!publishedId && page.status === 'published',
    staleTime: 30_000,
  });
  const unpublished = changes.data ? changes.data.stats.added + changes.data.stats.removed + changes.data.stats.changed : 0;

  const [busy, setBusy] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [decide, setDecide] = useState<null | 'approve' | 'reject'>(null);

  if (!visible) return null;

  const done = () => {
    qc.invalidateQueries({ queryKey: ['revisions', page.id] });
    qc.invalidateQueries({ queryKey: ['revision-diff', page.id] });
    onChanged();
  };

  const run = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(okMsg);
      done();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'approval_required') {
        toast.error('В этом пространстве публикация требует согласования — отправьте страницу на согласование.');
      } else toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const ok = await confirm({
      title: page.status === 'published' ? 'Опубликовать изменения?' : 'Опубликовать страницу?',
      body:
        mode === 'publish'
          ? 'Текущее содержимое будет зафиксировано как опубликованная версия — читатели увидят именно её. Дальнейшие правки останутся черновиком до следующей публикации.'
          : 'Текущее содержимое будет зафиксировано как опубликованная версия.',
      confirmLabel: 'Опубликовать',
    });
    if (ok) run('publish', () => post(`/api/v1/pages/${page.id}/publish`, {}), 'Страница опубликована');
  };
  const unpublish = async () => {
    const ok = await confirm({
      title: 'Снять с публикации?',
      body: mode === 'publish' ? 'Читатели (просмотр и комментирование) перестанут видеть страницу, пока она не будет опубликована снова. Содержимое и история сохранятся.' : 'Страница вернётся в статус черновика. Содержимое и история сохранятся.',
      confirmLabel: 'Снять с публикации',
      danger: true,
    });
    if (ok) run('unpublish', () => post(`/api/v1/pages/${page.id}/unpublish`, {}), 'Страница снята с публикации');
  };
  const archive = async (archived: boolean) => {
    if (archived) {
      const ok = await confirm({ title: 'Перенести в архив?', body: 'Страница останется доступной по ссылке и в поиске с пометкой «Архив». Её можно вернуть в любой момент.', confirmLabel: 'В архив' });
      if (!ok) return;
    }
    run('archive', () => post(`/api/v1/pages/${page.id}/archive`, { archived }), archived ? 'Страница перенесена в архив' : 'Страница возвращена из архива');
  };

  const canDecide = canPublish && !!pending && (!pending.approvers.length || pending.approvers.some((x) => x.id === me.user.id));

  let text: ReactNode = null;
  if (page.status === 'review') {
    text = pending ? (
      <>
        Отправил(а) {pending.requestedBy.name} {relTime(pending.createdAt)}
        {pending.revisionNumber ? ` (версия ${pending.revisionNumber})` : ''}
        {pending.approvers.length ? ` · ${pending.approvers.length === 1 ? 'согласующий' : 'согласующие'}: ${pending.approvers.slice(0, 3).map((x) => x.name).join(', ')}${pending.approvers.length > 3 ? ` и ещё ${pending.approvers.length - 3}` : ''}` : ''}
        {pending.message ? ` · «${pending.message}»` : ''}
      </>
    ) : (
      'Ожидает согласования'
    );
  } else if (page.status === 'draft') {
    text =
      mode === 'publish' ? (
        canEdit ? 'Читатели не видят эту страницу, пока она не опубликована' : 'Страница ещё не опубликована'
      ) : requireApproval ? (
        'Изменения требуют согласования'
      ) : null;
  } else if (page.status === 'published') {
    const pubInfo = page.published ? `Опубликована версия ${page.published.number}, ${relTime(page.published.at)}` : null;
    text = canEdit && unpublished > 0 ? (
      <>
        {pubInfo ? pubInfo + '. ' : ''}
        Есть неопубликованные изменения ({unpublished} {unpublished === 1 ? 'блок' : 'блоков'}){' '}
        <button className="btn sm ghost" onClick={() => openHistory(publishedId)}>
          <History size={13} /> Сравнить
        </button>
      </>
    ) : mode === 'publish' && canEdit ? (
      `${pubInfo ? pubInfo + ' — ' : ''}читатели видят именно её`
    ) : (
      pubInfo
    );
  } else if (page.status === 'archived') {
    text = 'Страница в архиве — содержимое может быть неактуальным';
  }

  const B = ({ id, onClick, children, primary }: { id: string; onClick(): void; children: ReactNode; primary?: boolean }) => (
    <button className={'btn sm' + (primary ? ' primary' : '')} disabled={!!busy} aria-busy={busy === id} onClick={onClick}>
      {busy === id && <span className="spinner" />}
      {children}
    </button>
  );

  const showSubmit = canEdit && workflow && (page.status === 'draft' || (page.status === 'published' && unpublished > 0)) && (requireApproval || !canPublish);
  const showPublish = canPublish && !requireApproval && (page.status === 'draft' || (page.status === 'published' && (unpublished > 0 || !changes.data)));

  return (
    <div className={'publish-bar ' + page.status} role="region" aria-label="Публикация">
      <span className={'badge ' + (STATUS_BADGE[page.status] ?? '')}>{STATUS_TEXT[page.status] ?? page.status}</span>
      <span className="pb-text">{text}</span>
      <div className="pb-actions">
        {canDecide && (
          <>
            <B id="approve" primary onClick={() => setDecide('approve')}>
              <CheckCircle2 size={13} /> Согласовать
            </B>
            <B id="reject" onClick={() => setDecide('reject')}>
              <Undo2 size={13} /> Вернуть на доработку
            </B>
          </>
        )}
        {showSubmit && (
          <B id="submit" primary={!showPublish} onClick={() => setSubmitOpen(true)}>
            <Send size={13} /> Отправить на согласование
          </B>
        )}
        {showPublish && (
          <B id="publish" primary onClick={publish}>
            <Globe2 size={13} /> {page.status === 'published' ? 'Опубликовать изменения' : 'Опубликовать'}
          </B>
        )}
        {canPublish && page.status === 'published' && (
          <B id="unpublish" onClick={unpublish}>
            <EyeOff size={13} /> Снять с публикации
          </B>
        )}
        {canArchive && page.status !== 'archived' && page.status !== 'review' && (
          <B id="archive" onClick={() => archive(true)}>
            <Archive size={13} /> В архив
          </B>
        )}
        {canArchive && page.status === 'archived' && (
          <B id="archive" onClick={() => archive(false)}>
            <ArchiveRestore size={13} /> Вернуть из архива
          </B>
        )}
      </div>
      <SubmitReviewDialog open={submitOpen} page={page} onClose={() => setSubmitOpen(false)} onDone={done} />
      {decide && pending && <DecideDialog decision={decide} page={page} approval={pending} onClose={() => setDecide(null)} onDone={done} />}
    </div>
  );
}

function SubmitReviewDialog({ open, page, onClose, onDone }: { open: boolean; page: PageDto; onClose(): void; onDone(): void }) {
  const [reviewer, setReviewer] = useState<DirUser | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await post(`/api/v1/pages/${page.id}/submit-review`, { reviewerId: reviewer?.id, message: message.trim() || undefined });
      toast.success(reviewer ? `Отправлено на согласование: ${reviewer.name}` : 'Отправлено на согласование');
      setReviewer(null);
      setMessage('');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось отправить на согласование'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Отправить на согласование"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy} aria-busy={busy} onClick={send}>
            {busy && <span className="spinner" />} Отправить
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <p className="muted">Текущее содержимое будет сохранено как версия и отправлено на согласование. Вы сможете продолжать редактировать — согласуется именно отправленная версия.</p>
        <div className="field">
          <span className="field-label">Согласующий</span>
          {reviewer ? (
            <div className="share-chips">
              <span className="share-chip">
                {reviewer.name}
                <button aria-label="Убрать согласующего" onClick={() => setReviewer(null)}>
                  ×
                </button>
              </span>
            </div>
          ) : (
            <div className="share-add">
              <DirectoryPicker includeGroups={false} placeholder="Выберите сотрудника (необязательно)" onPick={(e) => e.type === 'user' && setReviewer(e.user)} />
            </div>
          )}
          <span className="field-hint">Если не выбрать, запрос получат все, у кого полный доступ к пространству «{page.space.name}».</span>
        </div>
        <div className="field">
          <label htmlFor="review-msg">Сообщение (необязательно)</label>
          <textarea id="review-msg" className="textarea" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Что изменилось и на что обратить внимание" />
        </div>
      </div>
    </Dialog>
  );
}

function DecideDialog({ decision, page, approval, onClose, onDone }: { decision: 'approve' | 'reject'; page: PageDto; approval: Approval; onClose(): void; onDone(): void }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const approve = decision === 'approve';
  const send = async () => {
    if (!approve && !comment.trim()) return;
    setBusy(true);
    try {
      await post(`/api/v1/pages/${page.id}/approvals/${approval.id}/decide`, { decision, comment: comment.trim() || undefined });
      toast.success(approve ? 'Согласовано и опубликовано' : 'Возвращено на доработку');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось сохранить решение'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={approve ? 'Согласовать и опубликовать' : 'Вернуть на доработку'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className={'btn ' + (approve ? 'primary' : 'danger')} disabled={busy || (!approve && !comment.trim())} aria-busy={busy} onClick={send}>
            {busy && <span className="spinner" />} {approve ? 'Согласовать' : 'Вернуть'}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 12 }}>
        <p className="muted">
          Запрос от {approval.requestedBy.name}, {fullTime(approval.createdAt)}
          {approval.revisionNumber ? ` — версия ${approval.revisionNumber}` : ''}.{' '}
          {approve ? 'Будет опубликована именно отправленная версия, даже если после отправки страницу правили.' : 'Страница вернётся в черновик, автор получит уведомление с вашим комментарием.'}
        </p>
        {approval.message && <div className="cm-quote">{approval.message}</div>}
        {approval.revisionNumber && (
          <div>
            <button className="btn sm ghost" onClick={() => openHistory()}>
              <History size={13} /> Открыть историю версий
            </button>
          </div>
        )}
        <div className="field">
          <label htmlFor="decide-comment">{approve ? 'Комментарий (необязательно)' : 'Что нужно исправить'}</label>
          <textarea id="decide-comment" className="textarea" rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
        </div>
      </div>
    </Dialog>
  );
}
