import type { FastifyInstance } from 'fastify';
import type { Services } from '../app.js';
import { authRoutes } from './auth.js';
import { spaceRoutes } from './spaces.js';
import { pageRoutes } from './pages.js';
import { revisionRoutes } from './revisions.js';
import { accessRoutes } from './access.js';
import { collabRoutes } from './collab.js';
import { adminRoutes } from './admin.js';
import { healthRoutes } from './health.js';
import { attachmentRoutes } from './attachments.js';
import { searchCommentRoutes } from './search-comments.js';
import { templateRoutes } from './templates.js';
import { collectionRoutes } from './collections.js';
import { importExportRoutes } from './import-export.js';

export async function registerRoutes(app: FastifyInstance, s: Services) {
  await healthRoutes(app, s);
  await authRoutes(app, s);
  await spaceRoutes(app, s);
  await pageRoutes(app, s);
  await revisionRoutes(app, s);
  await accessRoutes(app, s);
  await collabRoutes(app, s);
  await adminRoutes(app, s);
  await attachmentRoutes(app, s);
  await searchCommentRoutes(app, s);
  await templateRoutes(app, s);
  await collectionRoutes(app, s);
  await importExportRoutes(app, s);
}
