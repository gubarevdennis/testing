#!/usr/bin/env -S node --import tsx
/**
 * Action inventory (QA26-01, QA26-04, R-QA-002): enumerates every route and interactive control of the web client from
 * its source with the TypeScript parser and writes docs/qa/action-inventory.yaml with stable ids
 * `<screen>/<Component>/<action>`.
 *
 * Sources of actions:
 *  - <Route path> in the router files and `{ path, label }` section tables (admin) → kind `route`;
 *  - JSX controls: <button>, <a>, <Link>/<NavLink>, <input>/<textarea>/<select>, elements with role=button|menuitem|tab|
 *    switch|checkbox|option|link, <Toggle>, <CopyField>, <Menu label>, <Dialog title> — named by aria-label, title, label,
 *    placeholder, a wrapping <Tooltip label>/<label> or their static text;
 *  - object tables `{ id, label|title, … }` (menu items, slash commands, quick-switcher commands, colour palettes) and toast
 *    actions `{ label, run|href }`;
 *  - the runtime crawl (tests/e2e/qa-crawl.spec.ts → docs/qa/runtime-controls.json): every control actually rendered on each
 *    route as owner; names found only at runtime become `runtime` entries, the others mark static entries as `seen`.
 *
 * Controls whose name is entirely data-driven (e.g. `{page.title}`) cannot be named statically; they are counted in
 * `summary.dynamic_unnamed` and are represented by the runtime crawl.
 *
 * Usage: node --import tsx scripts/qa/inventory.ts [--check]   (--check: exit 1 if the committed file is stale)
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WEB = join(ROOT, 'apps/web/src');
export const INVENTORY = join(ROOT, 'docs/qa/action-inventory.yaml');
const RUNTIME = join(ROOT, 'docs/qa/runtime-controls.json');

export type Kind = 'route' | 'button' | 'link' | 'input' | 'select' | 'toggle' | 'tab' | 'menu' | 'menu-item' | 'command' | 'option' | 'dialog' | 'toast-action' | 'runtime';

export interface Action {
  id: string;
  kind: Kind;
  screen: string;
  component: string;
  label: string;
  aliases?: string[];
  /** label contains data-driven parts, shown as … */
  dynamic?: boolean;
  source: string;
  critical: boolean;
  shortcut?: string;
  /** text shown when the action is unavailable for lack of rights (from disabledReason / title of a disabled control) */
  no_permission?: string;
  confirm?: boolean;
  route?: string;
  /** routes on which the runtime crawl saw this control */
  seen?: string[];
  /** slash-menu search keywords (commands) */
  keywords?: string;
}

export function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => name.endsWith(e)) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out.sort();
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
export function slug(s: string): string {
  const t = s
    .toLowerCase()
    .split('')
    .map((c) => TRANSLIT[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return t.slice(0, 48).replace(/-+$/, '') || 'x';
}

export const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Marker of a data-driven part of a label (template substitution, `{value}`); a literal … in a label is just text. */
export const DYN = '{…}';
export const DYN_RE = /\{…\}/g;

/** Screen of a source file: the route area it belongs to. */
function screenOf(file: string): string {
  const rel = relative(WEB, file).replace(/\\/g, '/');
  const b = basename(rel).replace(/\.tsx?$/, '');
  if (rel.startsWith('pages/')) {
    const map: Record<string, string> = { Auth: 'auth', Home: 'home', PageView: 'page', SpacePage: 'space', SearchPage: 'search', TrashPage: 'trash', TemplatesPage: 'templates', ImportPage: 'import', SettingsPage: 'settings' };
    return map[b] ?? slug(b);
  }
  if (rel.startsWith('admin/')) return 'admin';
  if (rel.startsWith('layout/')) return 'shell';
  if (rel.startsWith('editor/')) return 'editor';
  if (rel.startsWith('components/page/')) return 'page';
  if (rel.startsWith('components/space/')) return 'space';
  if (rel.startsWith('components/ui/')) return 'ui';
  if (rel.startsWith('help/')) return 'help';
  if (rel === 'App.tsx') return 'app';
  return 'common';
}

/** Destructive, data, ACL, auth, publication and recovery operations — the paths that must never be untested. */
const CRITICAL_RE =
  /удал|корзин|восстанов|доступ|прав[ао]|поделит|публик|опубликов|ссылк[аиу] для|экспорт|импорт|архив|резервн|пароль|войти|выйти|вход\b|создать организац|пригла|роль|заблок|разблок|деактив|активир|токен|сохран|перемест|перенес|откат|верси|истори|отозв|сессии|завершить|подтверд|загрузить|прикреп|переименов|дублир|новая страница|создать|отправ|принять|отклонить|очистить|сбросить|legal|hold|удержан|участник|групп|share|delete|restore|trash|export|import|archive|backup|password|login|logout|publish|revoke|move|rename|upload/i;

const CRITICAL_FIELD_RE = /пароль|доступ|прав[ао]|роль|password/i;

function isCritical(kind: Kind, label: string, id: string): boolean {
  if (kind === 'route') return true;
  if (kind === 'option' || kind === 'tab' || kind === 'menu') return false;
  if (kind === 'input' || kind === 'select' || kind === 'toggle') return CRITICAL_FIELD_RE.test(label);
  return CRITICAL_RE.test(label) || CRITICAL_RE.test(id);
}

interface Raw extends Omit<Action, 'id' | 'critical'> {
  key: string;
  group: string;
}

/** Static text of an expression: string literal, template (substitutions → …), `a ? 'x' : 'y'` (both), `a || 'x'`. */
function textOf(e: ts.Expression | undefined, sf: ts.SourceFile): { text: string[]; dynamic: boolean } | null {
  if (!e) return null;
  if (ts.isParenthesizedExpression(e)) return textOf(e.expression, sf);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { text: [e.text], dynamic: false };
  if (ts.isTemplateExpression(e)) {
    let s = e.head.text;
    for (const span of e.templateSpans) s += DYN + span.literal.text;
    return { text: [s], dynamic: true };
  }
  if (ts.isConditionalExpression(e)) {
    const a = textOf(e.whenTrue, sf);
    const b = textOf(e.whenFalse, sf);
    if (a && b) return { text: [...a.text, ...b.text], dynamic: a.dynamic || b.dynamic };
    return a ?? b;
  }
  if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.BarBarToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) {
    const b = textOf(e.right, sf);
    return b ? { text: b.text, dynamic: true } : null;
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = textOf(e.left, sf);
    const b = textOf(e.right, sf);
    if (!a && !b) return null;
    return { text: [(a?.text[0] ?? DYN) + (b?.text[0] ?? DYN)], dynamic: true };
  }
  return null;
}

function attr(el: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return el.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name);
}
function attrText(el: ts.JsxOpeningLikeElement, name: string, sf: ts.SourceFile) {
  const a = attr(el, name);
  if (!a || !a.initializer) return null;
  if (ts.isStringLiteral(a.initializer)) return { text: [a.initializer.text], dynamic: false };
  if (ts.isJsxExpression(a.initializer)) return textOf(a.initializer.expression, sf);
  return null;
}

/** Static text content of a JSX element (JsxText + string literal expressions, recursively). */
function childText(node: ts.Node, sf: ts.SourceFile): { text: string; dynamic: boolean } {
  let text = '';
  let dynamic = false;
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n)) text += ' ' + n.text;
    else if (ts.isJsxExpression(n)) {
      if (!n.expression) return;
      const t = textOf(n.expression, sf);
      if (t) {
        text += ' ' + t.text[0];
        dynamic ||= t.dynamic;
      } else if (!ts.isJsxElement(n.expression) && !ts.isJsxSelfClosingElement(n.expression)) {
        // `{cond && <Icon/>}` contributes nothing; `{value}` is data
        if (!ts.isBinaryExpression(n.expression) && !ts.isConditionalExpression(n.expression)) {
          text += ' ' + DYN;
          dynamic = true;
        } else n.expression.forEachChild(visit);
      } else visit(n.expression);
    } else if (ts.isJsxElement(n)) n.children.forEach(visit);
    else if (ts.isJsxFragment(n)) n.children.forEach(visit);
  };
  if (ts.isJsxElement(node)) node.children.forEach(visit);
  return { text: norm(text), dynamic };
}

function enclosingNames(node: ts.Node): { component: string | null; group: string | null } {
  let component: string | null = null;
  let group: string | null = null;
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    let name: string | null = null;
    if (ts.isFunctionDeclaration(p) && p.name) name = p.name.text;
    else if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name)) name = p.parent.name.text;
    else if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) name = p.name.text;
    else if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) name = p.name.text;
    if (!name) continue;
    if (!group) group = name;
    if (/^[A-Z]/.test(name) && !/^[A-Z0-9_]+$/.test(name) && (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isVariableDeclaration(p))) {
      component = name;
      break;
    }
  }
  return { component, group };
}

const ROLE_KIND: Record<string, Kind> = { button: 'button', menuitem: 'menu-item', menuitemcheckbox: 'menu-item', menuitemradio: 'menu-item', tab: 'tab', switch: 'toggle', checkbox: 'toggle', option: 'option', link: 'link', combobox: 'select', textbox: 'input', searchbox: 'input' };
const ROUTE_PREFIX: Record<string, string> = { 'pages/SettingsPage.tsx': '/settings/', 'admin/AdminPage.tsx': '/admin/' };

export function scanSource(): { raws: Raw[]; dynamicUnnamed: Array<{ source: string; kind: string }> } {
  const raws: Raw[] = [];
  const dynamicUnnamed: Array<{ source: string; kind: string }> = [];
  for (const file of walk(WEB, ['.tsx', '.ts'])) {
    const rel = relative(WEB, file).replace(/\\/g, '/');
    const src = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const screen = screenOf(file);
    const fileComp = basename(file).replace(/\.tsx?$/, '');
    const loc = (n: ts.Node) => `apps/web/src/${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    const push = (n: ts.Node, kind: Kind, labels: string[], dynamic: boolean, extra: Partial<Raw> = {}, key?: string) => {
      const ls = [...new Set(labels.map(norm).filter(Boolean))];
      if (!ls.length) return;
      const { component, group } = enclosingNames(n);
      raws.push({ kind, screen, component: component ?? fileComp, label: ls[0], ...(ls.length > 1 ? { aliases: ls.slice(1) } : {}), ...(dynamic ? { dynamic: true } : {}), source: loc(n), key: key ?? slug(ls[0].replace(DYN_RE, ' ')), group: group ?? '', ...extra });
    };

    const visit = (n: ts.Node) => {
      if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
        const el = n;
        const tag = el.tagName.getText(sf);
        const whole = ts.isJsxOpeningElement(el) ? el.parent : el;
        const role = attrText(el, 'role', sf)?.text[0];
        const aria = attrText(el, 'aria-label', sf);
        const title = attrText(el, 'title', sf);
        const disabledReason = attr(el, 'disabled') && title ? title.text[0] : undefined;
        if (tag === 'Route') {
          const p = attrText(el, 'path', sf);
          if (p) {
            const raw = p.text[0];
            const prefix = ROUTE_PREFIX[rel] ?? '';
            const path = raw === '*' || raw === '/*' ? null : (prefix + raw).replace(/\/\*$/, '').replace(/\/+/g, '/');
            // a dynamic path (`s.path + '/*'`) is generated from a section table that is inventoried itself
            if (path && !p.dynamic) push(el, 'route', [path], false, { route: path }, slug(path === '/' ? 'root' : path));
          }
        } else if (tag === 'Dialog') {
          const t = attrText(el, 'title', sf);
          if (t) push(el, 'dialog', t.text, t.dynamic);
        } else if (tag === 'Menu') {
          const l = attrText(el, 'label', sf);
          if (l) push(el, 'menu', l.text, l.dynamic);
        } else if (tag === 'Toggle' || tag === 'CopyField') {
          const l = attrText(el, 'label', sf) ?? aria;
          if (l) push(el, tag === 'Toggle' ? 'toggle' : 'input', l.text, l.dynamic);
        } else {
          let kind: Kind | null = null;
          if (tag === 'button') kind = 'button';
          else if (tag === 'a' || tag === 'Link' || tag === 'NavLink') kind = 'link';
          else if (tag === 'input') {
            const type = attrText(el, 'type', sf)?.text[0];
            kind = type === 'checkbox' || type === 'radio' ? 'toggle' : type === 'hidden' ? null : type === 'file' ? 'button' : 'input';
          } else if (tag === 'textarea') kind = 'input';
          else if (tag === 'select') kind = 'select';
          else if (tag === 'summary') kind = 'button';
          if (role && ROLE_KIND[role]) kind = ROLE_KIND[role];
          if (role === 'presentation' || role === 'none') kind = null;
          if (kind) {
            const field = kind === 'input' || kind === 'select';
            const placeholder = field ? attrText(el, 'placeholder', sf) : null;
            const name = aria;
            let dynamic = name?.dynamic ?? false;
            let labels = name?.text ?? [];
            if (!labels.length && kind !== 'select' && kind !== 'input') {
              const c = childText(whole, sf);
              if (c.text && c.text !== DYN) {
                labels = [c.text];
                dynamic = c.dynamic;
              }
            }
            if (!labels.length && title) {
              labels = title.text;
              dynamic = title.dynamic;
            }
            // a wrapping <Tooltip label> or <label>text<input/></label>
            if (!labels.length) {
              for (let p: ts.Node | undefined = whole.parent; p && !ts.isSourceFile(p); p = p.parent) {
                if (ts.isJsxElement(p)) {
                  const pt = p.openingElement.tagName.getText(sf);
                  if (pt === 'Tooltip') {
                    const l = attrText(p.openingElement, 'label', sf);
                    if (l) {
                      labels = l.text;
                      dynamic = l.dynamic;
                    }
                    break;
                  }
                  if (pt === 'label') {
                    const c = childText(p, sf);
                    if (c.text) {
                      labels = [c.text];
                      dynamic = c.dynamic;
                    }
                    break;
                  }
                  if (/^[a-z]/.test(pt) && pt !== 'span') break;
                }
              }
            }
            const id = attrText(el, 'id', sf)?.text[0];
            if (!labels.length && field && id) {
              // <label htmlFor=id>
              const m = new RegExp(`htmlFor=["']${id}["'][^>]*>([^<{]+)<`).exec(src);
              if (m) labels = [m[1]];
            }
            if (!labels.length && placeholder) {
              labels = placeholder.text;
              dynamic = placeholder.dynamic;
            }
            if (labels.length && labels.every((l) => norm(l.replace(DYN_RE, '')) === '')) labels = [];
            if (labels.length) {
              const shortcut = attrText(el, 'aria-keyshortcuts', sf)?.text[0];
              push(el, kind, labels, dynamic, { ...(disabledReason ? { no_permission: disabledReason } : {}), ...(shortcut ? { shortcut } : {}) });
            } else dynamicUnnamed.push({ source: loc(el), kind });
          }
        }
      } else if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'confirm' && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
        // confirm({ title, confirmLabel }) — a confirmation dialog and its confirm button (Cancel is ui/ConfirmHost)
        const o = n.arguments[0];
        const get = (k: string) => o.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === k)?.initializer;
        const title = textOf(get('title'), sf);
        const cl = textOf(get('confirmLabel'), sf);
        if (title) push(n, 'dialog', title.text, title.dynamic, { confirm: true }, 'confirm.' + slug(title.text[0].replace(DYN_RE, ' ')));
        if (title && cl) push(n, 'button', cl.text, cl.dynamic, { confirm: true }, 'confirm.' + slug(title.text[0].replace(DYN_RE, ' ')) + '.' + slug(cl.text[0]));
        n.forEachChild(visit);
        return;
      } else if (ts.isObjectLiteralExpression(n)) {
        const props = new Map<string, ts.Expression>();
        for (const p of n.properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) props.set(p.name.text, p.initializer);
        for (const p of n.properties) if ((ts.isMethodDeclaration(p) || ts.isShorthandPropertyAssignment(p)) && p.name && ts.isIdentifier(p.name)) props.set(p.name.text, p as unknown as ts.Expression);
        const idE = props.get('id');
        const id = idE && (ts.isStringLiteral(idE) || ts.isNoSubstitutionTemplateLiteral(idE)) ? idE.text : null;
        const label = textOf(props.get('label') ?? props.get('title'), sf);
        const actionable = ['onSelect', 'run', 'onClick', 'href', 'element'].some((k) => props.has(k));
        if (label && id && !props.has('header')) {
          let kind: Kind = 'menu-item';
          if (rel === 'editor/commands.tsx') kind = 'command';
          else if (rel === 'editor/palette.ts' || props.has('value')) kind = 'option';
          else if (!actionable) kind = 'option';
          const dr = textOf(props.get('disabledReason'), sf)?.text[0];
          const sc = textOf(props.get('shortcut'), sf)?.text[0];
          const hint = textOf(props.get('hint'), sf);
          const extra: Partial<Raw> = { ...(dr ? { no_permission: dr } : {}), ...(sc ? { shortcut: sc } : {}) };
          const kw = textOf(props.get('keywords'), sf)?.text[0];
          if (kind === 'command' && kw) extra.keywords = kw;
          if (kind === 'command' && hint) void hint;
          push(n, kind, label.text, label.dynamic, extra, slug(id));
        } else if (label && props.has('path') && props.has('element')) {
          const p = textOf(props.get('path'), sf);
          const prefix = ROUTE_PREFIX[rel] ?? '/';
          if (p) {
            const path = (prefix + p.text[0]).replace(/\/+/g, '/');
            push(n, 'route', [path], false, { route: path, aliases: label.text }, slug(path));
          }
        } else if (label && !id && actionable && (props.has('run') || props.has('href')) && !props.has('element')) {
          push(n, 'toast-action', label.text, label.dynamic);
        }
      }
      n.forEachChild(visit);
    };
    visit(sf);
  }
  return { raws, dynamicUnnamed };
}

/** Assigns stable ids; colliding keys inside a component are prefixed with their enclosing function/table name. */
function assignIds(raws: Raw[]): Action[] {
  const base = (r: Raw) => `${r.screen}/${r.component}/${r.kind === 'route' ? 'route.' : ''}${r.key}`;
  const counts = new Map<string, number>();
  for (const r of raws) counts.set(base(r), (counts.get(base(r)) ?? 0) + 1);
  const used = new Map<string, number>();
  const out: Action[] = [];
  for (const r of raws) {
    let id = base(r);
    if ((counts.get(id) ?? 0) > 1 && r.group && r.group !== r.component) id = `${r.screen}/${r.component}/${slug(r.group)}.${r.key}`;
    const n = (used.get(id) ?? 0) + 1;
    used.set(id, n);
    if (n > 1) id = `${id}~${n}`;
    const { key: _k, group: _g, ...rest } = r;
    out.push({ id, ...rest, critical: isCritical(r.kind, [r.label, ...(r.aliases ?? [])].join(' '), r.key) });
  }
  return out;
}

export interface RuntimeControl {
  route: string;
  role: string;
  name: string;
}

/** Pattern of a (possibly dynamic) label: each {…} matches anything. */
export function labelPattern(label: string): RegExp {
  const esc = label.split(DYN).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp('^' + esc.join('.*') + '$', 'i');
}

/** Runtime names carry decorations the source label has not: a leading icon glyph and a trailing shortcut hint. */
function runtimeNameVariants(name: string): string[] {
  const out = new Set<string>([name]);
  const noIcon = name.replace(/^[^\p{L}\p{N}«"(]+/u, '').trim();
  out.add(noIcon);
  for (const n of [name, noIcon]) {
    const m = /^(.*\S)\s+((?:Ctrl|Alt|Shift|Cmd|⌘|⌥|⇧)\S*|F\d{1,2}|\S)$/.exec(n);
    if (m) out.add(m[1]);
  }
  return [...out].filter(Boolean);
}

function mergeRuntime(actions: Action[]): { added: number; seenStatic: number; runtimeTotal: number; optionValues: number } {
  if (!existsSync(RUNTIME)) return { added: 0, seenStatic: 0, runtimeTotal: 0, optionValues: 0 };
  const rt = JSON.parse(readFileSync(RUNTIME, 'utf8')) as { controls: RuntimeControl[]; data: string[] };
  const data = new Set(rt.data.map((d) => norm(d).toLowerCase()));
  const patterns = actions.map((a) => ({ a, res: (a.kind === 'route' ? a.aliases ?? [] : [a.label, ...(a.aliases ?? [])]).map(labelPattern) }));
  let added = 0;
  let optionValues = 0;
  const seen = new Set<string>();
  const byId = new Map<string, Action>();
  for (const c of rt.controls) {
    const name = norm(c.name);
    if (!name) continue;
    const variants = runtimeNameVariants(name);
    const hit = patterns.filter((p) => p.res.some((re) => variants.some((v) => re.test(v))));
    if (hit.length) {
      for (const h of hit) {
        h.a.seen = [...new Set([...(h.a.seen ?? []), c.route])].sort();
        seen.add(h.a.id);
      }
      continue;
    }
    // values of a <select> are covered with the select itself
    if (c.role === 'option') {
      optionValues++;
      continue;
    }
    // data rendered as controls (page/space/template titles, user names, dates, counters) is not an action of its own
    const lower = variants[variants.length - 1].toLowerCase();
    if (variants.some((v) => data.has(v.toLowerCase())) || [...data].some((d) => d.length > 3 && lower.includes(d)) || /^\d[\d\s.,:%-]*$/.test(name) || /^[\p{Emoji}\s]+$/u.test(name)) continue;
    const label = variants.length > 1 ? variants[variants.length - 1] : name;
    const id = `runtime/${c.role}/${slug(label)}`;
    const prev = byId.get(id);
    if (prev) {
      prev.seen = [...new Set([...(prev.seen ?? []), c.route])].sort();
      continue;
    }
    const a: Action = { id, kind: 'runtime', screen: 'runtime', component: c.role, label, ...(label !== name ? { aliases: [name] } : {}), source: `runtime ${c.role}`, critical: isCritical(c.role === 'textbox' || c.role === 'spinbutton' || c.role === 'combobox' ? 'input' : c.role === 'switch' || c.role === 'checkbox' ? 'toggle' : 'button', label, ''), seen: [c.route] };
    byId.set(id, a);
    actions.push(a);
    added++;
  }
  return { added, seenStatic: seen.size, runtimeTotal: rt.controls.length, optionValues };
}

export function buildInventory() {
  const { raws, dynamicUnnamed } = scanSource();
  const actions = assignIds(raws);
  const rt = mergeRuntime(actions);
  const byKind: Record<string, number> = {};
  const byScreen: Record<string, number> = {};
  for (const a of actions) {
    byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
    byScreen[a.screen] = (byScreen[a.screen] ?? 0) + 1;
  }
  return {
    generated_by: 'node --import tsx scripts/qa/inventory.ts (do not edit by hand)',
    summary: {
      total: actions.length,
      critical: actions.filter((a) => a.critical).length,
      by_kind: Object.fromEntries(Object.entries(byKind).sort()),
      by_screen: Object.fromEntries(Object.entries(byScreen).sort()),
      runtime: { controls_recorded: rt.runtimeTotal, static_actions_seen: rt.seenStatic, runtime_only_added: rt.added, select_option_values_skipped: rt.optionValues },
      dynamic_unnamed: dynamicUnnamed.length,
    },
    dynamic_unnamed: dynamicUnnamed.map((d) => `${d.kind} ${d.source}`),
    actions,
  };
}

export function loadInventory(): { actions: Action[] } {
  return YAML.parse(readFileSync(INVENTORY, 'utf8'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inv = buildInventory();
  const text = '# Action inventory (QA26-01, QA26-04). Generated from apps/web/src and docs/qa/runtime-controls.json.\n' + YAML.stringify(inv, { lineWidth: 0 });
  if (process.argv.includes('--check')) {
    const cur = existsSync(INVENTORY) ? readFileSync(INVENTORY, 'utf8') : '';
    if (cur !== text) {
      console.error('docs/qa/action-inventory.yaml is stale: run `npm run qa:inventory`');
      process.exit(1);
    }
    console.log('inventory up to date:', inv.summary.total, 'actions');
  } else {
    mkdirSync(dirname(INVENTORY), { recursive: true });
    writeFileSync(INVENTORY, text);
    console.log('actions:', inv.summary.total, 'critical:', inv.summary.critical, JSON.stringify(inv.summary.by_kind), 'dynamic unnamed:', inv.summary.dynamic_unnamed);
  }
}
