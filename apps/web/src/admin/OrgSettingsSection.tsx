import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch } from '../api/client';
import { useSession } from '../state/session';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { ErrorState, LoadingRows, SectionHeader, errMsg } from './common';
import { OrgNameCard } from './OrgNameCard';

interface OrgSettings {
  requireMfa: boolean;
  guestsEnabled: boolean;
  publicLinksEnabled: boolean;
  ssoOnly: boolean;
  oidcJitProvisioning?: boolean;
  retention: { trashDays: number; journalDays: number; revisionDays: number };
  quotaPerUserMb: number;
}

const LIMITS = {
  trashDays: [30, 3650],
  journalDays: [90, 3650],
  revisionDays: [365, 36500],
  quotaPerUserMb: [10, 1_000_000],
} as const;

type Form = { requireMfa: boolean; guestsEnabled: boolean; publicLinksEnabled: boolean; ssoOnly: boolean; oidcJitProvisioning: boolean; trashDays: string; journalDays: string; revisionDays: string; quotaPerUserMb: string };

const toForm = (s: OrgSettings): Form => ({
  requireMfa: s.requireMfa,
  guestsEnabled: s.guestsEnabled,
  publicLinksEnabled: s.publicLinksEnabled,
  ssoOnly: s.ssoOnly,
  oidcJitProvisioning: !!s.oidcJitProvisioning,
  trashDays: String(s.retention.trashDays),
  journalDays: String(s.retention.journalDays),
  revisionDays: String(s.retention.revisionDays),
  quotaPerUserMb: String(s.quotaPerUserMb),
});

export function OrgSettingsSection() {
  const qc = useQueryClient();
  const { me, setMe } = useSession();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => get<{ settings: OrgSettings }>('/api/v1/admin/settings') });
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = q.data ? toForm(q.data.settings) : null;
  useEffect(() => {
    if (base && !form) setForm(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const invalid = (k: keyof typeof LIMITS) => {
    if (!form) return null;
    const v = Number(form[k]);
    const [lo, hi] = LIMITS[k];
    return !Number.isInteger(v) || v < lo || v > hi ? `Допустимо от ${lo.toLocaleString('ru-RU')} до ${hi.toLocaleString('ru-RU')}` : null;
  };
  const hasErrors = (Object.keys(LIMITS) as Array<keyof typeof LIMITS>).some((k) => invalid(k));
  const dirty = !!form && !!base && JSON.stringify(form) !== JSON.stringify(base);

  const m = useMutation({
    mutationFn: () => {
      const f = form!;
      const b = base!;
      const body: Record<string, unknown> = {};
      for (const k of ['requireMfa', 'guestsEnabled', 'publicLinksEnabled', 'ssoOnly', 'oidcJitProvisioning'] as const) if (f[k] !== b[k]) body[k] = f[k];
      const retention: Record<string, number> = {};
      for (const k of ['trashDays', 'journalDays', 'revisionDays'] as const) if (f[k] !== b[k]) retention[k] = Number(f[k]);
      if (Object.keys(retention).length) body.retention = retention;
      if (f.quotaPerUserMb !== b.quotaPerUserMb) body.quotaPerUserMb = Number(f.quotaPerUserMb);
      return patch<{ settings: OrgSettings }>('/api/v1/admin/settings', body);
    },
    onSuccess: (r) => {
      qc.setQueryData(['admin', 'settings'], r);
      setForm(toForm(r.settings));
      setError(null);
      if (me) setMe({ ...me, org: { ...me.org, settings: { guestsEnabled: r.settings.guestsEnabled, publicLinksEnabled: r.settings.publicLinksEnabled, requireMfa: r.settings.requireMfa } } });
      toast.success('Настройки организации сохранены');
    },
    onError: (e) => setError(errMsg(e)),
  });

  const save = async () => {
    if (!form || !base) return;
    const warnings: string[] = [];
    if (form.ssoOnly && !base.ssoOnly) warnings.push('Вход по паролю будет запрещён всем, кроме владельцев. Убедитесь, что корпоративный SSO настроен и работает.');
    if (form.oidcJitProvisioning && !base.oidcJitProvisioning) warnings.push('Любой сотрудник, прошедший вход через корпоративный SSO, автоматически получит учётную запись в базе знаний.');
    if (form.requireMfa && !base.requireMfa) warnings.push('Пользователи без двухфакторной аутентификации должны будут настроить её при следующем входе.');
    if (!form.guestsEnabled && base.guestsEnabled) warnings.push('Новых гостей нельзя будет приглашать.');
    if (form.publicLinksEnabled && !base.publicLinksEnabled) warnings.push('Пользователи с правом публикации смогут открывать страницы по публичным ссылкам без входа.');
    for (const k of ['trashDays', 'journalDays', 'revisionDays'] as const) if (Number(form[k]) < Number(base[k])) warnings.push('Сокращение сроков хранения приведёт к безвозвратному удалению более старых данных.');
    if (warnings.length) {
      const ok = await confirm({
        title: 'Применить изменения политики?',
        body: (
          <ul className="admin-list">
            {[...new Set(warnings)].map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ),
        confirmLabel: 'Применить',
      });
      if (!ok) return;
    }
    m.mutate();
  };

  if (q.isLoading) return <LoadingRows rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!form) return null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggle = (k: 'requireMfa' | 'guestsEnabled' | 'publicLinksEnabled' | 'ssoOnly' | 'oidcJitProvisioning', label: string, hint: string) => (
    <div className="admin-setting">
      <div className="grow">
        <label htmlFor={'os-' + k} className="field-label">
          {label}
        </label>
        <div className="field-hint">{hint}</div>
      </div>
      <span className="switch">
        <input id={'os-' + k} type="checkbox" role="switch" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />
        <span />
      </span>
    </div>
  );
  const numField = (k: keyof typeof LIMITS, label: string, unit: string) => {
    const err = invalid(k);
    return (
      <div className="field">
        <label htmlFor={'os-' + k}>{label}</label>
        <div className="row">
          <input id={'os-' + k} className="input admin-num" type="number" inputMode="numeric" min={LIMITS[k][0]} max={LIMITS[k][1]} value={form[k]} aria-invalid={!!err} onChange={(e) => set(k, e.target.value)} />
          <span className="muted small">{unit}</span>
        </div>
        {err ? <div className="field-error">{err}</div> : <div className="field-hint">от {LIMITS[k][0].toLocaleString('ru-RU')}</div>}
      </div>
    );
  };

  return (
    <section>
      <SectionHeader title="Настройки организации" sub="Политики безопасности, внешнего доступа и хранения данных. Все изменения записываются в журнал аудита." />
      <OrgNameCard />
      <form
        className="col admin-settings-form"
        style={{ gap: 20 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !hasErrors) save();
        }}
      >
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="card col" style={{ gap: 0 }}>
          <h3 className="admin-card-title">Безопасность</h3>
          {toggle('requireMfa', 'Обязательная двухфакторная аутентификация', 'Каждый пользователь должен подтверждать вход кодом из приложения-аутентификатора.')}
          {toggle('ssoOnly', 'Вход только через SSO', 'Пароли отключаются для всех, кроме владельцев (резервный доступ).')}
          {toggle('oidcJitProvisioning', 'Автоматическое создание учётных записей при входе через SSO', 'Применяется только ко входу через корпоративный SSO: сотрудник без учётной записи получит её автоматически при первом входе.')}
        </div>
        <div className="card col" style={{ gap: 0 }}>
          <h3 className="admin-card-title">Внешний доступ</h3>
          {toggle('guestsEnabled', 'Гостевые учётные записи', 'Разрешить приглашать внешних пользователей с доступом к отдельным страницам.')}
          {toggle('publicLinksEnabled', 'Публичные ссылки', 'Разрешить открывать страницы по ссылке без входа (с учётом политики пространства).')}
        </div>
        <div className="card col" style={{ gap: 14 }}>
          <h3 className="admin-card-title">Хранение данных</h3>
          <div className="admin-form-grid">
            {numField('trashDays', 'Срок хранения в корзине', 'дней')}
            {numField('revisionDays', 'Срок хранения версий', 'дней')}
            {numField('journalDays', 'Срок хранения журнала изменений', 'дней')}
            {numField('quotaPerUserMb', 'Квота файлов на пользователя', 'МБ')}
          </div>
        </div>
        <div className="admin-savebar">
          {dirty && <span className="muted small grow">Есть несохранённые изменения</span>}
          <button type="button" className="btn" disabled={!dirty || m.isPending} onClick={() => base && setForm(base)}>
            Отменить изменения
          </button>
          <button type="submit" className="btn primary" disabled={!dirty || hasErrors || m.isPending} aria-busy={m.isPending}>
            {m.isPending && <span className="spinner" />} Сохранить
          </button>
        </div>
      </form>
    </section>
  );
}
