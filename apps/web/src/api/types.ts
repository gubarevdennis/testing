import type { OrgAppearance, PageCover } from '@kb/shared';

export interface Me {
  user: { id: string; orgId: string; name: string; email: string; kind: 'employee' | 'guest'; orgRole: string; status: string; mfaEnabled: boolean; title: string | null; phone?: string | null; telegram?: string | null; preferences: Record<string, any> };
  org: { id: string; name: string; slug: string; settings: { guestsEnabled: boolean; publicLinksEnabled: boolean; requireMfa: boolean; appearance?: OrgAppearance } };
  personalSpaceId: string | null;
  csrfToken: string | null;
  sso: boolean;
}

export interface Space {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  kind: string;
  visibility: string;
  archived: boolean;
  member: boolean;
  level: string;
  actions: Record<string, boolean>;
  policy?: { publishingMode: 'live' | 'publish'; requireApproval: boolean; allowExport: boolean; allowDownload: boolean; allowGuests: boolean };
  isPersonal: boolean;
}

export interface TreeNode {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  sortKey: string;
  status: string;
  hasChildren: boolean;
  version: number;
  inheritPermissions: boolean;
  /** Page has its own explicit grants (an exception to inherited rights). */
  hasExplicitGrants?: boolean;
  collectionId: string | null;
  level: string;
  canEdit: boolean;
  canCreate: boolean;
}

export interface PageDto {
  id: string;
  spaceId: string;
  space: { id: string; name: string; icon: string | null; kind: string };
  parentId: string | null;
  title: string;
  icon: string | null;
  cover: PageCover | null;
  status: 'draft' | 'review' | 'published' | 'archived';
  inheritPermissions: boolean;
  /** Page has its own explicit grants (an exception to inherited rights). */
  hasExplicitGrants?: boolean;
  /** Page of a personal space that somebody besides the owner can open («не полностью личная»). */
  personalShared?: boolean;
  locked: boolean;
  wide: boolean;
  properties: Record<string, any>;
  /** Free-form page tags (R-PAGE-001), searchable (R-SEARCH-003). */
  tags?: string[];
  /** Readable URL part derived from the title; the id stays the identity. */
  slug?: string;
  collectionId: string | null;
  createdAt: string;
  updatedAt: string;
  contentUpdatedAt: string | null;
  createdBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  version: number;
  publishedRevisionId: string | null;
  reviewDueAt: string | null;
  verifiedAt: string | null;
  needsReview: boolean;
  deletedAt: string | null;
  /** Legal hold: excluded from purge and retention cleanup (set by org admins). */
  legalHold?: boolean;
  /** Properties the page template declares mandatory. */
  requiredProperties?: string[];
  favorite: boolean;
  access: { level: string; actions: Record<string, boolean>; policy: Space['policy'] };
  readMode: 'live' | 'published';
  /** Pending approval request (only while status is 'review'). */
  approval: { id: string; requestedBy: { id: string; name: string }; approvers: Array<{ id: string; name: string }>; message: string | null; revisionNumber: number | null; createdAt: string } | null;
  /** Currently published revision, if any. */
  published: { revisionId: string; number: number; at: string } | null;
  docGeneration: string | null;
}

export interface Crumb {
  id: string | null;
  title: string;
  icon: string | null;
  hidden: boolean;
}
