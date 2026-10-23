/**
 * Extension points of the paste pipeline (R-IMPORT-021). The conversion itself is shared with the server import
 * (packages/shared/src/editor/ingest.ts); what needs the network is delegated here so it can evolve on its own:
 *  - pictures of other sites found in pasted content (http/https, not this instance) are copied to the server
 *    (default: clipboard/remoteImages.ts copyRemoteImages, the SSRF-guarded `from-url` endpoint, D-25/D-32, SEC-L1).
 * A module that takes over this job (e.g. a dedicated copy service) registers itself with setRemoteImagesHook.
 */
import type { Editor } from '@tiptap/core';
import { copyRemoteImages } from './remoteImages';

export type RemoteImagesHook = (editor: Editor, srcs: string[], pageId: string) => void | Promise<void>;

// SEC-L1: with progress/failure shown in place and the CSP blocking hot-links (clipboard/remoteImages.ts).
let remoteImagesHook: RemoteImagesHook = copyRemoteImages;

export function setRemoteImagesHook(fn: RemoteImagesHook) {
  remoteImagesHook = fn;
}

/** Called by the paste pipeline after the content is in the document (outside the paste's Undo step). */
export function handleRemoteImages(editor: Editor, srcs: string[], pageId: string) {
  if (!srcs.length) return;
  void Promise.resolve(remoteImagesHook(editor, srcs, pageId)).catch(() => undefined);
}
