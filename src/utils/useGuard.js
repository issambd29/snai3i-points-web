import { useCallback, useRef, useState } from 'react';

/**
 * Stops an action from running twice at the same time (double click, Enter + click...).
 * A second request for the same create/delete used to fail on the server and show a
 * false "failed" alert next to the real "success" one.
 *
 *   const [guard, busy] = useGuard();
 *   const save = guard(async () => { ... });      // ignored while a save is running
 *   <button disabled={busy}>Save</button>
 */
export const useGuard = () => {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);

  const guard = useCallback(
    (fn) =>
      async (...args) => {
        if (locked.current) return undefined;
        locked.current = true;
        setBusy(true);
        try {
          return await fn(...args);
        } finally {
          locked.current = false;
          setBusy(false);
        }
      },
    []
  );

  return [guard, busy];
};
