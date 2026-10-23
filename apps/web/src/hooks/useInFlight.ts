import { useCallback, useRef } from 'react';

/**
 * Runs an async submit at most once at a time (QA-A1). A button disabled by react-query's `isPending` stays enabled
 * until the observer notifies React (the next macrotask), so two activations within one frame — a fast double click,
 * Enter pressed twice — both start the operation; a ref closes that gap synchronously.
 *
 *   const once = useInFlight();
 *   <button onClick={() => once(() => m.mutateAsync())}>
 *
 * Rejections are swallowed here: the mutation's own onError reports them.
 */
export function useInFlight() {
  const flying = useRef(false);
  return useCallback((run: () => Promise<unknown>) => {
    if (flying.current) return;
    flying.current = true;
    let p: Promise<unknown>;
    try {
      p = run();
    } catch {
      flying.current = false;
      return;
    }
    void p.catch(() => undefined).finally(() => (flying.current = false));
  }, []);
}
