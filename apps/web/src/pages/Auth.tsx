import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { ApiError, get, post } from '../api/client';
import type { Me } from '../api/types';
import { useSession } from '../state/session';

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="auth-screen">
      <main className="auth-card" id="main">
        <div className="auth-logo" aria-hidden>
          <BookOpen size={22} />
        </div>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="muted auth-subtitle">{subtitle}</p>}
        {children}
      </main>
    </div>
  );
}

export function LoginPage({ onDone }: { onDone: (m: Me) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [mfa, setMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sso, setSso] = useState(false);
  useEffect(() => {
    get<{ sso?: boolean }>('/api/v1/setup/status')
      .then((r) => setSso(!!r.sso))
      .catch(() => undefined);
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post('/api/v1/auth/login', { email, password, totp: mfa ? totp : undefined });
      if (r.mfaRequired) {
        setMfa(true);
        return;
      }
      onDone(await get<Me>('/api/v1/auth/me'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Вход в базу знаний" subtitle="Используйте корпоративную учётную запись">
      <form onSubmit={submit} className="col" style={{ gap: 14 }} noValidate>
        {!mfa ? (
          <>
            <div className="field">
              <label htmlFor="login-email">Электронная почта</label>
              <input id="login-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="login-password">Пароль</label>
              <input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </>
        ) : (
          <div className="field">
            <label htmlFor="login-totp">Код из приложения-аутентификатора</label>
            <input id="login-totp" className="input" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} autoFocus />
            <span className="field-hint">Шесть цифр, обновляются каждые 30 секунд</span>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary lg" type="submit" disabled={busy || !email || !password} aria-busy={busy}>
          {busy ? <span className="spinner" /> : null}
          {mfa ? 'Подтвердить' : 'Войти'}
        </button>
        {sso && (
          <a className="btn lg" href="/api/v1/auth/oidc/start">
            Войти через корпоративный SSO
          </a>
        )}
      </form>
    </AuthCard>
  );
}

export function SetupPage({ onDone }: { onDone: (m: Me) => void }) {
  const [form, setForm] = useState({ orgName: '', ownerName: '', ownerEmail: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/api/v1/setup', form);
      onDone(await get<Me>('/api/v1/auth/me'));
    } catch (err) {
      setError(err instanceof ApiError ? (err.details?.[0]?.message ? `${err.message}: ${err.details[0].path} — ${err.details[0].message}` : err.message) : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Первичная настройка" subtitle="Создайте организацию и учётную запись владельца">
      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="s-org">Название организации</label>
          <input id="s-org" className="input" value={form.orgName} onChange={set('orgName')} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="s-name">Ваше имя</label>
          <input id="s-name" className="input" value={form.ownerName} onChange={set('ownerName')} required />
        </div>
        <div className="field">
          <label htmlFor="s-email">Электронная почта</label>
          <input id="s-email" className="input" type="email" value={form.ownerEmail} onChange={set('ownerEmail')} required />
        </div>
        <div className="field">
          <label htmlFor="s-pass">Пароль</label>
          <input id="s-pass" className="input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />
          <span className="field-hint">Не менее 10 символов, буквы и цифры</span>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="btn primary lg" type="submit" disabled={busy}>
          {busy && <span className="spinner" />}Создать организацию
        </button>
      </form>
    </AuthCard>
  );
}

export function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const setMe = useSession((s) => s.setMe);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/api/v1/auth/invite/accept', { token, password, name: name || undefined });
      setMe(await get<Me>('/api/v1/auth/me'));
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthCard title="Добро пожаловать" subtitle="Задайте пароль, чтобы начать работу">
      <form onSubmit={submit} className="col" style={{ gap: 14 }}>
        <div className="field">
          <label htmlFor="i-name">Как к вам обращаться (необязательно)</label>
          <input id="i-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="i-pass">Новый пароль</label>
          <input id="i-pass" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          <span className="field-hint">Не менее 10 символов, буквы и цифры</span>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="btn primary lg" type="submit" disabled={busy || password.length < 10}>
          {busy && <span className="spinner" />}Продолжить
        </button>
      </form>
    </AuthCard>
  );
}
