import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, type Services } from '../app.js';
import { isOrgAdmin } from '../acl/engine.js';
import { audit } from '../services/audit.js';
import { forbidden, notFound } from '../lib/errors.js';
import { latestConsistencyReport } from '../jobs/worker.js';

const uuid = z.string().uuid();

/**
 * Legal hold (R-HISTORY-015, R-HISTORY-028): a held page or space is excluded from trash purge, journal
 * compaction and revision thinning. Setting and releasing it is an org-admin action and always audited.
 */
export async function retentionRoutes(app: FastifyInstance, s: Services) {
  app.put('/api/v1/admin/legal-hold', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden('Юридическое удержание устанавливают администраторы организации');
    const body = parse(
      z.object({ resourceType: z.enum(['page', 'space']), resourceId: uuid, hold: z.boolean(), reason: z.string().trim().min(3).max(500) }),
      req.body,
    );
    const table = body.resourceType === 'page' ? 'pages' : 'spaces';
    const res = await tx(s.db, async (q) => {
      const cur = (await q.query(`select id, legal_hold, ${body.resourceType === 'page' ? 'title' : 'name'} as name from ${table} where id = $1 and org_id = $2 for update`, [body.resourceId, user.orgId])).rows[0];
      if (!cur) throw notFound();
      if (cur.legal_hold !== body.hold) await q.query(`update ${table} set legal_hold = $2 where id = $1`, [body.resourceId, body.hold]);
      await audit(q, actorOf(req), {
        action: body.hold ? 'legal_hold.set' : 'legal_hold.release',
        targetType: body.resourceType,
        targetId: body.resourceId,
        details: { name: cur.name, reason: body.reason, before: cur.legal_hold, after: body.hold },
      });
      return { resourceType: body.resourceType, resourceId: body.resourceId, legalHold: body.hold };
    });
    if (body.resourceType === 'page') s.bus.emit({ type: 'page-changed', orgId: user.orgId, pageId: body.resourceId, fields: ['legalHold'] });
    return res;
  });

  app.get('/api/v1/admin/legal-holds', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    const pages = (await s.db.query(`select id, title, space_id, deleted_at from pages where org_id = $1 and legal_hold order by title`, [user.orgId])).rows;
    const spaces = (await s.db.query(`select id, name, deleted_at from spaces where org_id = $1 and legal_hold order by name`, [user.orgId])).rows;
    return { pages, spaces };
  });

  /** Last data-integrity check of this instance (tree cycles/orphans, journal gaps, snapshots). */
  app.get('/api/v1/admin/consistency', async (req) => {
    const user = requireUser(req);
    if (!isOrgAdmin(user)) throw forbidden();
    return { report: latestConsistencyReport() };
  });
}
