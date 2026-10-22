import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FilePlus2, LayoutTemplate, Upload, Search, Clock, Star, AlertTriangle, FileText, Lock, RefreshCw, History } from 'lucide-react';
import { get, ApiError } from '../api/client';
import type { Space } from '../api/types';
import { useSpaces, useRecent, useFavorites } from '../hooks/data';
import { useMe } from '../state/session';
import { createPage } from '../layout/treeActions';
import { toast } from '../components/ui/Toast';
import { relTime, fullTime } from '../lib/format';

interface HomeData {
  recentlyUpdated: Array<{ id: string; title: string; icon: string | null; space_id: string; content_updated_at: string | null; updated_by_name: string | null }>;
  needsReview: Array<{ id: string; title: string; icon: string | null; review_due_at: string }>;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

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

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="col" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 32 }} />
      ))}
    </div>
  );
}

function Section({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="home-section" aria-label={title}>
      <div className="home-section-head">
        <h2 className="home-section-title">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PageRow({ to, icon, title, meta }: { to: string; icon: string | null; title: string; meta?: ReactNode }) {
  return (
    <li>
      <Link to={to} className="home-row">
        <span className="home-row-icon" aria-hidden>
          {icon || <FileText size={16} />}
        </span>
        <span className="ellipsis grow">{title || 'Без названия'}</span>
        {meta && <span className="home-row-meta small muted">{meta}</span>}
      </Link>
    </li>
  );
}

export default function Home() {
  const me = useMe();
  const navigate = useNavigate();
  const spaces = useSpaces();
  const recent = useRecent();
  const favorites = useFavorites();
  const home = useQuery({ queryKey: ['me-home'], queryFn: ({ signal }) => get<HomeData>('/api/v1/me/home', signal) });
  const [creating, setCreating] = useState(false);
  const [updatedTab, setUpdatedTab] = useState<'recent' | 'updated'>('recent');

  const spaceById = useMemo(() => new Map((spaces.data?.spaces ?? []).map((s) => [s.id, s])), [spaces.data]);
  const spaceName = (id: string) => spaceById.get(id)?.name ?? '';
  const firstName = me.user.name.split(/\s+/)[0] || me.user.name;

  const newPage = async () => {
    const target = me.personalSpaceId ?? spaces.data?.spaces.find((s) => s.member && s.actions?.create)?.id;
    if (!target) {
      toast.error('Нет пространства, в котором можно создать страницу');
      return;
    }
    setCreating(true);
    try {
      const p = await createPage(target, null);
      navigate(`/p/${p.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось создать страницу');
    } finally {
      setCreating(false);
    }
  };

  const allSpaces: Space[] = spaces.data?.spaces ?? [];
  const visibleSpaces = allSpaces.filter((s) => !s.archived);
  const fresh = !recent.isLoading && !spaces.isLoading && (recent.data?.pages.length ?? 0) === 0 && (favorites.data?.pages.length ?? 0) === 0 && visibleSpaces.filter((s) => !s.isPersonal).length === 0;

  return (
    <div className="page-container home">
      <h1 className="page-heading">
        {greeting()}, {firstName}
      </h1>
      <p className="page-sub">{me.org.name}</p>

      <div className="home-actions" role="group" aria-label="Быстрые действия">
        <button className="home-action" onClick={newPage} disabled={creating} aria-busy={creating}>
          <span className="home-action-icon">{creating ? <span className="spinner" /> : <FilePlus2 size={18} />}</span>
          <span>
            <b>Новая страница</b>
            <span className="small muted">В личном пространстве</span>
          </span>
        </button>
        <Link className="home-action" to="/templates">
          <span className="home-action-icon">
            <LayoutTemplate size={18} />
          </span>
          <span>
            <b>Из шаблона</b>
            <span className="small muted">Регламент, инструкция, FAQ…</span>
          </span>
        </Link>
        <Link className="home-action" to="/import">
          <span className="home-action-icon">
            <Upload size={18} />
          </span>
          <span>
            <b>Импорт</b>
            <span className="small muted">DOCX, Markdown, CSV, XLSX</span>
          </span>
        </Link>
        <Link className="home-action" to="/search">
          <span className="home-action-icon">
            <Search size={18} />
          </span>
          <span>
            <b>Поиск</b>
            <span className="small muted">По тексту и изображениям</span>
          </span>
        </Link>
      </div>

      {fresh && (
        <div className="card home-welcome">
          <h2 className="home-section-title">Добро пожаловать в базу знаний</h2>
          <p className="muted">Начните с пустой страницы, выберите шаблон или импортируйте существующие документы — структура и форматирование сохранятся.</p>
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn primary" onClick={newPage} disabled={creating}>
              <FilePlus2 size={16} /> Создать первую страницу
            </button>
            <Link className="btn" to="/import">
              <Upload size={16} /> Импортировать документы
            </Link>
          </div>
        </div>
      )}

      {(home.data?.needsReview.length ?? 0) > 0 && (
        <Section title="Требуют пересмотра" icon={<AlertTriangle size={16} />}>
          <ul className="home-list">
            {home.data!.needsReview.map((p) => {
              const overdue = new Date(p.review_due_at) < new Date();
              return (
                <PageRow
                  key={p.id}
                  to={`/p/${p.id}`}
                  icon={p.icon}
                  title={p.title}
                  meta={<span className={'badge ' + (overdue ? 'red' : 'amber')}>{overdue ? 'Просрочено' : 'до ' + new Date(p.review_due_at).toLocaleDateString('ru-RU')}</span>}
                />
              );
            })}
          </ul>
        </Section>
      )}

      <div className="home-grid">
        <Section
          title={updatedTab === 'recent' ? 'Недавние' : 'Обновлённые'}
          icon={updatedTab === 'recent' ? <Clock size={16} /> : <History size={16} />}
          action={
            <div className="tabs home-mini-tabs" role="tablist" aria-label="Список страниц">
              <button className="tab" role="tab" aria-selected={updatedTab === 'recent'} onClick={() => setUpdatedTab('recent')}>
                Открытые мной
              </button>
              <button className="tab" role="tab" aria-selected={updatedTab === 'updated'} onClick={() => setUpdatedTab('updated')}>
                Изменённые
              </button>
            </div>
          }
        >
          {updatedTab === 'recent' ? (
            recent.isLoading ? (
              <ListSkeleton />
            ) : recent.isError ? (
              <ErrorState error={recent.error} onRetry={() => recent.refetch()} />
            ) : !recent.data?.pages.length ? (
              <div className="empty-state compact">
                <Clock size={22} />
                <p>Здесь появятся страницы, которые вы открывали.</p>
              </div>
            ) : (
              <ul className="home-list">
                {recent.data.pages.slice(0, 10).map((p) => (
                  <PageRow key={p.id} to={`/p/${p.id}`} icon={p.icon} title={p.title} meta={<span title={fullTime(p.viewed_at)}>{[spaceName(p.space_id), relTime(p.viewed_at)].filter(Boolean).join(' · ')}</span>} />
                ))}
              </ul>
            )
          ) : home.isLoading ? (
            <ListSkeleton />
          ) : home.isError ? (
            <ErrorState error={home.error} onRetry={() => home.refetch()} />
          ) : !home.data?.recentlyUpdated.length ? (
            <div className="empty-state compact">
              <History size={22} />
              <p>Пока никто не редактировал страницы.</p>
            </div>
          ) : (
            <ul className="home-list">
              {home.data.recentlyUpdated.slice(0, 10).map((p) => (
                <PageRow
                  key={p.id}
                  to={`/p/${p.id}`}
                  icon={p.icon}
                  title={p.title}
                  meta={<span title={fullTime(p.content_updated_at)}>{[p.updated_by_name, relTime(p.content_updated_at)].filter(Boolean).join(' · ')}</span>}
                />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Избранное" icon={<Star size={16} />}>
          {favorites.isLoading ? (
            <ListSkeleton rows={3} />
          ) : favorites.isError ? (
            <ErrorState error={favorites.error} onRetry={() => favorites.refetch()} />
          ) : !favorites.data?.pages.length ? (
            <div className="empty-state compact">
              <Star size={22} />
              <p>Отмечайте важные страницы звёздочкой — они появятся здесь и в боковой панели.</p>
            </div>
          ) : (
            <ul className="home-list">
              {favorites.data.pages.map((p) => (
                <PageRow key={p.id} to={`/p/${p.id}`} icon={p.icon} title={p.title} meta={spaceName(p.space_id)} />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Пространства" icon={<LayoutTemplate size={16} />}>
        {spaces.isLoading ? (
          <div className="home-spaces">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 88, borderRadius: 12 }} />
            ))}
          </div>
        ) : spaces.isError ? (
          <ErrorState error={spaces.error} onRetry={() => spaces.refetch()} />
        ) : !visibleSpaces.length ? (
          <div className="empty-state compact">
            <p>Пространств пока нет. Администратор может создать пространства для отделов и проектов.</p>
          </div>
        ) : (
          <ul className="home-spaces">
            {visibleSpaces.map((s) => (
              <li key={s.id}>
                <Link to={`/s/${s.id}`} className="home-space card">
                  <span className="home-space-icon" aria-hidden>
                    {s.icon || (s.isPersonal ? '🏠' : '📁')}
                  </span>
                  <span className="col grow" style={{ gap: 2 }}>
                    <span className="row" style={{ gap: 6 }}>
                      <b className="ellipsis">{s.isPersonal ? 'Личное пространство' : s.name}</b>
                      {!s.member && (
                        <span className="badge" title="Содержимое доступно по приглашению">
                          <Lock size={11} /> Закрытое
                        </span>
                      )}
                    </span>
                    <span className="small muted home-space-desc">{s.description || (s.isPersonal ? 'Черновики и личные заметки' : '')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
