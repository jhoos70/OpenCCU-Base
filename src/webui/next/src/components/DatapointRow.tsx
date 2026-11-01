import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { describeChangeError, isSessionExpired, setValue, type Datapoint } from "@/lib/api";
import { STRING_MAX, controlOf, formatDatapoint, initialInput, isChanged, listEntries, neverReported, numberRange, rangeHint, toRequestValue, validateInput } from "@/lib/datapoints";
import { useI18n } from "@/lib/i18n";

/** A command is answered when the CCU has passed it on; the device confirms later, so the values are read again. */
const REREAD_MS = 3_000;

function Field({ dp, busy, onSubmit, onCancel }: { dp: Datapoint; busy: boolean; onSubmit: (value: string) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [input, setInput] = React.useState(() => initialInput(dp));
  const problem = input === "" ? null : validateInput(dp, input);
  const ready = input !== "" && !problem && isChanged(dp, input);
  const hint = dp.type === "NUMBER" ? rangeHint(dp, t) : "";
  const { min, max } = numberRange(dp);
  const id = `dp-${dp.id}`;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => (e.preventDefault(), ready && !busy && onSubmit(toRequestValue(dp, input)))}
      onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onCancel())}
    >
      {dp.type === "LIST" ? (
        <select
          id={id}
          autoFocus
          aria-label={dp.param}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-sm"
        >
          {input === "" && <option value="" />}
          {listEntries(dp).map((label, i) => (
            <option key={i} value={String(i)}>
              {label || String(i)}
            </option>
          ))}
        </select>
      ) : dp.type === "NUMBER" ? (
        <Input
          id={id}
          autoFocus
          aria-label={dp.param}
          aria-describedby={hint ? `${id}-hint` : undefined}
          type="number"
          step={dp.integer ? 1 : "any"}
          min={min ?? undefined}
          max={max ?? undefined}
          inputMode="decimal"
          className="h-9 w-28"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      ) : (
        <Input id={id} autoFocus aria-label={dp.param} type="text" maxLength={STRING_MAX} className="h-9 w-48" value={input} onChange={(e) => setInput(e.target.value)} />
      )}
      {dp.unit && dp.type === "NUMBER" && <span className="text-sm text-[var(--muted-foreground)]">{dp.unit}</span>}
      <Button type="submit" className="h-9 px-3" disabled={busy || !ready}>
        {busy ? t("saving") : t("ok")}
      </Button>
      <Button type="button" variant="outline" className="h-9 px-3" onClick={onCancel} disabled={busy}>
        {t("cancel")}
      </Button>
      {hint && (
        <span id={`${id}-hint`} className="basis-full text-xs text-[var(--muted-foreground)]">
          {hint}
        </span>
      )}
      {problem && (
        <span role="alert" className="basis-full text-sm text-[var(--destructive)]">
          {t(problem.key, problem.params)}
        </span>
      )}
    </form>
  );
}


export interface DatapointOps {
  editing: string | null;
  setEditing: (id: string | null) => void;
  busy: boolean;
  notice: { ok: boolean; text: string } | null;
  send: (dp: Datapoint, value: string | boolean) => Promise<void>;
  closeEditor: (id: string) => void;
}

/** What operating datapoints needs: one command at a time, the answer to show, the editor that is open and the re-read. */
export function useDatapointOps(sid: string, refresh: () => void, onExpired: () => void): DatapointOps {
  const { t } = useI18n();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const closeEditor = React.useCallback((id: string) => {
    setEditing(null);
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-change="${id}"]`)?.focus(), 0);
  }, []);

  const send = async (dp: Datapoint, value: string | boolean) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await setValue(sid, dp.id, value);
      setNotice({ ok: true, text: t("valueSent", { name: dp.param }) });
      if (editing === dp.id) closeEditor(dp.id);
      refresh();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(refresh, REREAD_MS);
    } catch (e) {
      if (isSessionExpired(e)) return onExpired();
      setNotice({ ok: false, text: `${dp.param}: ${describeChangeError(e, t)}` });
    } finally {
      setBusy(false);
    }
  };
  return { editing, setEditing, busy, notice, send, closeEditor };
}

/** The answer to the last command: sent (polite) or the reason it failed (alert). */
export function OpsNotice({ notice }: { notice: DatapointOps["notice"] }) {
  return (
    <>
      <div aria-live="polite" className="min-h-5 text-sm">
        {notice?.ok && <span>{notice.text}</span>}
      </div>
      {notice && !notice.ok && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {notice.text}
        </p>
      )}
    </>
  );
}

/** One datapoint as a table row: the parameter, the value and (for a user) the control. */
export function DatapointRow({ dp, mayChange, ops }: { dp: Datapoint; mayChange: boolean; ops: DatapointOps }) {
  const { t, lang } = useI18n();
  const { busy, editing, setEditing, send, closeEditor } = ops;
  const control = mayChange ? controlOf(dp) : "none";
  const shown = formatDatapoint(dp, t, lang);
  return (
    <TableRow>
      <TableCell className="text-xs">{dp.param}</TableCell>
      <TableCell>
        {shown !== "" ? shown : dp.type === "ACTION" ? "" : <span className="text-[var(--muted-foreground)]" title={t("noValueYet")}>–</span>}
        {dp.type !== "ACTION" && neverReported(dp) && <span className="sr-only">{t("noValueYet")}</span>}
      </TableCell>
      {mayChange && (
        <TableCell>
          {control === "toggle" && (
            <div className="flex gap-2">
              <Button variant="outline" className="h-8 px-3" aria-pressed={dp.value === "true" && !neverReported(dp)} aria-label={t("setYes", { name: dp.param })} disabled={busy} onClick={() => void send(dp, true)}>
                {t("yes")}
              </Button>
              <Button variant="outline" className="h-8 px-3" aria-pressed={dp.value === "false" && !neverReported(dp)} aria-label={t("setNo", { name: dp.param })} disabled={busy} onClick={() => void send(dp, false)}>
                {t("no")}
              </Button>
            </div>
          )}
          {control === "button" && (
            <Button variant="outline" className="h-8 px-3" aria-label={t("sendCommand", { name: dp.param })} disabled={busy} onClick={() => void send(dp, true)}>
              {t("send")}
            </Button>
          )}
          {control === "field" &&
            (editing === dp.id ? (
              <Field key={dp.id} dp={dp} busy={busy} onSubmit={(v) => void send(dp, v)} onCancel={() => closeEditor(dp.id)} />
            ) : (
              <Button variant="outline" className="h-8 px-3" data-change={dp.id} aria-label={t("changeValue", { name: dp.param })} disabled={busy} onClick={() => setEditing(dp.id)}>
                {t("change")}
              </Button>
            ))}
        </TableCell>
      )}
    </TableRow>
  );
}
