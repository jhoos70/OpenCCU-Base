import * as React from "react";
import { describeChangeError, isSessionExpired, setValue, type Datapoint } from "./api";
import type { Translate } from "./i18n";
import { matches } from "./widgets";

/** A device that does not confirm within this time is reported, not waited for. */
export const CONFIRM_MS = 30_000;
const REREAD_MS = 3_000;
const OK_SHOWN_MS = 3_500;

export type CommandState =
  | { phase: "idle" }
  | { phase: "sending"; what: string }
  | { phase: "ok"; what: string; at: Date; confirmed: boolean }
  | { phase: "noconfirm"; what: string }
  | { phase: "error"; text: string };

interface Waiting {
  what: string;
  expect: { id: string; value: string | boolean };
  at: number;
}

/**
 * Sends the commands of a tile and says what is going on: sending (until the CCU holds the value that was sent),
 * confirmed, no confirmation after 30 s (with a retry), or refused. `dps` are the tile's datapoints as the CCU holds them
 * now; `refresh` reads them again, which this does every few seconds while a command waits. A command with nothing to
 * compare (a button) is only "sent".
 */
export function useCommand(sid: string, dps: Datapoint[], refresh: () => void, onExpired: () => void, t: Translate) {
  const [state, setState] = React.useState<CommandState>({ phase: "idle" });
  const waiting = React.useRef<Waiting | null>(null);
  const again = React.useRef<(() => void) | null>(null);
  const okTimer = React.useRef<number | undefined>(undefined);

  const show = React.useCallback((s: CommandState) => {
    waiting.current = null;
    window.clearTimeout(okTimer.current);
    setState(s);
    if (s.phase === "ok") okTimer.current = window.setTimeout(() => setState((cur) => (cur === s ? { phase: "idle" } : cur)), OK_SHOWN_MS);
  }, []);
  React.useEffect(() => () => window.clearTimeout(okTimer.current), []);

  // the CCU holds what was sent: confirmed
  React.useEffect(() => {
    const w = waiting.current;
    if (!w || state.phase !== "sending") return;
    if (matches(dps.find((d) => d.id === w.expect.id), w.expect.value)) show({ phase: "ok", what: w.what, at: new Date(), confirmed: true });
  }, [dps, state.phase, show]);

  // while it waits: read again, and give up after 30 s
  React.useEffect(() => {
    if (state.phase !== "sending") return;
    const timer = window.setInterval(() => {
      const w = waiting.current;
      if (!w) return;
      if (Date.now() - w.at >= CONFIRM_MS) return show({ phase: "noconfirm", what: w.what });
      refresh();
    }, REREAD_MS);
    return () => window.clearInterval(timer);
  }, [state.phase, refresh, show]);

  const run = React.useCallback(
    async (dp: Datapoint, value: string | boolean, what: string, expect?: { dp: Datapoint; value: string | boolean }) => {
      again.current = () => void run(dp, value, what, expect);
      window.clearTimeout(okTimer.current);
      setState({ phase: "sending", what });
      try {
        await setValue(sid, dp.id, value);
      } catch (e) {
        if (isSessionExpired(e)) return onExpired();
        return show({ phase: "error", text: describeChangeError(e, t) });
      }
      if (!expect) return show({ phase: "ok", what, at: new Date(), confirmed: false });
      waiting.current = { what, expect: { id: expect.dp.id, value: expect.value }, at: Date.now() };
      refresh();
    },
    [sid, onExpired, refresh, show, t],
  );
  const retry = React.useCallback(() => again.current?.(), []);
  return { state, run, retry };
}
