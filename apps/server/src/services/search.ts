import type { Queryable } from '../db/pool.js';
import { accessForPages, userSubjects, type AuthUser } from '../acl/engine.js';
import { orgSettings } from './org.js';

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';

/** Fixes text typed in the wrong keyboard layout ("ghbdtn" → "привет", "руддщ" → "hello"). */
export function switchLayout(s: string): string {
  return [...s]
    .map((ch) => {
      const lower = ch.toLowerCase();
      let i = EN.indexOf(lower);
      if (i >= 0) return RU[i];
      i = RU.indexOf(lower);
      if (i >= 0) return EN[i];
      return ch;
    })
    .join('');
}

const TRANSLIT: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export function transliterate(s: string): string {
  return [...s.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join('');
}
const REV: Array<[string, string]> = [['sch', 'щ'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'], ['yu', 'ю'], ['ya', 'я'], ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['e', 'е'], ['z', 'з'], ['i', 'и'], ['y', 'й'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['c', 'к'], ['x', 'кс'], ['w', 'в'], ['h', 'х'], ['j', 'дж'], ['q', 'к']];
export function detransliterate(s: string): string {
  let out = s.toLowerCase();
  for (const [lat, cyr] of REV) out = out.split(lat).join(cyr);
  return out;
}

/** Query variants: as typed, wrong layout, transliteration, configured synonyms. */
export function queryVariants(q: string, synonyms: string[][] = []): string[] {
  const base = q.trim();
  const out = new Set<string>([base]);
  if (/^[a-z0-9\s\[\];',.`]+$/i.test(base) && /[a-z]/i.test(base)) {
    out.add(switchLayout(base));
    out.add(detransliterate(base));
  } else if (/[а-яё]/i.test(base)) {
    const sw = switchLayout(base);
    if (/^[a-z0-9\s\[\];',.`]+$/i.test(sw)) out.add(sw);
    out.add(transliterate(base));
  }
  const lower = base.toLowerCase();
  for (const group of synonyms) {
    if (group.some((w) => lower.includes(w.toLowerCase()))) for (const w of group) out.add(lower.replace(new RegExp(group.find((x) => lower.includes(x.toLowerCase()))!.toLowerCase(), 'g'), w.toLowerCase()));
  }
  return [...out].filter(Boolean).slice(0, 8);
}

export interface SearchParams {
  q: string;
  spaceId?: string | null;
  pageId?: string | null;
  status?: string | null;
  authorId?: string | null;
  from?: string | null;
  to?: string | null;
  in?: 'all' | 'text' | 'images' | 'files';
  limit: number;
  offset: number;
}

const CANDIDATES = 3000;

/** Builds an OR-combined tsquery over Russian and English configurations for all variants (+ prefix for the last word). */
function tsqueryExpr(variants: string[], paramOffset: number): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  for (const v of variants) {
    params.push(v);
    const i = paramOffset + params.length;
    parts.push(`websearch_to_tsquery('russian', $${i})`, `websearch_to_tsquery('english', $${i})`);
    const words = v.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (words.length && !v.includes('"')) {
      const prefix = words.map((w, k) => (k === words.length - 1 ? `${w}:*` : w)).join(' & ');
      params.push(prefix);
      const j = paramOffset + params.length;
      parts.push(`to_tsquery('simple', $${j})`);
    }
  }
  return { sql: parts.join(' || '), params };
}

export async function search(q: Queryable, user: AuthUser, p: SearchParams) {
  const settings = await orgSettings(q, user.orgId);
  const variants = queryVariants(p.q, (settings as any).synonyms ?? []);
  const ts = tsqueryExpr(variants, 1);
  const filters: string[] = ['s.org_id = $1'];
  const params: unknown[] = [user.orgId, ...ts.params];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    filters.push(sql.replace('?', '$' + params.length));
  };
  if (p.spaceId) add('s.space_id = ?', p.spaceId);
  if (p.pageId) add('s.page_id = ?', p.pageId);
  if (p.status) add('pg.status = ?', p.status);
  if (p.authorId) add('pg.created_by = ?', p.authorId);
  if (p.from) add('pg.content_updated_at >= ?', p.from);
  if (p.to) add('pg.content_updated_at <= ?', p.to);
  if (p.in === 'images') filters.push(`(to_tsvector('russian', s.ocr) || to_tsvector('english', s.ocr)) @@ query.tq`);
  if (p.in === 'files') filters.push(`to_tsvector('russian', s.files) @@ query.tq`);
  if (p.in === 'text') filters.push(`(s.tsv @@ query.tq or coalesce(s.pub_tsv @@ query.tq, false))`);
  params.push(p.q);
  const rawIdx = params.length;
  // Candidates: full-text match on live or published content, or fuzzy (trigram) title match for typos.
  const rows = (
    await q.query(
      `with query as (select (${ts.sql}) as tq)
       select s.page_id, s.space_id, s.title, s.pub_title, pg.status, pg.icon, pg.content_updated_at,
              ts_rank_cd(s.tsv, query.tq, 32) as rank_live,
              coalesce(ts_rank_cd(s.pub_tsv, query.tq, 32), 0) as rank_pub,
              s.tsv @@ query.tq as m_live, coalesce(s.pub_tsv @@ query.tq, false) as m_pub,
              greatest(similarity(s.title, $${rawIdx}), word_similarity($${rawIdx}, s.title)) as sim
         from search_index s join pages pg on pg.id = s.page_id, query
        where ${filters.join(' and ')} and pg.deleted_at is null
          and (s.tsv @@ query.tq or coalesce(s.pub_tsv @@ query.tq, false) or word_similarity($${rawIdx}, s.title) > 0.45 or s.title ilike '%' || $${rawIdx} || '%')
        order by (s.tsv @@ query.tq) desc, greatest(ts_rank_cd(s.tsv, query.tq, 32), coalesce(ts_rank_cd(s.pub_tsv, query.tq, 32), 0)) + greatest(similarity(s.title, $${rawIdx}), word_similarity($${rawIdx}, s.title)) desc
        limit ${CANDIDATES}`,
      params,
    )
  ).rows;
  // ACL is applied BEFORE counting, ranking output and snippets — nothing about inaccessible pages leaks.
  const subjects = await userSubjects(q, user);
  const access = await accessForPages(q, user, rows.map((r) => r.page_id), subjects);
  const visible = rows
    .map((r) => {
      const a = access.get(r.page_id);
      if (!a?.actions.view || a.deleted) return null;
      const publishedOnly = a.policy.publishingMode === 'publish' && !a.actions.edit;
      if (publishedOnly && !(r.m_pub || (r.pub_title && r.sim > 0.45))) return null;
      if (!publishedOnly && !(r.m_live || r.sim > 0.45 || String(r.title).toLowerCase().includes(p.q.toLowerCase()))) return null;
      return { ...r, publishedOnly, score: (publishedOnly ? r.rank_pub : r.rank_live) + r.sim * 0.5 };
    })
    .filter(Boolean) as any[];
  visible.sort((a, b) => b.score - a.score);
  const total = visible.length;
  const pageRows = visible.slice(p.offset, p.offset + p.limit);
  if (!pageRows.length) return { total, totalIsLowerBound: rows.length >= CANDIDATES, results: [], variants };
  // Snippets, match origin and the first matching block only for the returned page of results.
  const ids = pageRows.map((r) => r.page_id);
  const details = (
    await q.query(
      `with query as (select (${ts.sql}) as tq)
       select s.page_id,
              ts_headline('russian', s.body, query.tq, 'MaxFragments=2, MinWords=6, MaxWords=24, StartSel=<<, StopSel=>>, FragmentDelimiter= … ') as snip_live,
              case when s.pub_body is null then null else ts_headline('russian', s.pub_body, query.tq, 'MaxFragments=2, MinWords=6, MaxWords=24, StartSel=<<, StopSel=>>, FragmentDelimiter= … ') end as snip_pub,
              (to_tsvector('russian', s.title) || to_tsvector('english', s.title)) @@ query.tq as in_title,
              (to_tsvector('russian', s.ocr) || to_tsvector('english', s.ocr)) @@ query.tq as in_ocr,
              to_tsvector('russian', s.files) @@ query.tq as in_files,
              to_tsvector('russian', s.properties) @@ query.tq as in_props,
              case when (to_tsvector('russian', s.ocr) || to_tsvector('english', s.ocr)) @@ query.tq then ts_headline('russian', s.ocr, query.tq, 'MaxFragments=1, MaxWords=16, StartSel=<<, StopSel=>>') end as snip_ocr
         from search_index s, query where s.org_id = $1 and s.page_id = any($${ts.params.length + 2}::uuid[])`,
      [user.orgId, ...ts.params, ids],
    )
  ).rows;
  const spaceNames = new Map((await q.query('select id, name, icon from spaces where id = any($1::uuid[])', [[...new Set(pageRows.map((r) => r.space_id))]])).rows.map((r) => [r.id, r]));
  const crumbs = (await q.query(`select a.page_id, p.id, p.title, a.depth from page_ancestors a join pages p on p.id = a.ancestor_id where a.page_id = any($1::uuid[]) and a.depth > 0 order by a.depth desc`, [ids])).rows;
  const crumbAccess = await accessForPages(q, user, [...new Set(crumbs.map((c) => c.id))], subjects);
  const results = [];
  for (const r of pageRows) {
    const d = details.find((x) => x.page_id === r.page_id) ?? {};
    const blockId = r.publishedOnly ? null : await firstMatchingBlock(q, r.page_id, ts.sql, ts.params);
    results.push({
      pageId: r.page_id,
      title: r.publishedOnly ? r.pub_title ?? r.title : r.title,
      icon: r.icon,
      status: r.status,
      updatedAt: r.content_updated_at,
      space: spaceNames.get(r.space_id) ?? null,
      path: crumbs.filter((c) => c.page_id === r.page_id).map((c) => (crumbAccess.get(c.id)?.actions.view ? c.title : '…')),
      snippet: (r.publishedOnly ? d.snip_pub : d.snip_live) || null,
      matchedIn: [d.in_title && 'title', (r.m_live || r.m_pub) && 'text', d.in_ocr && 'image', d.in_files && 'file', d.in_props && 'properties', !r.m_live && !r.m_pub && r.sim > 0.45 && 'fuzzy'].filter(Boolean),
      ocrSnippet: d.snip_ocr ?? null,
      blockId,
      publishedVersion: r.publishedOnly,
    });
  }
  return { total, totalIsLowerBound: rows.length >= CANDIDATES, results, variants };
}

/** Finds the first block whose text matches, so the client can scroll exactly to it. */
async function firstMatchingBlock(q: Queryable, pageId: string, tsSql: string, tsParams: string[]): Promise<string | null> {
  const st = (await q.query('select content from doc_state where page_id = $1', [pageId])).rows[0];
  if (!st?.content) return null;
  const { collectBlocks } = await import('@kb/shared');
  const blocks = collectBlocks(st.content).filter((b) => b.text);
  if (!blocks.length) return null;
  const r = await q.query(
    `with query as (select (${tsSql}) as tq)
     select ord from unnest($1::text[]) with ordinality t(txt, ord), query
      where (to_tsvector('russian', txt) || to_tsvector('english', txt)) @@ query.tq order by ord limit 1`,
    [blocks.map((b) => b.text), ...tsParams],
  );
  return r.rows[0] ? blocks[Number(r.rows[0].ord) - 1].id : null;
}

/** Fast title suggestions for the quick switcher (Ctrl/Cmd+K). */
export async function suggest(q: Queryable, user: AuthUser, text: string, limit = 8) {
  const variants = queryVariants(text);
  const rows = (
    await q.query(
      `select p.id, p.title, p.icon, p.space_id, max(greatest(word_similarity(v, p.title), similarity(p.title, v))) as sim, bool_or(p.title ilike v || '%') as prefix, bool_or(p.title ilike '%' || v || '%') as contains
         from pages p, unnest($2::text[]) v
        where p.org_id = $1 and p.deleted_at is null and (p.title ilike '%' || v || '%' or word_similarity(v, p.title) > 0.4)
        group by p.id order by bool_or(p.title ilike v || '%') desc, bool_or(p.title ilike '%' || v || '%') desc, max(greatest(word_similarity(v, p.title), similarity(p.title, v))) desc limit 200`,
      [user.orgId, variants],
    )
  ).rows;
  const access = await accessForPages(q, user, rows.map((r) => r.id));
  return rows.filter((r) => access.get(r.id)?.actions.view && !access.get(r.id)?.deleted).slice(0, limit).map((r) => ({ pageId: r.id, title: r.title, icon: r.icon, spaceId: r.space_id }));
}
