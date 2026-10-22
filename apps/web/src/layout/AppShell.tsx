import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu as MenuIcon, ChevronsRight, WifiOff } from 'lucide-react';
import { useUi } from '../state/ui';
import { Sidebar } from './Sidebar';
import { useServerEvents } from '../hooks/useEvents';
import { useNetwork } from '../hooks/useNetwork';
import { QuickSwitcher, useQuickSwitcher } from './QuickSwitcher';
import { HelpCenter, useHelp } from '../help/HelpCenter';
import { Tooltip } from '../components/ui/Tooltip';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { OnboardingHints } from '../help/Onboarding';

export function AppShell({ children }: { children: ReactNode }) {
  const { sidebarOpen, setSidebarOpen, mobileSidebar, setMobileSidebar } = useUi();
  const isMobile = useMediaQuery('(max-width: 860px)');
  const location = useLocation();
  const online = useNetwork((s) => s.online);
  useServerEvents(true);
  useEffect(() => setMobileSidebar(false), [location.pathname, setMobileSidebar]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (mod && (e.key === 'k' || e.key === 'л') && !e.shiftKey && !typing) {
        e.preventDefault();
        useQuickSwitcher.getState().open();
      } else if (mod && (e.key === 'p' || e.key === 'з') && e.shiftKey) {
        e.preventDefault();
        useQuickSwitcher.getState().open();
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        if (isMobile) setMobileSidebar(!useUi.getState().mobileSidebar);
        else setSidebarOpen(!useUi.getState().sidebarOpen);
      } else if (!mod && !typing && (e.key === '?' || e.key === 'F1')) {
        e.preventDefault();
        useHelp.getState().open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, setMobileSidebar, setSidebarOpen]);

  return (
    <div className={'app-shell' + (isMobile ? ' is-mobile' : '')}>
      {!isMobile && sidebarOpen && <Sidebar />}
      {isMobile && mobileSidebar && (
        <>
          <div className="drawer-backdrop" onClick={() => setMobileSidebar(false)} />
          <div className="drawer">
            <Sidebar mobile onNavigate={() => setMobileSidebar(false)} />
          </div>
        </>
      )}
      <div className="main-col">
        {(isMobile || !sidebarOpen) && (
          <div className="floating-sidebar-toggle">
            <Tooltip label="Показать боковую панель" shortcut="Mod+\">
              <button className="icon-btn" aria-label="Показать боковую панель" onClick={() => (isMobile ? setMobileSidebar(true) : setSidebarOpen(true))}>
                {isMobile ? <MenuIcon size={18} /> : <ChevronsRight size={18} />}
              </button>
            </Tooltip>
          </div>
        )}
        {!online && (
          <div className="offline-banner" role="status">
            <WifiOff size={14} /> Нет подключения к сети. Изменения сохраняются на этом устройстве и будут отправлены автоматически.
          </div>
        )}
        <main id="main" className="main-area" tabIndex={-1}>
          {children}
        </main>
      </div>
      <QuickSwitcher />
      <HelpCenter />
      <OnboardingHints />
    </div>
  );
}
