// SAST rule set (R-SECURITY-004). Used by eslint.config.js (so `npm run lint` enforces it) and by
// scripts/security/sast.mjs (`npm run security:sast`, report in test-results/security/sast-report.json).
//
// Every exemption below names the reviewed reason. A new finding must be fixed or justified inline with
// `// eslint-disable-next-line <rule> -- <reason>`; the gate fails on any unjustified one.

/** Code that is shipped (server, web client, shared library). Tests and dev scripts are out of scope. */
export const PRODUCTION_SOURCES = ['apps/server/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}', 'packages/shared/src/**/*.{ts,tsx}'];

export const SAST_RULE_PREFIXES = ['security/', 'no-unsanitized/', 'no-eval', 'no-implied-eval', 'no-new-func', 'no-restricted-syntax', 'no-script-url'];

export const sastRules = {
  // eslint-plugin-security (recommended set, as errors)
  'security/detect-buffer-noassert': 'error',
  'security/detect-child-process': 'error',
  'security/detect-disable-mustache-escape': 'error',
  'security/detect-eval-with-expression': 'error',
  'security/detect-new-buffer': 'error',
  'security/detect-no-csrf-before-method-override': 'error',
  'security/detect-non-literal-fs-filename': 'error',
  'security/detect-non-literal-regexp': 'error',
  'security/detect-non-literal-require': 'error',
  'security/detect-possible-timing-attacks': 'error',
  'security/detect-pseudoRandomBytes': 'error',
  'security/detect-unsafe-regex': 'error',
  'security/detect-bidi-characters': 'error',
  // Off: ~250 hits, all on typed keys/indices (TS-checked unions, array indices, Map-like records). Prototype
  // pollution through request bodies is blocked by Fastify's secure-json-parse (`__proto__`/`constructor` → 400),
  // which the DAST suite verifies (tests/integration/security-dast.test.ts).
  'security/detect-object-injection': 'off',
  // DOM XSS sinks
  'no-unsanitized/method': 'error',
  'no-unsanitized/property': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-restricted-syntax': [
    'error',
    { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Raw HTML in React: sanitise with DOMPurify and add the file to the reviewed list in scripts/security/sast-rules.js.' },
  ],
};

export const sastExemptions = [
  {
    // Reviewed raw-HTML renderers: KaTeX output with trust=false (math preview), Mermaid SVG rendered with
    // securityLevel 'strict', DOMPurify-sanitised static document preview.
    files: ['apps/web/src/editor/Editor.tsx', 'apps/web/src/editor/nodeviews/blocks.tsx', 'apps/web/src/editor/nodeviews/DocPreviewInline.tsx'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // File system paths are never taken from requests here: storage drivers build paths from content-addressed keys
    // (FsBlobStore.path rejects `..` and absolute keys), the rest uses server-generated temp names (randomUUID),
    // mkdtemp directories, the bundled migrations directory or configuration (WEB_DIST, KB_DATA_DIR, OCR cache).
    files: [
      'apps/server/src/storage/blob-store.ts',
      'apps/server/src/storage/s3-store.ts',
      'apps/server/src/db/migrate.ts',
      'apps/server/src/ocr/ocr.ts',
      'apps/server/src/app.ts',
      'apps/server/src/routes/archives.ts',
      'apps/server/src/routes/attachments.ts',
      'apps/server/src/routes/import-export.ts',
      'apps/server/src/services/attachments.ts',
      'apps/server/src/services/importer.ts',
      // streams server-generated temp files (upload/import temp names) to clamd
      'apps/server/src/services/antivirus.ts',
    ],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
  {
    // Flagged by the star-height heuristic, measured linear on 50 000-character adversarial inputs (nested
    // quantifiers are bounded or over disjoint character classes): Excel number/date/range parsers, file
    // extension suffixes, internal-link and inline-tag patterns, relative asset paths, page-link picker.
    files: [
      'apps/server/src/convert/tabular.ts',
      'apps/server/src/services/archive.ts',
      'apps/server/src/services/exporter.ts',
      'packages/shared/src/editor/migrations.ts',
      'apps/web/src/editor/PagePicker.tsx',
    ],
    rules: { 'security/detect-unsafe-regex': 'off' },
  },
  {
    // KNOWN OPEN (low, client-only): tableOps NUM is quadratic on a cell of ~50k spaces followed by a letter
    // (≈2.5 s freeze in the author's own tab, nothing reaches the server). Owned by the editor work stream;
    // listed in docs/SECURITY.md «Известные ограничения».
    files: ['apps/web/src/editor/tableOps.ts'],
    rules: { 'security/detect-unsafe-regex': 'off' },
  },
  {
    // archive.ts compares SHA-256 checksums of archive entries (integrity, not a secret).
    files: ['apps/server/src/services/archive.ts'],
    rules: { 'security/detect-possible-timing-attacks': 'off' },
  },
];
