/**
 * Index of automated tests for the action matrix: every `test(…)` / `it(…)` in tests/** with its stable key
 * (`<file> › [describe ›] <title>`), the locator references it makes (accessible names, labels, texts, typed slash
 * commands, visited URLs — also through helper functions it calls) and the state dimensions it exercises.
 */
import ts from 'typescript';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ROOT, walk } from './inventory';

export type RefKind = 'name' | 'typed' | 'url';
export interface Ref {
  kind: RefKind;
  /** string value, or regex source when `regex` is set */
  value: string;
  regex?: string;
  exact?: boolean;
  /** ARIA role of the getByRole() call the name belongs to */
  role?: string;
  /** made inside a helper function rather than in the test body itself */
  helper?: boolean;
}
export interface TestCase {
  key: string;
  file: string;
  suite: 'unit' | 'integration' | 'resilience' | 'e2e';
  describe: string[];
  title: string;
  line: number;
  refs: Ref[];
  states: string[];
  inputs: string[];
  /** test uses a second, less privileged account */
  otherUser: boolean;
  /** the test body is a template (loop/parametrised): its key may stand for several executed tests */
  parametrised: boolean;
}

const LOCATOR_FNS = new Set(['getByLabel', 'getByText', 'getByTitle', 'getByPlaceholder', 'getByAltText', 'getByTestId']);
const TYPE_FNS = new Set(['type', 'fill', 'pressSequentially', 'insertText']);
const URL_FNS = new Set(['goto', 'waitForURL', 'toHaveURL']);

/** Placeholder for `${…}` parts of template literals in references. */
const SUB = '…';

function lit(e: ts.Expression): { value: string; regex?: string; template?: boolean } | null {
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { value: e.text };
  if (ts.isTemplateExpression(e)) {
    let s = e.head.text;
    for (const sp of e.templateSpans) s += SUB + sp.literal.text;
    return { value: s, template: true };
  }
  if (ts.isRegularExpressionLiteral(e)) {
    const m = /^\/(.*)\/([a-z]*)$/s.exec(e.text);
    if (m) return { value: m[1], regex: m[1] + '\u0000' + m[2] };
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = lit(e.left);
    const b = lit(e.right);
    return { value: (a?.value ?? SUB) + (b?.value ?? SUB), template: true };
  }
  return null;
}

const SELECTOR_RE = /\[(?:aria-label|title|placeholder)\*?=["']([^"']+)["']\]|:has-text\(["']([^"']+)["']\)|^text=["']?([^"']+)["']?$/g;

interface FileInfo {
  sf: ts.SourceFile;
  functions: Map<string, ts.Node>;
  imports: Map<string, string>;
}
const files = new Map<string, FileInfo | null>();

function fileInfo(path: string): FileInfo | null {
  if (files.has(path)) return files.get(path)!;
  if (!existsSync(path)) {
    files.set(path, null);
    return null;
  }
  const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = new Map<string, ts.Node>();
  const imports = new Map<string, string>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) functions.set(st.name.text, st);
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) functions.set(d.name.text, d.initializer);
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text.startsWith('.') && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      const target = resolve(dirname(path), st.moduleSpecifier.text.replace(/\.js$/, '')) + '.ts';
      for (const el of st.importClause.namedBindings.elements) imports.set(el.name.text, target);
    }
  }
  const info = { sf, functions, imports };
  files.set(path, info);
  return info;
}

/** Collects references from a node, following calls of helper functions defined in the same or imported test modules. */
function collect(node: ts.Node, info: FileInfo, refs: Ref[], text: string[], visited: Set<ts.Node>, depth = 0) {
  if (visited.has(node) || depth > 4) return;
  visited.add(node);
  const start = refs.length;
  try {
    collectInner(node, info, refs, text, visited, depth);
  } finally {
    if (depth > 0) for (let i = start; i < refs.length; i++) refs[i].helper = true;
  }
}

function collectInner(node: ts.Node, info: FileInfo, refs: Ref[], text: string[], visited: Set<ts.Node>, depth: number) {
  text.push(node.getText(info.sf));
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const fn = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
      if (fn === 'getByRole' && n.arguments.length) {
        const role = lit(n.arguments[0])?.value;
        const opts = n.arguments[1];
        if (opts && ts.isObjectLiteralExpression(opts)) {
          let exact = false;
          let name: ReturnType<typeof lit> = null;
          for (const p of opts.properties) {
            if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
            if (p.name.text === 'exact' && p.initializer.kind === ts.SyntaxKind.TrueKeyword) exact = true;
            if (p.name.text === 'name') name = lit(p.initializer);
          }
          if (name) refs.push({ kind: 'name', value: name.value, ...(name.regex ? { regex: name.regex } : {}), exact, role });
        } else if (role === 'dialog' || role === 'menu') refs.push({ kind: 'name', value: '', role });
      } else if (LOCATOR_FNS.has(fn) && n.arguments.length) {
        const l = lit(n.arguments[0]);
        const opts = n.arguments[1];
        const exact = !!opts && ts.isObjectLiteralExpression(opts) && opts.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText(info.sf) === 'exact' && p.initializer.kind === ts.SyntaxKind.TrueKeyword);
        if (l) refs.push({ kind: 'name', value: l.value, ...(l.regex ? { regex: l.regex } : {}), exact });
      } else if (TYPE_FNS.has(fn) && n.arguments.length) {
        const l = lit(n.arguments[fn === 'fill' && n.arguments.length > 1 ? 1 : 0]);
        if (l && !l.regex) refs.push({ kind: 'typed', value: l.value });
      } else if (URL_FNS.has(fn) && n.arguments.length) {
        const l = lit(n.arguments[0]);
        if (l) refs.push({ kind: 'url', value: l.value, ...(l.regex ? { regex: l.regex } : {}) });
      } else if ((fn === 'locator' || fn === 'filter') && n.arguments.length) {
        const l = lit(n.arguments[0]);
        if (l && !l.regex) for (const m of l.value.matchAll(SELECTOR_RE)) refs.push({ kind: 'name', value: m[1] ?? m[2] ?? m[3], exact: !!m[1] });
      }
      // helper functions: same module or imported from another test module
      if (ts.isIdentifier(callee) && (info.functions.has(callee.text) || info.imports.has(callee.text))) {
        // literal arguments of a helper call name what the helper acts on, e.g. slash(page, 'цитата', 'Цитата')
        for (const a of n.arguments) {
          const l = lit(a);
          if (l && !l.regex && l.value.trim()) refs.push({ kind: 'name', value: l.value, exact: true });
        }
      }
      if (ts.isIdentifier(callee)) {
        const local = info.functions.get(callee.text);
        if (local) collect(local, info, refs, text, visited, depth + 1);
        else {
          const target = info.imports.get(callee.text);
          const ti = target ? fileInfo(target) : null;
          const f = ti?.functions.get(callee.text);
          if (ti && f) collect(f, ti, refs, text, visited, depth + 1);
        }
      }
    }
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'hasText') {
      const l = lit(n.initializer);
      if (l) refs.push({ kind: 'name', value: l.value, ...(l.regex ? { regex: l.regex } : {}) });
    }
    // identifiers referring to module-level helper arrow functions passed around (e.g. `header(page)`) are calls; plain
    // references to helper functions (callbacks) are followed too
    if (ts.isIdentifier(n) && !ts.isCallExpression(n.parent) && info.functions.has(n.text) && n.parent && !ts.isFunctionDeclaration(n.parent) && !ts.isVariableDeclaration(n.parent)) collect(info.functions.get(n.text)!, info, refs, text, visited, depth + 1);
    n.forEachChild(visit);
  };
  node.forEachChild(visit);
}

/** State dimensions a test exercises, inferred from its title and body (documented heuristics, see docs/qa/README.md). */
export const STATE_RULES: Array<[string, RegExp, RegExp | null]> = [
  ['empty', /пуст|empty|без страниц|нет результат|ничего не найдено|с нуля/i, /\bempty\b/i],
  ['loading', /медленн|slow|loading|загрузк[аи] |задержк|delay|спиннер|spinner|скелет|skeleton|долг/i, /route\([^)]*\)[\s\S]{0,400}?(setTimeout|waitForTimeout\(\d{3,}|delay)/],
  ['cancel', /отмен|cancel|esc\b|escape|закрыва|dismiss|без сохранения/i, /press\(['"]Escape['"]\)|name: ['"]Отмена['"]/],
  ['error', /ошибк|error|сбой|fail|недоступ|5\d\d\b|отказ|невер/i, /route\.abort\(|status: 5\d\d|fulfill\(\{[^}]*status: [45]\d\d/],
  ['offline', /офлайн|offline|без сети|нет сети|обрыв|потер[яи] (сети|связи)/i, /setOffline\(true\)/],
  ['no-permission', /прав[аоу]?\b|без прав|permission|viewer|read-?only|только чтени|403|запрещ|гост|guest|нет доступа|читател/i, null],
  ['double-click', /двойн|double|дважды|повторн[а-я]* (клик|нажат)|idempot/i, /dblclick\(|clickCount: 2/],
  ['conflict', /конфликт|conflict|одновремен|concurrent/i, null],
  ['undo', /undo|ctrl\+z|отмена действия|откат/i, /(Control|Meta|ControlOrMeta)\+z['"]/i],
];

function inputsOf(body: string): string[] {
  const out: string[] = [];
  if (/\.click\(|\.hover\(|mouse\./.test(body)) out.push('mouse');
  if (/keyboard\.|\.press\(/.test(body)) out.push('keyboard');
  if (/\.tap\(|touchscreen/.test(body)) out.push('touch');
  return out;
}

const SUITES: Array<['unit' | 'integration' | 'resilience' | 'e2e', string]> = [
  ['unit', 'tests/unit'],
  ['integration', 'tests/integration'],
  ['resilience', 'tests/resilience'],
  ['e2e', 'tests/e2e'],
];

export function indexTests(): TestCase[] {
  const out: TestCase[] = [];
  for (const [suite, dir] of SUITES) {
    for (const path of walk(join(ROOT, dir), ['.test.ts', '.spec.ts'])) {
      const info = fileInfo(path)!;
      const file = relative(ROOT, path).replace(/\\/g, '/');
      const visit = (n: ts.Node, describe: string[], inLoop: boolean) => {
        if (ts.isCallExpression(n)) {
          const c = n.expression;
          const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.getText(info.sf) : ts.isCallExpression(c) && ts.isPropertyAccessExpression(c.expression) ? c.expression.getText(info.sf) : '';
          const base = name.split('.')[0];
          const mod = name.split('.').slice(1).join('.');
          const t = n.arguments[0] ? lit(n.arguments[0]) : null;
          const body = n.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
          if ((base === 'describe' || (base === 'test' && mod.startsWith('describe'))) && t && body && !mod.includes('configure')) {
            body.forEachChild((ch) => visit(ch, [...describe, t.value], inLoop));
            return;
          }
          if ((base === 'test' || base === 'it') && t && body && !/^(describe|beforeAll|beforeEach|afterAll|afterEach|use|step|setTimeout|slow$|info|extend)/.test(mod)) {
            const refs: Ref[] = [];
            const text: string[] = [];
            collect(body, info, refs, text, new Set());
            const title = t.value;
            const bodyText = text.join('\n');
            const head = [...describe, title].join(' ');
            const states = ['success'];
            for (const [st, titleRe, bodyRe] of STATE_RULES) if (titleRe.test(head) || (bodyRe && bodyRe.test(bodyText))) states.push(st);
            out.push({
              key: `${file} › ${[...describe, title].join(' › ')}`,
              file,
              suite,
              describe,
              title,
              line: info.sf.getLineAndCharacterOfPosition(n.getStart(info.sf)).line + 1,
              refs,
              states,
              inputs: inputsOf(bodyText),
              otherUser: /createUser\(|login_\(|newContext\(|browser\.newPage/.test(bodyText),
              parametrised: inLoop || !!t.template || /\.each\b/.test(name),
            });
            return;
          }
        }
        const loop = inLoop || ts.isForOfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n) || (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^(forEach|map)$/.test(n.expression.name.text));
        n.forEachChild((ch) => visit(ch, describe, loop));
      };
      info.sf.forEachChild((ch) => visit(ch, [], false));
    }
  }
  return out;
}
