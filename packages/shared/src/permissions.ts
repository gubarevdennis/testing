/**
 * Access model shared by server (enforcement) and client (display only — the client never decides access).
 *
 * Grants give a subject (user / group / whole organisation) a level on a space or page.
 * Levels are ordered; capability flags (export, download, share, publish) can be narrowed per grant and by space policy.
 * A grant with level "none" is an explicit deny and wins over allows for that subject.
 */
export const LEVELS = ['none', 'view', 'comment', 'edit', 'full'] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_RANK: Record<Level, number> = { none: 0, view: 1, comment: 2, edit: 3, full: 4 };

export const LEVEL_LABELS: Record<Level, string> = {
  none: 'Нет доступа',
  view: 'Просмотр',
  comment: 'Комментирование',
  edit: 'Редактирование',
  full: 'Полный доступ',
};

export const ACTIONS = [
  'view',
  'comment',
  'edit',
  'create', // create child pages
  'manage_structure', // move / delete / archive / restore children
  'publish',
  'share', // manage access
  'export',
  'download',
  'view_history',
  'restore',
  'delete',
  'manage_space',
] as const;
export type Action = (typeof ACTIONS)[number];

/** Minimum level required for each action (before policy / flag restrictions). */
export const ACTION_MIN_LEVEL: Record<Action, Level> = {
  view: 'view',
  comment: 'comment',
  edit: 'edit',
  create: 'edit',
  manage_structure: 'edit',
  publish: 'edit',
  share: 'full',
  export: 'view',
  download: 'view',
  view_history: 'view',
  restore: 'edit',
  delete: 'edit',
  manage_space: 'full',
};

export type SubjectType = 'user' | 'group' | 'org' | 'space';
export type ResourceType = 'space' | 'page';

export interface GrantFlags {
  /** null = inherit default for the level */
  canExport?: boolean | null;
  canDownload?: boolean | null;
  canShare?: boolean | null;
  canPublish?: boolean | null;
}

export interface SpacePolicy {
  /** 'live': readers see the current document; 'publish': readers (view/comment) see only published revisions. */
  publishingMode: 'live' | 'publish';
  requireApproval: boolean;
  allowExport: boolean;
  allowDownload: boolean;
  allowGuests: boolean;
}

export const DEFAULT_SPACE_POLICY: SpacePolicy = {
  publishingMode: 'live',
  requireApproval: false,
  allowExport: true,
  allowDownload: true,
  allowGuests: false,
};

export const SPACE_KINDS = ['org', 'department', 'project', 'private', 'personal', 'archive'] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

/** open: all employees see it; closed: name visible, content by invitation; private: invisible to non-members. */
export const SPACE_VISIBILITY = ['open', 'closed', 'private'] as const;
export type SpaceVisibility = (typeof SPACE_VISIBILITY)[number];

export const ORG_ROLES = ['owner', 'admin', 'people_admin', 'auditor', 'member'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
export const USER_KINDS = ['employee', 'guest'] as const;
export type UserKind = (typeof USER_KINDS)[number];

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Владелец организации',
  admin: 'Администратор',
  people_admin: 'Администратор участников',
  auditor: 'Аудитор',
  member: 'Сотрудник',
};

export interface AccessSource {
  grantId: string;
  resourceType: ResourceType;
  resourceId: string;
  resourceTitle?: string;
  subjectType: SubjectType;
  subjectId: string | null;
  subjectName?: string;
  level: Level;
  expiresAt: string | null;
  /** 'direct' | 'group' | 'org' | 'inherited-page' | 'space' */
  via: string;
}

export interface EffectiveAccess {
  level: Level;
  actions: Record<Action, boolean>;
  sources: AccessSource[];
  denies: AccessSource[];
  /** Human readable explanation lines (Russian). */
  explanation: string[];
}

export function levelAtLeast(level: Level, min: Level): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[min];
}

export function maxLevel(a: Level, b: Level): Level {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

/** Computes allowed actions from the effective level, merged grant flags and space policy. */
export function actionsFor(level: Level, flags: GrantFlags, policy: SpacePolicy, opts: { guest?: boolean; personalOwner?: boolean } = {}): Record<Action, boolean> {
  const out = {} as Record<Action, boolean>;
  for (const a of ACTIONS) out[a] = levelAtLeast(level, ACTION_MIN_LEVEL[a]);
  if (flags.canExport === false || !policy.allowExport) out.export = false;
  if (flags.canExport === true && levelAtLeast(level, 'view') && policy.allowExport) out.export = true;
  if (flags.canDownload === false || !policy.allowDownload) out.download = false;
  if (flags.canShare === true && levelAtLeast(level, 'edit')) out.share = true;
  if (flags.canShare === false) out.share = false;
  if (flags.canPublish === false) out.publish = false;
  if (opts.guest) {
    out.share = false;
    out.manage_space = false;
  }
  if (opts.personalOwner) {
    // Owner of a personal space always has full control of it.
    for (const a of ACTIONS) out[a] = true;
  }
  return out;
}

export const NO_ACCESS: EffectiveAccess = {
  level: 'none',
  actions: Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<Action, boolean>,
  sources: [],
  denies: [],
  explanation: ['Нет разрешений'],
};
