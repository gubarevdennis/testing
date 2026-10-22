import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { createSchemaExtensions } from './extensions.js';

let cached: Schema | null = null;

export function getKbSchema(): Schema {
  if (!cached) cached = getSchema(createSchemaExtensions());
  return cached;
}
