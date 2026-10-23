import { CONTENT_SCHEMA_VERSION, SCHEMA_MIGRATIONS, type SchemaMigration } from '@kb/shared';

/**
 * The document schema version this server writes and the migrations that bring older documents to it
 * (packages/shared/src/editor/migrations.ts). Kept behind a function so integration tests can simulate a schema
 * change (a future release) without changing the shipped schema.
 */
let registry: { version: number; migrations: SchemaMigration[] } = { version: CONTENT_SCHEMA_VERSION, migrations: SCHEMA_MIGRATIONS };

export function schemaRegistry() {
  return registry;
}

/** Test hook: pretend this server is a release with another schema version. Returns a restore function. */
export function overrideSchemaRegistry(r: { version: number; migrations: SchemaMigration[] }): () => void {
  const prev = registry;
  registry = r;
  return () => {
    registry = prev;
  };
}
