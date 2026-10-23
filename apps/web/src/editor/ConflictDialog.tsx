import { useEffect, useState } from 'react';
import type { Editor as TEditor } from '@tiptap/core';
import { create } from 'zustand';
import { AlertTriangle } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog';
import { DocPreview, type DocNode } from '../components/DocPreview';
import { toast } from '../components/ui/Toast';
import { get, post } from '../api/client';
import { errMsg } from '../components/page/directory';
import type { ConflictInfo } from './extensions/conflictGuard';

/**
 * Non-mergeable concurrent changes are never hidden (R-COLLAB-036). For a block the user was editing while someone
 * else deleted or moved it, a comparison dialog offers three outcomes:
 *  - «Сохранить обе» — the other person's result stays, the user's version is added next to it as a separate block;
 *  - «Принять версию сервера» — nothing is changed; the user's version stays in the page history (conflict copies);
 *  - «Оставить мою» — the user's version replaces / restores the block.
 * «Решить позже» closes the dialog but leaves a visible reminder until the conflict is resolved.
 */
export interface BlockConflict {
  key: string;
  pageId: string;
  info: ConflictInfo;
  savedId: string | null;
  at: number;
}

export const useConflicts = create<{
  items: BlockConflict[];
  open: string | null;
  push(c: BlockConflict): void;
  remove(key: string): void;
  setOpen(key: string | null): void;
}>((set) => ({
  items: [],
  open: null,
  push: (c) => set((s) => ({ items: [...s.items, c], open: s.open ?? c.key })),
  remove: (key) =>
    set((s) => {
      const items = s.items.filter((x) => x.key !== key);
      return { items, open: s.open === key ? (items[0]?.key ?? null) : s.open };
    }),
  setOpen: (open) => set({ open }),
}));

/** Gives every block id inside a copied node a new id, so "keep both" never duplicates block ids. */
export function withFreshIds(node: Record<string, any>): Record<string, any> {
  const copy = structuredClone(node);
  const visit = (n: Record<string, any>) => {
    if (n.attrs && 'id' in n.attrs && n.attrs.id) n.attrs = { ...n.attrs, id: crypto.randomUUID() };
    (n.content as Record<string, any>[] | undefined)?.forEach(visit);
  };
  visit(copy);
  return copy;
}

function findTop(ed: TEditor, id: string | null): { from: number; to: number; json: Record<string, any> } | null {
  if (!id) return null;
  let found: { from: number; to: number; json: Record<string, any> } | null = null;
  ed.state.doc.forEach((n, off) => {
    if (!found && n.attrs.id === id) found = { from: off, to: off + n.nodeSize, json: n.toJSON() };
  });
  return found;
}

function afterBlock(ed: TEditor, id: string | null): number {
  let at = 0;
  if (id) ed.state.doc.forEach((n, off) => n.attrs.id === id && (at = off + n.nodeSize));
  return at;
}

export function BlockConflictHost({ pageId, editor }: { pageId: string; editor: TEditor | null }) {
  const { items, open, remove, setOpen } = useConflicts();
  const mine = items.filter((c) => c.pageId === pageId);
  const cur = mine.find((c) => c.key === open) ?? null;
  const [, tick] = useState(0);
  // the "server side" of the comparison follows the live document while the dialog is open
  useEffect(() => {
    if (!cur || !editor) return;
    const on = () => tick((x) => x + 1);
    editor.on('update', on);
    return () => void editor.off('update', on);
  }, [cur, editor]);

  const resolve = (c: BlockConflict, choice: 'mine' | 'both' | 'server') => {
    const ed = editor;
    if (choice !== 'server') {
      if (!ed || ed.isDestroyed) {
        toast.error('Редактор недоступен — ваша версия сохранена в истории страницы');
        return;
      }
      const there = findTop(ed, c.info.blockId);
      if (choice === 'mine') {
        if (there) ed.chain().insertContentAt({ from: there.from, to: there.to }, c.info.block).run();
        else ed.chain().insertContentAt(afterBlock(ed, c.info.afterBlockId), c.info.block).run();
      } else {
        const copy = withFreshIds(c.info.block);
        ed.chain().insertContentAt(there ? there.to : afterBlock(ed, c.info.afterBlockId), copy).run();
      }
    }
    const resolution = choice === 'mine' ? 'restored' : choice === 'both' ? 'both' : 'dismissed';
    if (c.savedId) void post(`/api/v1/pages/${c.pageId}/conflicts/${c.savedId}/resolve`, { resolution }).catch(() => undefined);
    remove(c.key);
    toast.success(choice === 'mine' ? 'Ваша версия блока восстановлена' : choice === 'both' ? 'Сохранены обе версии блока' : c.savedId ? 'Оставлена версия сервера. Ваша версия сохранена в истории страницы.' : 'Оставлена версия сервера.');
  };

  if (!mine.length) return null;
  if (!cur)
    return (
      <div className="alert warning editor-conflicts" role="status" data-testid="conflict-reminder">
        <AlertTriangle size={16} /> Неразрешённых конфликтов правок: {mine.length}.{' '}
        <button className="btn sm" onClick={() => setOpen(mine[0].key)}>
          Разрешить
        </button>
      </div>
    );
  const there = editor && !editor.isDestroyed ? findTop(editor, cur.info.blockId) : null;
  const what = cur.info.reason === 'moved' ? 'переместил блок, который вы в это время редактировали: в перемещённую копию ваши последние правки не попали' : 'удалил блок, который вы в это время редактировали';
  return (
    <Dialog
      open
      size="wide"
      persistent
      title="Конфликт правок"
      onClose={() => setOpen(null)}
      footer={
        <>
          <button className="btn" onClick={() => setOpen(null)}>
            Решить позже
          </button>
          <span className="spacer grow" />
          <button className="btn" onClick={() => resolve(cur, 'server')}>
            Принять версию сервера
          </button>
          <button className="btn" onClick={() => resolve(cur, 'both')}>
            Сохранить обе
          </button>
          <button className="btn primary" onClick={() => resolve(cur, 'mine')}>
            Оставить мою
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 10 }} data-testid="conflict-dialog">
        <p>
          Другой участник {what}. Изменения нельзя объединить автоматически — выберите, что оставить.
          {cur.savedId ? ' Ваша версия уже сохранена в истории страницы, поэтому ничего не потеряется.' : ' Ваша версия пока хранится только на этом устройстве.'}
        </p>
        <div className="conflict-compare">
          <section aria-label="Ваша версия">
            <div className="kb-section-title">Ваша версия</div>
            <DocPreview doc={{ type: 'doc', content: [cur.info.block as unknown as DocNode] }} className="conflict-side mine" />
          </section>
          <section aria-label="Версия сервера">
            <div className="kb-section-title">Сейчас в документе (версия сервера)</div>
            {there ? <DocPreview doc={{ type: 'doc', content: [there.json as unknown as DocNode] }} className="conflict-side server" /> : <div className="conflict-side server muted">Блок удалён</div>}
          </section>
        </div>
        {mine.length > 1 && <p className="kb-meta">Ещё конфликтов: {mine.length - 1} — они откроются следующими.</p>}
      </div>
    </Dialog>
  );
}

/**
 * Whole-document non-mergeable conflict: the server refused this device's changes (they break the document schema,
 * are too large, or the page was moved to the trash). Same three choices: keep both (the local version becomes a new
 * page next to the original), accept the server version (local unsent changes are dropped, after an explicit
 * confirmation), or save the local copy as a file.
 */
export function DocConflictDialog(p: {
  pageId: string;
  code: string;
  message: string;
  localDoc(): Record<string, any>;
  localTitle(): string;
  localMarkdown(): Promise<string>;
  download(): Promise<void>;
  acceptServer(): Promise<void>;
  onClose(): void;
}) {
  const deleted = p.code === 'deleted';
  const server = useServerContent(p.pageId, !deleted);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const keepBoth = async () => {
    setBusy('both');
    try {
      const r = await post<{ page: { id: string; title: string }; source: 'json' | 'markdown' }>(`/api/v1/pages/${p.pageId}/conflict-copy`, { content: p.localDoc(), markdown: await p.localMarkdown(), title: `${p.localTitle() || 'Без названия'} — моя версия (конфликт)` });
      toast.success(`Ваша версия сохранена как страница «${r.page.title}»` + (r.source === 'markdown' ? ' (через Markdown: часть оформления, недопустимого на сервере, упрощена)' : ''), {
        label: 'Открыть',
        run: () => window.open(`/p/${r.page.id}`, '_self'),
      });
      if (!deleted) await p.acceptServer();
      else p.onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось сохранить копию — скачайте локальную копию файлом'));
    } finally {
      setBusy(null);
    }
  };
  const accept = async () => {
    if (!confirmDrop) return setConfirmDrop(true);
    setBusy('server');
    try {
      await p.acceptServer();
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog
      open
      size="wide"
      persistent
      title={deleted ? 'Страница удалена, пока вы её редактировали' : 'Сервер не принял ваши изменения'}
      onClose={p.onClose}
      footer={
        <>
          <button className="btn" onClick={() => void p.download()} disabled={!!busy}>
            Сохранить локальную копию
          </button>
          <span className="spacer grow" />
          {!deleted && (
            <button className={'btn' + (confirmDrop ? ' danger solid' : '')} onClick={() => void accept()} disabled={!!busy} aria-busy={busy === 'server'}>
              {busy === 'server' && <span className="spinner" />} {confirmDrop ? 'Да, отбросить мои изменения' : 'Принять версию сервера'}
            </button>
          )}
          <button className="btn primary" onClick={() => void keepBoth()} disabled={!!busy} aria-busy={busy === 'both'}>
            {busy === 'both' && <span className="spinner" />} {deleted ? 'Сохранить мою версию как новую страницу' : 'Сохранить обе'}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 10 }} data-testid="doc-conflict-dialog">
        <p>{p.message}</p>
        <p className="muted">
          {deleted
            ? 'Ваши правки остаются на этом устройстве. Сохраните их новой страницей или файлом.'
            : '«Сохранить обе» — ваша версия станет новой страницей рядом с этой, а здесь останется версия сервера. «Принять версию сервера» — неотправленные изменения с этого устройства будут отброшены. Окно можно закрыть — несохранённые изменения останутся на устройстве.'}
        </p>
        {confirmDrop && <div className="alert warning">Неотправленные изменения с этого устройства будут удалены без возможности восстановления. Сначала можно сохранить локальную копию.</div>}
        <div className="conflict-compare">
          <section aria-label="Ваша версия">
            <div className="kb-section-title">Ваша версия (на этом устройстве)</div>
            <DocPreview doc={p.localDoc() as DocNode} className="conflict-side mine" />
          </section>
          {!deleted && (
            <section aria-label="Версия сервера">
              <div className="kb-section-title">Версия сервера</div>
              {server.loading ? <span className="spinner" /> : server.error ? <div className="kb-error">{server.error}</div> : <DocPreview doc={server.doc as DocNode} className="conflict-side server" />}
            </section>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function useServerContent(pageId: string, enabled: boolean) {
  const [st, setSt] = useState<{ loading: boolean; doc?: Record<string, any>; error?: string }>({ loading: enabled });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    get<{ content: Record<string, any> | null }>(`/api/v1/pages/${pageId}/content`)
      .then((r) => alive && setSt({ loading: false, doc: r.content ?? { type: 'doc', content: [] } }))
      .catch((e) => alive && setSt({ loading: false, error: errMsg(e, 'Версию сервера сейчас не загрузить') }));
    return () => {
      alive = false;
    };
  }, [pageId, enabled]);
  return st;
}
