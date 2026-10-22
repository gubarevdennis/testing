import '../styles/admin.css';
import type { ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Activity, Archive, FolderTree, Hourglass, ScrollText, Settings, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { useMe } from '../state/session';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { roleOf, ROLE_LABEL } from './common';
import { UsersSection } from './UsersSection';
import { GroupsSection } from './GroupsSection';
import { OrgSettingsSection } from './OrgSettingsSection';
import { AuditSection } from './AuditSection';
import { ArchivesSection } from './ArchivesSection';
import { HealthSection } from './HealthSection';
import { ExpiringSection } from './ExpiringSection';
import { AccessSection } from './AccessSection';

interface SectionDef {
  path: string;
  label: string;
  icon: ReactNode;
  allowed: boolean;
  element: ReactNode;
}

/** Admin console (/admin/*). Sections are shown according to the organisation role. */
export default function AdminPage() {
  const me = useMe();
  const r = roleOf(me.user.orgRole);
  const guest = me.user.kind === 'guest';
  const sections: SectionDef[] = [
    { path: 'users', label: 'Пользователи', icon: <Users size={15} />, allowed: r.canPeople, element: <UsersSection /> },
    { path: 'groups', label: 'Группы и отделы', icon: <FolderTree size={15} />, allowed: r.canPeople, element: <GroupsSection /> },
    { path: 'settings', label: 'Настройки организации', icon: <Settings size={15} />, allowed: r.isAdmin, element: <OrgSettingsSection /> },
    { path: 'audit', label: 'Журнал аудита', icon: <ScrollText size={15} />, allowed: r.canAudit, element: <AuditSection /> },
    { path: 'archives', label: 'Резервные копии и архив', icon: <Archive size={15} />, allowed: r.isAdmin, element: <ArchivesSection /> },
    { path: 'health', label: 'Состояние системы', icon: <Activity size={15} />, allowed: r.isAdmin, element: <HealthSection /> },
    { path: 'expiring', label: 'Истекающие доступы', icon: <Hourglass size={15} />, allowed: r.canPeople, element: <ExpiringSection /> },
    { path: 'access', label: 'Доступ', icon: <ShieldCheck size={15} />, allowed: r.canPeople || r.canAudit, element: <AccessSection /> },
  ].filter((s) => s.allowed && !guest);

  if (!sections.length) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-icon">
            <ShieldAlert size={32} />
          </div>
          <h3>Нет доступа к администрированию</h3>
          <p>Раздел доступен владельцу, администраторам, администраторам персонала и аудиторам организации.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container admin-page">
      <h1 className="page-heading">Администрирование</h1>
      <p className="page-sub">
        {me.org.name} · ваша роль: {ROLE_LABEL[me.user.orgRole] ?? me.user.orgRole}
        {r.canAudit && !r.canPeople ? ' (только чтение журнала)' : ''}
      </p>
      <nav className="tabs admin-tabs" aria-label="Разделы администрирования">
        {sections.map((s) => (
          <NavLink key={s.path} to={s.path} className="tab admin-tab">
            {s.icon}
            <span>{s.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="admin-body">
        <ErrorBoundary>
          <Routes>
            <Route index element={<Navigate to={sections[0].path} replace />} />
            {sections.map((s) => (
              <Route key={s.path} path={s.path + '/*'} element={s.element} />
            ))}
            <Route path="*" element={<Navigate to={sections[0].path} replace />} />
          </Routes>
        </ErrorBoundary>
      </div>
    </div>
  );
}
