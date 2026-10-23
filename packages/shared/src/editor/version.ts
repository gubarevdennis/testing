/**
 * Version of the canonical document schema. Bump together with a migration in packages/shared/src/editor/migrations.ts
 * (SCHEMA_MIGRATIONS). Kept in its own tiny module so the collaboration client can declare it without loading the editor.
 *
 * History: 1 — initial schema; 2 — footnotes (`footnote`) and inline images (`inlineImage`), D-36; 3 — whiteboard
 * («Доска», `whiteboard`), D-46.
 */
export const CONTENT_SCHEMA_VERSION = 3;
