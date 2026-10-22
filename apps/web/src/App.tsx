import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { get, setUnauthorizedHandler, ApiError } from './api/client';
import type { Me } from './api/types';
import { useSession } from './state/session';
import { Toasts } from './components/ui/Toast';
import { ConfirmHost } from './components/ui/Confirm';
import { LoginPage, SetupPage, InvitePage } from './pages/Auth';
import { AppShell } from './layout/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';

const PageView = lazy(() => import('./pages/PageView'));
const Home = lazy(() => import('./pages/Home'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const TrashPage = lazy(() => import('./pages/TrashPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./admin/AdminPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const SpacePage = lazy(() => import('./pages/SpacePage'));

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (n, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && n < 2,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'always' },
  },
});

const BOOT_TIMEOUT_MS = 12_000;

function Authenticated() {
  const { me, setMe } = useSession();
  const [state, setState] = useState<'loading' | 'ready' | 'login' | 'setup' | 'offline' | 'timeout'>(me ? 'ready' : 'loading');
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      setState('login');
    });
    if (me) return;
    // R-UI-053: the start screen never spins forever — a server that does not answer gets an explanation and a retry.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), BOOT_TIMEOUT_MS);
    (async () => {
      try {
        const m = await get<Me>('/api/v1/auth/me', ctl.signal);
        setMe(m);
        setState('ready');
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          const cached = localStorage.getItem('kb:me');
          if (cached) {
            setMe(JSON.parse(cached));
            setState('ready');
            return;
          }
          setState('timeout');
          return;
        }
        if (e instanceof ApiError && e.isNetwork) {
          // Offline start: use the last known session to allow reading/editing cached documents.
          const cached = localStorage.getItem('kb:me');
          if (cached) {
            setMe(JSON.parse(cached));
            setState('ready');
            return;
          }
          setState('offline');
          return;
        }
        const st = await get<{ initialized: boolean }>('/api/v1/setup/status').catch(() => ({ initialized: true }));
        setState(st.initialized ? 'login' : 'setup');
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (me) localStorage.setItem('kb:me', JSON.stringify(me));
  }, [me]);
  if (state === 'loading') return <div className="center-screen"><span className="spinner" aria-label="Загрузка" /></div>;
  if (state === 'offline') return <div className="center-screen"><div className="empty-state"><div className="empty-icon">📡</div><h3>Нет связи с сервером</h3><p>Проверьте подключение к сети. Страница обновится автоматически.</p><button className="btn" onClick={() => location.pathname && window.location.reload()}>Повторить</button></div></div>;
  if (state === 'timeout')
    return (
      <div className="center-screen">
        <div className="empty-state" role="alert">
          <div className="empty-icon">⏳</div>
          <h3>Сервер не отвечает</h3>
          <p>Приложение не получило ответа за {BOOT_TIMEOUT_MS / 1000} с. Ваши данные не потеряны: несохранённые изменения хранятся на этом устройстве. Повторите попытку; если ошибка повторяется — сообщите администратору.</p>
          <button className="btn primary" onClick={() => window.location.reload()}>Повторить</button>
        </div>
      </div>
    );
  if (state === 'setup') return <SetupPage onDone={(m) => { setMe(m); setState('ready'); navigate('/'); }} />;
  if (state === 'login' || !me) return <LoginPage onDone={(m) => { setMe(m); setState('ready'); }} />;
  return (
    <AppShell>
      <ErrorBoundary>
        <Suspense fallback={<div className="page-loading"><div className="skeleton" style={{ height: 36, width: '40%' }} /><div className="skeleton" style={{ height: 16, width: '80%' }} /><div className="skeleton" style={{ height: 16, width: '70%' }} /></div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/p/:pageId" element={<PageView />} />
            <Route path="/s/:spaceId" element={<SpacePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/trash" element={<TrashPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings/*" element={<SettingsPage />} />
            <Route path="/admin/*" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppShell>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <a href="#main" className="skip-link">Перейти к содержимому</a>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/*" element={<Authenticated />} />
        </Routes>
        <Toasts />
        <ConfirmHost />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
