import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Star, Eye, FilePlus2, Plus, AlertTriangle, RefreshCw, Trash2, LayoutTemplate } from 'lucide-react';
import { get, post, put, del, ApiError } from '../api/client';
import type { Space } from '../api/types';
import { useSpaces, useChildren } from '../hooks/data';
import { useMe } from '../state/session';
import { createPage } from '../layout/treeActions';
import { Dialog } from '../components/ui/Dialog';
import { toast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { DocPreview, type DocNode } from '../components/DocPreview';

interface Template {
  id: string;
  key: string | null;
  name: string;
  description: string;
  category: string;
  icon: string | null;
  builtin: boolean;
  space_id: string | null;
  space_name: string | null;
  version: number;
  properties: Record<string, unknown>;
  required_properties: string[];
  updated_at: string;
  favorite: boolean;
  recommended: boolean;
  default_title?: string | null;
}

/** Minimal starting structure for a template created from scratch. */
function skeletonDoc(name: string, description: string): DocNode {
  const p = (text: string): DocNode => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined });
  const h = (level: number, text: string): DocNode => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
  return {
    type: 'doc',
    content: [
      { type: 'callout', attrs: { variant: 'info', icon: null }, content: [p(description || `Шаблон «${name}». Замените подсказки своим содержанием.`)] },
      h(2, 'Цель'),
      p('Кратко опишите назначение документа.'),
      h(2, 'Содержание'),
      p(''),
    ],
  };
}

const spaceLabel = (s: Space) => (s.isPersonal ? 'Личное пространство' : s.name);

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="alert error" role="alert">
      <AlertTriangle size={16} className="alert-icon" />
      <div className="grow">{error instanceof ApiError ? error.message : 'Не удалось загрузить данные'}</div>
      <button className="btn sm" onClick={onRetry}>
        <RefreshCw size={14} /> Повторить
      </button>
    </div>
  );
}

/** Space + parent page chooser (root level pages of the space). */
function LocationPicker({ spaceId, parentId, onChange, idPrefix }: { spaceId: string; parentId: string | null; onChange(spaceId: string, parentId: string | null): void; idPrefix: string }) {
  const spaces = useSpaces();
  const eligible = (spaces.data?.spaces ?? []).filter((s) => s.member && !s.archived && s.actions?.create !== false);
  const children = useChildren(spaceId, null, !!spaceId);
  return (
    <>
      <div className="field">
        <label htmlFor={idPrefix + '-space'}>Пространство</label>
        {spaces.isLoading ? (
          <div className="skeleton" style={{ height: 34 }} />
        ) : (
          <select id={idPrefix + '-space'} className="select" value={spaceId} onChange={(e) => onChange(e.target.value, null)}>
            {!spaceId && <option value="">Выберите пространство</option>}
            {eligible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon ? s.icon + ' ' : ''}
                {spaceLabel(s)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="field">
        <label htmlFor={idPrefix + '-parent'}>Расположение</label>
        <select id={idPrefix + '-parent'} className="select" value={parentId ?? ''} disabled={!spaceId || children.isLoading} onChange={(e) => onChange(spaceId, e.target.value || null)}>
          <option value="">В корне пространства</option>
          {(children.data?.nodes ?? [])
            .filter((n) => n.canCreate)
            .map((n) => (
              <option key={n.id} value={n.id}>
                Внутри «{n.title || 'Без названия'}»
              </option>
            ))}
        </select>
        {children.isError && <span className="field-error">Не удалось загрузить страницы пространства</span>}
      </div>
    </>
  );
}

function CreateFromTemplateDialog({ template, onClose, defaultSpace }: { template: Template; onClose(): void; defaultSpace: string }) {
  const navigate = useNavigate();
  const [spaceId, setSpaceId] = useState(defaultSpace);
  const [parentId, setParentId] = useState<string | null>(null);
  const [title, setTitle] = useState(template.default_title || template.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!spaceId) return;
    setBusy(true);
    setError(null);
    try {
      const p = await createPage(spaceId, parentId, { templateId: template.id, title: title.trim() || template.default_title || template.name });
      onClose();
      navigate(`/p/${p.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось создать страницу');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      title={`Создать страницу: ${template.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!spaceId || busy} aria-busy={busy} onClick={submit}>
            {busy && <span className="spinner" />} Создать
          </button>
        </>
      }
    >
      <form
        className="col"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label htmlFor="tpl-title">Название страницы</label>
          <input id="tpl-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
        </div>
        <LocationPicker
          idPrefix="tpl-create"
          spaceId={spaceId}
          parentId={parentId}
          onChange={(s, p) => {
            setSpaceId(s);
            setParentId(p);
          }}
        />
        {template.required_properties?.length > 0 && (
          <div className="alert">
            <span>Обязательные свойства: {template.required_properties.join(', ')} — заполните их после создания.</span>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function PreviewDialog({ template, onClose, onUse }: { template: Template; onClose(): void; onUse(): void }) {
  const q = useQuery({ queryKey: ['template', template.id], queryFn: ({ signal }) => get<{ template: { content: DocNode } }>(`/api/v1/templates/${template.id}`, signal) });
  const props = Object.entries(template.properties ?? {});
  return (
    <Dialog
      open
      size="wide"
      title={
        <span className="row">
          <span aria-hidden>{template.icon || '📄'}</span> {template.name}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
          <button className="btn primary" onClick={onUse}>
            <FilePlus2 size={16} /> Создать страницу из шаблона
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginBottom: 12 }}>
        {template.description}
      </p>
      {props.length > 0 && (
        <div className="tpl-props">
          {props.map(([k, v]) => (
            <div key={k} className="tpl-prop">
              <span className="muted small">
                {k}
                {template.required_properties?.includes(k) && <span aria-label="обязательно"> *</span>}
              </span>
              <span className="small">{String(v ?? '') || '—'}</span>
            </div>
          ))}
        </div>
      )}
      <div className="tpl-preview-doc">{q.isLoading ? <div className="col">{[60, 90, 80, 70].map((w, i) => <div key={i} className="skeleton" style={{ height: 16, width: w + '%' }} />)}</div> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <DocPreview doc={q.data?.template.content} />}</div>
    </Dialog>
  );
}

function NewTemplateDialog({ onClose, onCreated, categories }: { onClose(): void; onCreated(): void; categories: string[] }) {
  const me = useMe();
  const spaces = useSpaces();
  const isAdmin = me.user.orgRole === 'owner' || me.user.orgRole === 'admin';
  const manageable = (spaces.data?.spaces ?? []).filter((s) => s.member && s.actions?.manage_space && !s.isPersonal);
  const [mode, setMode] = useState<'blank' | 'page'>('blank');
  const [defaultTitle, setDefaultTitle] = useState('');
  const [icon, setIcon] = useState('');
  const [pageQuery, setPageQuery] = useState('');
  const [page, setPage] = useState<{ pageId: string; title: string; icon: string | null } | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Пространство');
  const [scope, setScope] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!scope) setScope(manageable[0]?.id ?? (isAdmin ? 'org' : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaces.data]);
  const sugg = useQuery({
    queryKey: ['search-suggest', pageQuery],
    enabled: mode === 'page' && pageQuery.trim().length > 0 && !page,
    queryFn: ({ signal }) => get<{ suggestions: Array<{ pageId: string; title: string; icon: string | null }> }>(`/api/v1/search/suggest?q=${encodeURIComponent(pageQuery.trim())}`, signal),
  });
  const canCreate = isAdmin || manageable.length > 0;
  const submit = async () => {
    if ((mode === 'page' && !page) || !name.trim() || !scope) return;
    setBusy(true);
    setError(null);
    try {
      const source = mode === 'page' && page ? { pageId: page.pageId } : { content: skeletonDoc(name.trim(), description.trim()) };
      await post('/api/v1/templates', {
        ...source,
        name: name.trim(),
        description,
        category: category.trim() || 'Пространство',
        icon: icon.trim() || undefined,
        title: defaultTitle.trim() || undefined,
        spaceId: scope === 'org' ? null : scope,
      });
      toast.success('Шаблон создан');
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось создать шаблон');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      title="Новый шаблон"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!canCreate || (mode === 'page' && !page) || !name.trim() || !scope || busy} aria-busy={busy} onClick={submit}>
            {busy && <span className="spinner" />} Создать шаблон
          </button>
        </>
      }
    >
      {!canCreate ? (
        <div className="alert warning">
          <span>Шаблоны создают руководители пространств и администраторы. Вы можете подготовить страницу и попросить руководителя сохранить её как шаблон.</span>
        </div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <fieldset className="space-fieldset">
            <legend className="field-label">Основа шаблона</legend>
            <div className="space-radio">
              <label className="checkbox">
                <input type="radio" name="nt-mode" checked={mode === 'blank'} onChange={() => setMode('blank')} />
                <span>
                  <b>С нуля</b> <span className="muted small">— базовая структура: пояснение, «Цель», «Содержание»</span>
                </span>
              </label>
              <label className="checkbox">
                <input type="radio" name="nt-mode" checked={mode === 'page'} onChange={() => setMode('page')} />
                <span>
                  <b>Из существующей страницы</b> <span className="muted small">— содержимое и свойства копируются, страница не меняется</span>
                </span>
              </label>
            </div>
          </fieldset>
          {mode === 'page' && (
          <div className="field">
            <label htmlFor="nt-page">Страница-образец</label>
            {page ? (
              <span className="search-chip">
                <span className="ellipsis">
                  {page.icon ? page.icon + ' ' : ''}
                  {page.title || 'Без названия'}
                </span>
                <button className="btn ghost sm" onClick={() => setPage(null)}>
                  Изменить
                </button>
              </span>
            ) : (
              <>
                <input id="nt-page" className="input" placeholder="Начните вводить название страницы" value={pageQuery} onChange={(e) => setPageQuery(e.target.value)} autoComplete="off" />
                {(sugg.data?.suggestions.length ?? 0) > 0 && (
                  <div className="pick-list" role="listbox" aria-label="Страницы">
                    {sugg.data!.suggestions.map((s) => (
                      <button
                        key={s.pageId}
                        role="option"
                        aria-selected={false}
                        className="pick-item"
                        onClick={() => {
                          setPage(s);
                          if (!name) setName(s.title);
                        }}
                      >
                        <span aria-hidden>{s.icon || '📄'}</span>
                        <span className="ellipsis">{s.title || 'Без названия'}</span>
                      </button>
                    ))}
                  </div>
                )}
                {pageQuery && sugg.data && !sugg.data.suggestions.length && <span className="field-hint">Страницы не найдены</span>}
              </>
            )}
          </div>
          )}
          <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ width: 72 }}>
              <label htmlFor="nt-icon">Иконка</label>
              <input id="nt-icon" className="input" value={icon} placeholder="📄" maxLength={8} onChange={(e) => setIcon(e.target.value)} />
            </div>
            <div className="field grow">
              <label htmlFor="nt-dtitle">Название новых страниц</label>
              <input id="nt-dtitle" className="input" value={defaultTitle} placeholder="По умолчанию — название шаблона" maxLength={300} onChange={(e) => setDefaultTitle(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="nt-name">Название шаблона</label>
            <input id="nt-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </div>
          <div className="field">
            <label htmlFor="nt-desc">Описание</label>
            <textarea id="nt-desc" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          </div>
          <div className="field">
            <label htmlFor="nt-cat">Категория</label>
            <input id="nt-cat" className="input" list="nt-cat-list" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={100} />
            <datalist id="nt-cat-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="nt-scope">Где доступен</label>
            <select id="nt-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
              {isAdmin && <option value="org">Вся организация</option>}
              {manageable.map((s) => (
                <option key={s.id} value={s.id}>
                  Пространство «{s.name}»
                </option>
              ))}
            </select>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function TemplatesPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const ctxSpace = params.get('spaceId') ?? '';
  const spaces = useSpaces();
  const list = useQuery({
    queryKey: ['templates', ctxSpace],
    queryFn: ({ signal }) => get<{ templates: Template[] }>(`/api/v1/templates${ctxSpace ? `?spaceId=${ctxSpace}` : ''}`, signal),
  });
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('__all');
  const [preview, setPreview] = useState<Template | null>(null);
  const [creating, setCreating] = useState<Template | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const templates = list.data?.templates ?? [];
  const categories = useMemo(() => [...new Set(templates.map((t) => t.category))].sort((a, b) => a.localeCompare(b, 'ru')), [templates]);
  const hasFav = templates.some((t) => t.favorite);
  const hasRec = templates.some((t) => t.recommended);
  const filtered = templates.filter((t) => {
    if (cat === '__fav' && !t.favorite) return false;
    if (cat === '__rec' && !t.recommended) return false;
    if (cat !== '__all' && cat !== '__fav' && cat !== '__rec' && t.category !== cat) return false;
    if (!query) return true;
    const s = query.toLowerCase();
    return t.name.toLowerCase().includes(s) || t.description?.toLowerCase().includes(s) || t.category.toLowerCase().includes(s);
  });
  const grouped = useMemo(() => {
    const m = new Map<string, Template[]>();
    for (const t of filtered) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m.entries()];
  }, [filtered]);

  const defaultSpace = ctxSpace || me.personalSpaceId || (spaces.data?.spaces.find((s) => s.member && s.actions?.create)?.id ?? '');

  const toggleFav = async (t: Template) => {
    qc.setQueryData<{ templates: Template[] }>(['templates', ctxSpace], (d) => d && { templates: d.templates.map((x) => (x.id === t.id ? { ...x, favorite: !t.favorite } : x)) });
    try {
      await put(`/api/v1/templates/${t.id}/favorite`, { favorite: !t.favorite });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось изменить избранное');
      qc.invalidateQueries({ queryKey: ['templates'] });
    }
  };

  const canManage = (t: Template) => {
    if (t.builtin) return false;
    if (!t.space_id) return me.user.orgRole === 'owner' || me.user.orgRole === 'admin';
    return !!spaces.data?.spaces.find((s) => s.id === t.space_id)?.actions?.manage_space;
  };
  const remove = async (t: Template) => {
    const ok = await confirm({ title: 'Удалить шаблон?', danger: true, confirmLabel: 'Удалить', body: <p>Шаблон «{t.name}» исчезнет из галереи. Созданные из него страницы не изменятся.</p> });
    if (!ok) return;
    try {
      await del(`/api/v1/templates/${t.id}`);
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Шаблон удалён');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось удалить шаблон');
    }
  };

  const tabs: Array<[string, string]> = [['__all', 'Все'], ...(hasRec ? ([['__rec', 'Для пространства']] as Array<[string, string]>) : []), ...(hasFav ? ([['__fav', 'Избранные']] as Array<[string, string]>) : []), ...categories.map((c) => [c, c] as [string, string])];

  return (
    <div className="page-container tpl-page">
      <div className="tpl-head">
        <div className="grow">
          <h1 className="page-heading">Шаблоны</h1>
          <p className="page-sub">Готовые структуры документов: регламенты, инструкции, FAQ, протоколы и другие.</p>
        </div>
        <button className="btn" onClick={() => setNewOpen(true)}>
          <Plus size={16} /> Новый шаблон
        </button>
      </div>

      <div className="tpl-toolbar">
        <div className="trash-search grow">
          <Search size={15} className="muted" aria-hidden />
          <input className="input" type="search" placeholder="Найти шаблон" aria-label="Найти шаблон" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="tabs tpl-tabs" role="tablist" aria-label="Категории">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" className="tab" aria-selected={cat === id} onClick={() => setCat(id)}>
            {label}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="tpl-grid" aria-busy="true" aria-label="Загрузка">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 150, borderRadius: 12 }} />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !filtered.length ? (
        <div className="empty-state">
          <div className="empty-icon">
            <LayoutTemplate size={32} />
          </div>
          <h3>{templates.length ? 'Ничего не найдено' : 'Шаблонов пока нет'}</h3>
          <p>{templates.length ? 'Попробуйте другой запрос или категорию.' : 'Создайте шаблон из готовой страницы.'}</p>
        </div>
      ) : (
        grouped.map(([category, items]) => (
          <section key={category} className="tpl-group" aria-label={category}>
            {(cat === '__all' || cat === '__fav' || cat === '__rec') && <h2 className="tpl-group-title">{category}</h2>}
            <ul className="tpl-grid">
              {items.map((t) => (
                <li key={t.id} className="tpl-card card">
                  <div className="row tpl-card-top">
                    <span className="tpl-icon" aria-hidden>
                      {t.icon || '📄'}
                    </span>
                    <button className="icon-btn sm" aria-pressed={t.favorite} aria-label={t.favorite ? 'Убрать из избранных' : 'В избранные'} title={t.favorite ? 'Убрать из избранных' : 'В избранные'} onClick={() => toggleFav(t)}>
                      <Star size={16} fill={t.favorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <button className="tpl-card-name" onClick={() => setPreview(t)}>
                    {t.name}
                  </button>
                  <p className="small muted tpl-desc">{t.description}</p>
                  <div className="row tpl-badges">
                    {t.recommended && <span className="badge blue">Рекомендован</span>}
                    {t.space_name ? <span className="badge">{t.space_name}</span> : !t.builtin && <span className="badge">Организация</span>}
                    {t.required_properties?.length > 0 && <span className="badge amber">Обязательные свойства</span>}
                  </div>
                  <div className="row tpl-card-actions">
                    <button className="btn sm ghost" onClick={() => setPreview(t)}>
                      <Eye size={14} /> Просмотр
                    </button>
                    <button className="btn sm primary" onClick={() => setCreating(t)}>
                      <FilePlus2 size={14} /> Использовать
                    </button>
                    {canManage(t) && (
                      <button className="icon-btn sm" aria-label={`Удалить шаблон «${t.name}»`} title="Удалить шаблон" onClick={() => remove(t)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {preview && (
        <PreviewDialog
          template={preview}
          onClose={() => setPreview(null)}
          onUse={() => {
            setCreating(preview);
            setPreview(null);
          }}
        />
      )}
      {creating && <CreateFromTemplateDialog template={creating} defaultSpace={defaultSpace} onClose={() => setCreating(null)} />}
      {newOpen && <NewTemplateDialog categories={categories} onClose={() => setNewOpen(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['templates'] })} />}
    </div>
  );
}
