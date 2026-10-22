import '../styles/admin.css';
import { useState, type FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Monitor, Palette, ShieldCheck, Smartphone, User } from 'lucide-react';
import { del, get, patch, post } from '../api/client';
import type { Me } from '../api/types';
import { useMe, useSession } from '../state/session';
import { useUi } from '../state/ui';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { Avatar } from '../components/Avatar';
import { fullTime, relTime } from '../lib/format';
import { Badge, CopyField, Empty, ErrorState, LoadingRows, ROLE_LABEL, errMsg } from '../admin/common';

/** Profile settings (/settings/*). */
export default function SettingsPage() {
  const me = useMe();
  const tabs = [
    { path: 'profile', label: 'Профиль', icon: <User size={15} /> },
    { path: 'appearance', label: 'Оформление и редактор', icon: <Palette size={15} /> },
    { path: 'security', label: 'Пароль и вход', icon: <ShieldCheck size={15} /> },
    { path: 'sessions', label: 'Активные сеансы', icon: <Monitor size={15} /> },
    ...(me.user.kind === 'employee' ? [{ path: 'tokens', label: 'API-токены', icon: <KeyRound size={15} /> }] : []),
  ];
  return (
    <div className="page-container narrow admin-page">
      <h1 className="page-heading">Настройки профиля</h1>
      <p className="page-sub">Личные настройки, безопасность учётной записи и доступ для интеграций.</p>
      <nav className="tabs admin-tabs" aria-label="Разделы настроек">
        {tabs.map((t) => (
          <NavLink key={t.path} to={t.path} className="tab admin-tab">
            {t.icon}
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="admin-body">
        <Routes>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<ProfileTab />} />
          <Route path="appearance" element={<AppearanceTab />} />
          <Route path="security" element={<SecurityTab />} />
          <Route path="sessions" element={<SessionsTab />} />
          {me.user.kind === 'employee' && <Route path="tokens" element={<TokensTab />} />}
          <Route path="*" element={<Navigate to="profile" replace />} />
        </Routes>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- profile

function ProfileTab() {
  const me = useMe();
  const u = me.user as typeof me.user & { accessExpiresAt?: string | null };
  return (
    <section className="col" style={{ gap: 16 }}>
      <div className="card">
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <span className="settings-avatar">
            <Avatar name={u.name} id={u.id} size="lg" />
          </span>
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 className="admin-detail-title">{u.name}</h2>
            <div className="muted ellipsis">{u.email}</div>
            {u.title && <div className="small">{u.title}</div>}
          </div>
        </div>
        <dl className="admin-kv" style={{ marginTop: 16 }}>
          <div>
            <dt>Организация</dt>
            <dd>{me.org.name}</dd>
          </div>
          <div>
            <dt>Тип учётной записи</dt>
            <dd>{u.kind === 'guest' ? 'Гость' : 'Сотрудник'}</dd>
          </div>
          <div>
            <dt>Роль</dt>
            <dd>{u.kind === 'guest' ? 'Гость' : ROLE_LABEL[u.orgRole] ?? u.orgRole}</dd>
          </div>
          <div>
            <dt>Двухфакторная аутентификация</dt>
            <dd>{u.mfaEnabled ? <Badge color="green">включена</Badge> : <Badge color={me.org.settings.requireMfa ? 'red' : undefined}>выключена</Badge>}</dd>
          </div>
          {u.accessExpiresAt && (
            <div>
              <dt>Доступ действует до</dt>
              <dd>{fullTime(u.accessExpiresAt)}</dd>
            </div>
          )}
        </dl>
      </div>
      <ProfileForm />
      <p className="muted small">Email и роль меняет администратор организации.</p>
    </section>
  );
}

function ProfileForm() {
  const me = useMe();
  const setMe = useSession((s) => s.setMe);
  const [name, setName] = useState(me.user.name);
  const [title, setTitle] = useState(me.user.title ?? '');
  const [error, setError] = useState<string | null>(null);
  const dirty = name.trim() !== me.user.name || (title.trim() || null) !== (me.user.title ?? null);
  const m = useMutation({
    mutationFn: async () => {
      const body: { name?: string; title?: string | null } = {};
      if (name.trim() !== me.user.name) body.name = name.trim();
      if ((title.trim() || null) !== (me.user.title ?? null)) body.title = title.trim() || null;
      await patch<{ user: { name: string; title: string | null } }>('/api/v1/auth/me', body);
      try {
        setMe(await get<Me>('/api/v1/auth/me'));
      } catch {
        const cur = useSession.getState().me;
        if (cur) setMe({ ...cur, user: { ...cur.user, name: body.name ?? cur.user.name, title: body.title !== undefined ? body.title : cur.user.title } });
      }
    },
    onSuccess: () => {
      setError(null);
      toast.success('Профиль сохранён');
    },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <form
      className="card col"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && name.trim()) m.mutate();
      }}
    >
      <h3 className="admin-card-title">Личные данные</h3>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="admin-form-grid">
        <div className="field">
          <label htmlFor="pf-name">Имя и фамилия</label>
          <input id="pf-name" className="input" maxLength={200} value={name} aria-invalid={!name.trim()} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          {!name.trim() && <div className="field-error">Имя не может быть пустым</div>}
        </div>
        <div className="field">
          <label htmlFor="pf-title">Должность</label>
          <input id="pf-title" className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="organization-title" />
        </div>
      </div>
      <div className="row admin-wrap">
        <span className="grow" />
        <button
          type="button"
          className="btn"
          disabled={!dirty || m.isPending}
          onClick={() => {
            setName(me.user.name);
            setTitle(me.user.title ?? '');
            setError(null);
          }}
        >
          Отменить
        </button>
        <button type="submit" className="btn primary" disabled={!dirty || !name.trim() || m.isPending} aria-busy={m.isPending}>
          {m.isPending && <span className="spinner" />} Сохранить
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- appearance & editor

interface EditorPrefs {
  spellcheck: boolean;
  wideByDefault: boolean;
  smartTypography: boolean;
}
const EDITOR_DEFAULTS: EditorPrefs = { spellcheck: true, wideByDefault: false, smartTypography: true };

function AppearanceTab() {
  const { me, setMe } = useSession();
  const { theme, setTheme, hintsDisabled, setHintsDisabled } = useUi();
  const prefs = (me?.user.preferences ?? {}) as Record<string, unknown>;
  const editor: EditorPrefs = { ...EDITOR_DEFAULTS, ...((prefs.editor as Partial<EditorPrefs>) ?? {}) };
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => patch<{ preferences: Record<string, unknown> }>('/api/v1/auth/me/preferences', body),
    onSuccess: (r) => {
      const cur = useSession.getState().me;
      if (cur) setMe({ ...cur, user: { ...cur.user, preferences: r.preferences } });
    },
    onError: (e) => toast.error('Настройка не сохранена на сервере: ' + errMsg(e)),
  });
  const changeTheme = (t: 'system' | 'light' | 'dark') => {
    setTheme(t);
    save.mutate({ theme: t });
  };
  const setEditor = (k: keyof EditorPrefs, v: boolean) => save.mutate({ editor: { ...editor, [k]: v } });
  const themes: Array<{ id: 'system' | 'light' | 'dark'; label: string }> = [
    { id: 'system', label: 'Как в системе' },
    { id: 'light', label: 'Светлая' },
    { id: 'dark', label: 'Тёмная' },
  ];
  const toggle = (id: string, label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="admin-setting">
      <div className="grow">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <div className="field-hint">{hint}</div>
      </div>
      <span className="switch">
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={save.isPending} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </div>
  );
  return (
    <section className="col" style={{ gap: 16 }}>
      <div className="card col" style={{ gap: 12 }}>
        <h3 className="admin-card-title">Тема оформления</h3>
        <div className="admin-seg" role="radiogroup" aria-label="Тема оформления">
          {themes.map((t) => (
            <label key={t.id} className={theme === t.id ? 'on' : ''}>
              <input type="radio" name="theme" checked={theme === t.id} onChange={() => changeTheme(t.id)} /> {t.label}
            </label>
          ))}
        </div>
      </div>
      <div className="card col" style={{ gap: 0 }}>
        <h3 className="admin-card-title">Редактор</h3>
        {toggle('pref-spell', 'Проверка орфографии', 'Подчёркивать ошибки средствами браузера.', editor.spellcheck, (v) => setEditor('spellcheck', v))}
        {toggle('pref-wide', 'Широкие страницы по умолчанию', 'Новые страницы создаются в режиме полной ширины.', editor.wideByDefault, (v) => setEditor('wideByDefault', v))}
        {toggle('pref-typo', 'Умная типографика', 'Автоматически заменять кавычки на «ёлочки», дефисы — на тире.', editor.smartTypography, (v) => setEditor('smartTypography', v))}
        {toggle('pref-hints', 'Подсказки по интерфейсу', 'Показывать короткие подсказки при первом использовании функций.', !hintsDisabled, (v) => setHintsDisabled(!v))}
      </div>
      <p className="muted small">Тема и подсказки применяются сразу на этом устройстве; настройки редактора сохраняются в профиле и действуют на всех устройствах.</p>
    </section>
  );
}

// ---------------------------------------------------------------- password & MFA

function passwordProblem(p: string): string | null {
  if (!p) return null;
  if (p.length < 10) return 'Не менее 10 символов';
  if (!/\p{L}/u.test(p) || !/\d/.test(p)) return 'Нужны буквы и цифры';
  return null;
}

function SecurityTab() {
  const me = useMe();
  const qc = useQueryClient();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [rep, setRep] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const pw = useMutation({
    mutationFn: () => post('/api/v1/auth/password', { current: cur, next }),
    onSuccess: () => {
      setCur('');
      setNext('');
      setRep('');
      setPwError(null);
      qc.invalidateQueries({ queryKey: ['me', 'sessions'] });
      toast.success('Пароль изменён. Остальные сеансы завершены.');
    },
    onError: (e) => setPwError(errMsg(e)),
  });
  const problem = passwordProblem(next);
  const mismatch = rep && rep !== next ? 'Пароли не совпадают' : null;
  const canSubmit = cur && next && rep && !problem && !mismatch && !pw.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) pw.mutate();
  };
  return (
    <section className="col" style={{ gap: 16 }}>
      {me.org.settings.requireMfa && !me.user.mfaEnabled && (
        <div className="alert warning" role="alert">
          Политика организации требует двухфакторную аутентификацию. Настройте её ниже.
        </div>
      )}
      <form className="card col" style={{ gap: 14 }} onSubmit={submit}>
        <h3 className="admin-card-title">Смена пароля</h3>
        {pwError && (
          <div className="alert error" role="alert">
            {pwError}
          </div>
        )}
        <input type="text" name="username" autoComplete="username" value={me.user.email} readOnly hidden />
        <div className="field">
          <label htmlFor="pw-cur">Текущий пароль</label>
          <input id="pw-cur" className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
        <div className="admin-form-grid">
          <div className="field">
            <label htmlFor="pw-new">Новый пароль</label>
            <input id="pw-new" className="input" type="password" autoComplete="new-password" value={next} aria-invalid={!!problem} onChange={(e) => setNext(e.target.value)} />
            {problem ? <div className="field-error">{problem}</div> : <div className="field-hint">Не менее 10 символов, буквы и цифры.</div>}
          </div>
          <div className="field">
            <label htmlFor="pw-rep">Повторите пароль</label>
            <input id="pw-rep" className="input" type="password" autoComplete="new-password" value={rep} aria-invalid={!!mismatch} onChange={(e) => setRep(e.target.value)} />
            {mismatch && <div className="field-error">{mismatch}</div>}
          </div>
        </div>
        <div className="row">
          <span className="muted small grow">После смены пароля другие сеансы будут завершены.</span>
          <button className="btn primary" type="submit" disabled={!canSubmit} aria-busy={pw.isPending}>
            {pw.isPending && <span className="spinner" />} Изменить пароль
          </button>
        </div>
      </form>
      <MfaCard />
    </section>
  );
}

function MfaCard() {
  const { me, setMe } = useSession();
  const enabled = !!me?.user.mfaEnabled;
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setEnabled = (v: boolean) => {
    const cur = useSession.getState().me;
    if (cur) setMe({ ...cur, user: { ...cur.user, mfaEnabled: v } });
  };
  const start = useMutation({
    mutationFn: () => post<{ secret: string; uri: string }>('/api/v1/auth/mfa/setup'),
    onSuccess: (r) => {
      setSetup(r);
      setError(null);
      setCode('');
    },
    onError: (e) => setError(errMsg(e)),
  });
  const enable = useMutation({
    mutationFn: () => post('/api/v1/auth/mfa/enable', { code: code.replace(/\s/g, '') }),
    onSuccess: () => {
      setEnabled(true);
      setSetup(null);
      setCode('');
      setError(null);
      toast.success('Двухфакторная аутентификация включена');
    },
    onError: (e) => setError(errMsg(e)),
  });
  const disable = useMutation({
    mutationFn: () => post('/api/v1/auth/mfa/disable', { code: code.replace(/\s/g, '') }),
    onSuccess: () => {
      setEnabled(false);
      setCode('');
      setError(null);
      toast.success('Двухфакторная аутентификация отключена');
    },
    onError: (e) => setError(errMsg(e)),
  });
  const codeOk = /^\d{6}$/.test(code.replace(/\s/g, ''));
  const codeField = (id: string) => (
    <div className="field">
      <label htmlFor={id}>Код из приложения</label>
      <input id={id} className="input admin-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
    </div>
  );
  return (
    <div className="card col" style={{ gap: 14 }}>
      <div className="row">
        <h3 className="admin-card-title grow">
          <Smartphone size={16} /> Двухфакторная аутентификация
        </h3>
        {enabled ? <Badge color="green">включена</Badge> : <Badge>выключена</Badge>}
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {enabled ? (
        <form
          className="col"
          style={{ gap: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!codeOk) return;
            if (await confirm({ title: 'Отключить двухфакторную аутентификацию?', body: 'Учётная запись будет защищена только паролем.', confirmLabel: 'Отключить', danger: true })) disable.mutate();
          }}
        >
          <p className="small muted">При входе запрашивается одноразовый код из приложения-аутентификатора. Чтобы отключить защиту, введите текущий код.</p>
          {codeField('mfa-off')}
          <div>
            <button className="btn danger" type="submit" disabled={!codeOk || disable.isPending} aria-busy={disable.isPending}>
              {disable.isPending && <span className="spinner" />} Отключить
            </button>
          </div>
        </form>
      ) : setup ? (
        <form
          className="col"
          style={{ gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (codeOk) enable.mutate();
          }}
        >
          <ol className="admin-list small">
            <li>Откройте приложение-аутентификатор (например, Яндекс Ключ, Google Authenticator, FreeOTP).</li>
            <li>Добавьте учётную запись вручную, введя секретный ключ, или откройте ссылку otpauth на этом устройстве.</li>
            <li>Введите шестизначный код, который покажет приложение.</li>
          </ol>
          <CopyField value={setup.secret.replace(/(.{4})/g, '$1 ').trim()} label="Секретный ключ" hint="Тип: по времени (TOTP), 6 цифр, 30 секунд." />
          <CopyField value={setup.uri} label="Ссылка otpauth://" />
          {codeField('mfa-on')}
          <div className="row">
            <button type="button" className="btn" onClick={() => setSetup(null)}>
              Отмена
            </button>
            <button className="btn primary" type="submit" disabled={!codeOk || enable.isPending} aria-busy={enable.isPending}>
              {enable.isPending && <span className="spinner" />} Включить
            </button>
          </div>
        </form>
      ) : (
        <div className="row admin-wrap">
          <p className="small muted grow">Дополнительная защита: помимо пароля при входе запрашивается код из приложения на телефоне.</p>
          <button className="btn primary" onClick={() => start.mutate()} disabled={start.isPending} aria-busy={start.isPending}>
            {start.isPending && <span className="spinner" />} Настроить
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- sessions

interface SessionRow {
  id: string;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  ip: string | null;
  user_agent: string | null;
  current: boolean;
}

function describeAgent(ua: string | null): string {
  if (!ua) return 'Неизвестное устройство';
  const browser = /Edg\//.test(ua) ? 'Edge' : /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Браузер';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser}, ${os}` : browser;
}

function SessionsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'sessions'], queryFn: () => get<{ sessions: SessionRow[] }>('/api/v1/auth/sessions') });
  const revoke = useMutation({
    mutationFn: () => post('/api/v1/auth/sessions/revoke-others'),
    onSuccess: () => {
      toast.success('Остальные сеансы завершены');
      qc.invalidateQueries({ queryKey: ['me', 'sessions'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const [ending, setEnding] = useState<string | null>(null);
  const endOne = async (s: SessionRow) => {
    if (!(await confirm({ title: 'Завершить сеанс?', body: `На устройстве «${describeAgent(s.user_agent)}» будет выполнен выход.`, confirmLabel: 'Завершить', danger: true }))) return;
    setEnding(s.id);
    try {
      await del(`/api/v1/auth/sessions/${s.id}`);
      toast.success('Сеанс завершён');
      qc.invalidateQueries({ queryKey: ['me', 'sessions'] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setEnding(null);
    }
  };
  const list = q.data?.sessions ?? [];
  const others = list.filter((s) => !s.current).length;
  return (
    <section className="col" style={{ gap: 16 }}>
      <div className="row admin-wrap">
        <p className="muted small grow">Устройства, на которых выполнен вход в вашу учётную запись. Если вы не узнаёте устройство, завершите остальные сеансы и смените пароль.</p>
        <button
          className="btn danger"
          disabled={!others || revoke.isPending}
          aria-busy={revoke.isPending}
          onClick={async () => {
            if (await confirm({ title: 'Завершить остальные сеансы?', body: `Будет выполнен выход на ${others} других устройствах. Текущий сеанс останется активным.`, confirmLabel: 'Завершить', danger: true })) revoke.mutate();
          }}
        >
          {revoke.isPending && <span className="spinner" />} Завершить остальные
        </button>
      </div>
      {q.isLoading ? (
        <LoadingRows />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <Empty title="Нет активных сеансов" />
      ) : (
        <ul className="settings-sessions">
          {list.map((s) => (
            <li key={s.id} className="card row" style={{ alignItems: 'flex-start' }}>
              <Monitor size={18} className="muted" style={{ flex: 'none', marginTop: 2 }} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row admin-wrap">
                  <b>{describeAgent(s.user_agent)}</b>
                  {s.current && <Badge color="green">этот сеанс</Badge>}
                </div>
                <div className="muted small">
                  {s.ip ? `IP ${s.ip} · ` : ''}активность {relTime(s.last_seen_at ?? s.created_at)} · вход {fullTime(s.created_at)}
                </div>
                <div className="muted small">Истекает {fullTime(s.expires_at)}</div>
              </div>
              {!s.current && (
                <button className="btn sm danger" disabled={ending === s.id} aria-busy={ending === s.id} onClick={() => endOne(s)}>
                  {ending === s.id && <span className="spinner" />} Завершить
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- API tokens

interface TokenRow {
  id: string;
  name: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  expired: boolean;
}

function TokensTab() {
  const qc = useQueryClient();
  const tokens = useQuery({ queryKey: ['me', 'tokens'], queryFn: () => get<{ tokens: TokenRow[] }>('/api/v1/me/tokens') });
  const [revoking, setRevoking] = useState<string | null>(null);
  const revoke = async (t: TokenRow) => {
    if (!(await confirm({ title: `Отозвать токен «${t.name}»?`, body: 'Интеграции, использующие этот токен, сразу потеряют доступ. Действие нельзя отменить.', confirmLabel: 'Отозвать', danger: true }))) return;
    setRevoking(t.id);
    try {
      await del(`/api/v1/me/tokens/${t.id}`);
      toast.success('Токен отозван');
      qc.invalidateQueries({ queryKey: ['me', 'tokens'] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setRevoking(null);
    }
  };
  const [name, setName] = useState('');
  const [days, setDays] = useState('90');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const m = useMutation({
    mutationFn: () => post<{ token: string }>('/api/v1/me/tokens', { name: name.trim(), expiresInDays: Number(days) }),
    onSuccess: (r) => {
      setCreated({ name: name.trim(), token: r.token });
      qc.invalidateQueries({ queryKey: ['me', 'tokens'] });
      setName('');
      setError(null);
    },
    onError: (e) => setError(errMsg(e)),
  });
  const daysNum = Number(days);
  const daysBad = !Number.isInteger(daysNum) || daysNum < 1 || daysNum > 365;
  return (
    <section className="col" style={{ gap: 16 }}>
      <p className="muted small">Персональные токены позволяют интеграциям обращаться к API от вашего имени с вашими правами. Передавайте токен в заголовке <code>Authorization: Bearer …</code>. При деактивации учётной записи все токены отзываются.</p>
      {created && (
        <div className="card col" style={{ gap: 12 }} role="status">
          <div className="alert success">
            Токен «{created.name}» создан. Скопируйте его сейчас — после ухода со страницы он больше не будет показан.
          </div>
          <CopyField value={created.token} label="Токен" />
          <div>
            <button className="btn" onClick={() => setCreated(null)}>
              Я сохранил токен
            </button>
          </div>
        </div>
      )}
      <form
        className="card col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && !daysBad) m.mutate();
        }}
      >
        <h3 className="admin-card-title">Новый токен</h3>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="admin-form-grid">
          <div className="field">
            <label htmlFor="tk-name">Назначение</label>
            <input id="tk-name" className="input" maxLength={100} placeholder="например, Выгрузка в BI" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tk-days">Срок действия, дней</label>
            <input id="tk-days" className="input" type="number" min={1} max={365} value={days} aria-invalid={daysBad} onChange={(e) => setDays(e.target.value)} />
            {daysBad ? <div className="field-error">От 1 до 365 дней</div> : <div className="field-hint">Максимум 365 дней.</div>}
          </div>
        </div>
        <div>
          <button className="btn primary" type="submit" disabled={!name.trim() || daysBad || m.isPending} aria-busy={m.isPending}>
            {m.isPending && <span className="spinner" />} Создать токен
          </button>
        </div>
      </form>
      <div className="card col" style={{ gap: 12 }}>
        <h3 className="admin-card-title">Ваши токены</h3>
        {tokens.isLoading ? (
          <LoadingRows rows={3} />
        ) : tokens.isError ? (
          <ErrorState error={tokens.error} onRetry={() => tokens.refetch()} />
        ) : !tokens.data?.tokens.length ? (
          <Empty icon={<KeyRound size={28} />} title="Токенов нет">
            Создайте токен, чтобы подключить интеграцию.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table admin-table">
              <thead>
                <tr>
                  <th>Назначение</th>
                  <th>Создан</th>
                  <th>Действует до</th>
                  <th>Последнее использование</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {tokens.data.tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="admin-break">{t.name}</td>
                    <td className="small admin-nowrap" title={fullTime(t.created_at)}>
                      {relTime(t.created_at)}
                    </td>
                    <td className="small admin-nowrap" title={fullTime(t.expires_at)}>
                      {t.expired ? <Badge color="red">истёк</Badge> : t.expires_at ? new Date(t.expires_at).toLocaleDateString('ru-RU') : 'бессрочно'}
                    </td>
                    <td className="small muted admin-nowrap" title={fullTime(t.last_used_at)}>
                      {t.last_used_at ? relTime(t.last_used_at) : 'не использовался'}
                    </td>
                    <td className="admin-cell-actions">
                      <button className="btn sm danger" disabled={revoking === t.id} aria-busy={revoking === t.id} onClick={() => revoke(t)}>
                        {revoking === t.id && <span className="spinner" />} Отозвать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
