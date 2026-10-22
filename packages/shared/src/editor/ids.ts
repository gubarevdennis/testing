export function newId(): string {
  // crypto.randomUUID is available in Node >= 19 and all supported browsers.
  return globalThis.crypto.randomUUID();
}
