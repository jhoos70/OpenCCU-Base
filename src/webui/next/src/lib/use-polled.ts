import * as React from "react";
import { isSessionExpired } from "./api";

export interface Polled<T> {
  data: T | null;
  /** Loads now (after a change), without waiting for the next round. */
  refresh: () => void;
  /** The last error of an update (kept until an update works again); the data stays the last known. */
  error: unknown;
  loaded: boolean;
}

/**
 * Loads now and then every `ms` milliseconds; stops while the tab is hidden and loads at once when it is visible again.
 * An expired session calls onExpired. `load` must be stable (useCallback).
 */
export function usePolled<T>(load: () => Promise<T>, ms: number, onExpired: () => void): Polled<T> {
  const [state, setState] = React.useState<Omit<Polled<T>, "refresh">>({ data: null, error: null, loaded: false });
  const tickRef = React.useRef<() => void>(() => {});
  const refresh = React.useCallback(() => tickRef.current(), []);
  React.useEffect(() => {
    let live = true;
    let busy = false;
    async function tick() {
      if (busy || !live) return;
      busy = true;
      try {
        const data = await load();
        if (live) setState({ data, error: null, loaded: true });
      } catch (e) {
        if (!live) return;
        if (isSessionExpired(e)) return onExpired();
        setState((s) => ({ ...s, error: e, loaded: true }));
      } finally {
        busy = false;
      }
    }
    tickRef.current = () => void tick();
    const visible = () => document.visibilityState === "visible";
    void tick();
    const timer = window.setInterval(() => visible() && void tick(), ms);
    const onVisible = () => visible() && void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, ms, onExpired]);
  return { ...state, refresh };
}
