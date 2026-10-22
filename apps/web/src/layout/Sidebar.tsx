import { useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Search, Home, Inbox, Star, Trash2, LayoutTemplate, Upload, Shield, Settings, LogOut, Moon, Sun, Monitor, HelpCircle, ChevronsLeft, Plus, ChevronRight, RotateCcw } from 'lucide-react';
import { useMe } from '../state/session';
import { useUi } from '../state/ui';
import { useSpaces, useFavorites, useNotifications } from '../hooks/data';
import { SidebarTree } from './SidebarTree';
import { Menu } from '../components/ui/Menu';
import { Tooltip } from '../components/ui/Tooltip';
import { post } from '../api/client';
import { createPage } from './treeActions';
import { toast } from '../components/ui/Toast';
import { Avatar } from '../components/Avatar';
import { useHelp } from '../help/HelpCenter';
import { useQuickSwitcher } from './QuickSwitcher';
import { NotificationsPopover } from '../components/Notifications';

export function Sidebar({ mobile, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const me = useMe();
  const navigate = useNavigate();
  const { sidebarWidth, setSidebarWidth, setSidebarOpen, theme, setTheme, collapsedSections, toggleSection, resetSidebar } = useUi();
  const spaces = useSpaces();
  const favorites = useFavorites();
  const notifications = useNotifications();
  const openHelp = useHelp((s) => s.open);
  const openSwitcher = useQuickSwitcher((s) => s.open);
  const resizing = useRef(false);
  const isAdmin = ['owner', 'admin', 'people_admin', 'auditor'].includes(me.user.orgRole);
  const all = spaces.data?.spaces ?? [];
  const personal = all.find((s) => s.isPersonal) ?? null;

  const newPage = async () => {
    const target = personal ?? all.find((s) => s.member && s.actions.create);
    if (!target) return toast.error('Нет пространства, где вы можете создавать страницы');
    const p = await createPage(target.id, null);
    navigate('/p/' + p.id, { state: { justCreated: true } });
    onNavigate?.();
  };

  const startResize = (e: React.PointerEvent) => {
    resizing.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    const move = (ev: PointerEvent) => resizing.current && setSidebarWidth(startW + ev.clientX - startX);
    const up = () => {
      resizing.current = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <nav className={'sidebar' + (mobile ? ' mobile' : '')} style={mobile ? undefined : { width: sidebarWidth }} aria-label="Навигация">
      <div className="sidebar-top">
        <Menu
          label="Профиль и настройки"
          items={[
            { label: me.user.email, header: true },
            { id: 'settings', label: 'Настройки профиля', icon: <Settings size={15} />, onSelect: () => navigate('/settings') },
            {
              id: 'theme',
              label: 'Тема',
              icon: theme === 'dark' ? <Moon size={15} /> : theme === 'light' ? <Sun size={15} /> : <Monitor size={15} />,
              children: [
                { id: 'system', label: 'Как в системе', checked: theme === 'system', onSelect: () => setTheme('system') },
                { id: 'light', label: 'Светлая', checked: theme === 'light', onSelect: () => setTheme('light') },
                { id: 'dark', label: 'Тёмная', checked: theme === 'dark', onSelect: () => setTheme('dark') },
              ],
            },
            { id: 'reset', label: 'Сбросить панель по умолчанию', icon: <RotateCcw size={15} />, onSelect: resetSidebar },
            { id: 'help', label: 'Справка и горячие клавиши', icon: <HelpCircle size={15} />, shortcut: '?', onSelect: openHelp },
            { separator: true },
            {
              id: 'logout',
              label: 'Выйти',
              icon: <LogOut size={15} />,
              onSelect: async () => {
                await post('/api/v1/auth/logout').catch(() => undefined);
                localStorage.removeItem('kb:me');
                window.location.href = '/';
              },
            },
          ]}
          trigger={({ ref, props }) => (
            <button ref={ref} className="workspace-btn" {...props}>
              <Avatar name={me.user.name} id={me.user.id} />
              <span className="col" style={{ gap: 0, minWidth: 0, alignItems: 'flex-start' }}>
                <span className="ellipsis workspace-name">{me.org.name}</span>
                <span className="ellipsis small muted">{me.user.name}</span>
              </span>
            </button>
          )}
        />
        {!mobile && (
          <Tooltip label="Скрыть боковую панель" shortcut="Mod+\">
            <button className="icon-btn" aria-label="Скрыть боковую панель" onClick={() => setSidebarOpen(false)}>
              <ChevronsLeft size={16} />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="sidebar-nav">
        <button className="nav-item" onClick={() => (openSwitcher(), onNavigate?.())}>
          <Search size={16} /> <span>Поиск</span> <kbd className="nav-kbd">{navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K'}</kbd>
        </button>
        <NavLink to="/" end className="nav-item" onClick={onNavigate}>
          <Home size={16} /> <span>Главная</span>
        </NavLink>
        <NotificationsPopover
          trigger={(ref, props) => (
            <button ref={ref} className="nav-item" {...props}>
              <Inbox size={16} /> <span>Входящие</span>
              {notifications.data?.unread ? <span className="badge blue nav-count">{notifications.data.unread}</span> : null}
            </button>
          )}
        />
        <button className="nav-item" onClick={newPage}>
          <Plus size={16} /> <span>Новая страница</span>
        </button>
      </div>
      <div className="sidebar-scroll">
        {!!favorites.data?.pages.length && (
          <div className="fav-section">
            <button className="tree-section-btn" onClick={() => toggleSection('favorites')} aria-expanded={!collapsedSections.favorites}>
              <ChevronRight size={12} className={'chev' + (collapsedSections.favorites ? '' : ' open')} /> Избранное
            </button>
            {!collapsedSections.favorites &&
              favorites.data.pages.map((p) => (
                <NavLink key={p.id} to={'/p/' + p.id} className="nav-item fav" onClick={onNavigate}>
                  <span className="tree-icon">{p.icon ?? <Star size={14} />}</span>
                  <span className="ellipsis">{p.title || 'Без названия'}</span>
                </NavLink>
              ))}
          </div>
        )}
        {spaces.isError ? (
          <div className="alert error" style={{ margin: 8 }}>
            Не удалось загрузить пространства. <button className="btn sm" onClick={() => spaces.refetch()}>Повторить</button>
          </div>
        ) : spaces.isLoading ? (
          <div className="col" style={{ padding: 12 }}>
            {[60, 80, 50, 70].map((w, i) => (
              <div key={i} className="skeleton" style={{ height: 12, width: w + '%' }} />
            ))}
          </div>
        ) : (
          <SidebarTree personal={personal} spaces={all} shared={spaces.data?.shared ?? []} onNavigate={onNavigate} />
        )}
      </div>
      <div className="sidebar-bottom">
        <NavLink to="/templates" className="nav-item" onClick={onNavigate}>
          <LayoutTemplate size={16} /> <span>Шаблоны</span>
        </NavLink>
        <NavLink to="/import" className="nav-item" onClick={onNavigate}>
          <Upload size={16} /> <span>Импорт</span>
        </NavLink>
        <NavLink to="/trash" className="nav-item" onClick={onNavigate}>
          <Trash2 size={16} /> <span>Корзина</span>
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className="nav-item" onClick={onNavigate}>
            <Shield size={16} /> <span>Администрирование</span>
          </NavLink>
        )}
      </div>
      {!mobile && <div className="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Изменить ширину панели" onPointerDown={startResize} onDoubleClick={() => setSidebarWidth(280)} />}
    </nav>
  );
}
