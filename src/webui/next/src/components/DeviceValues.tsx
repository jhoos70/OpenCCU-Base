import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeChangeError, describeError, getValues, isSessionExpired, setValue, type Datapoint } from "@/lib/api";
import { STRING_MAX, byChannel, controlOf, formatDatapoint, initialInput, isChanged, listEntries, neverReported, numberRange, rangeHint, toRequestValue, validateInput } from "@/lib/datapoints";
import { useI18n } from "@/lib/i18n";
import { usePolled } from "@/lib/use-polled";

/** A command is answered when the CCU has passed it on; the device confirms later, so the values are read again. */
const POLL_MS = 10_000;
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

/** The live values of one device, channel by channel, and (for a user) the controls: yes/no buttons, a button, or a field with OK. */
export function DeviceValues({ deviceId, sid, mayChange, onExpired }: { deviceId: string; sid: string; mayChange: boolean; onExpired: () => void }) {
  const { t, lang } = useI18n();
  const load = React.useCallback(() => getValues(sid, deviceId), [sid, deviceId]);
  const { data, error, loaded, refresh } = usePolled(load, POLL_MS, onExpired);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ ok: boolean; text: string } | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const closeEditor = (id: string) => {
    setEditing(null);
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-change="${id}"]`)?.focus(), 0);
  };

  async function send(dp: Datapoint, value: string | boolean) {
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
  }

  if (!loaded) return <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>;
  if (!data) {
    return (
      <p role="alert" className="text-sm text-[var(--destructive)]">
        {error ? describeChangeError(error, t) : t("noValues")}
      </p>
    );
  }
  if (data.length === 0) return <p className="text-sm text-[var(--muted-foreground)]">{t("noValues")}</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{t("valuesTitle")}</h4>
        <Button variant="outline" className="h-8 px-3" onClick={refresh}>
          {t("refresh")}
        </Button>
      </div>
      {Boolean(error) && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {describeError(error, t)}
        </p>
      )}
      <div aria-live="polite" className="min-h-5 text-sm">
        {notice?.ok && <span>{notice.text}</span>}
      </div>
      {notice && !notice.ok && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {notice.text}
        </p>
      )}
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t("param")}</TableHeader>
            <TableHeader>{t("value")}</TableHeader>
            {mayChange && <TableHeader className="w-1/3">{t("change")}</TableHeader>}
          </TableRow>
        </TableHead>
        <tbody>
          {byChannel(data).map((ch) => (
            <React.Fragment key={ch.channelId}>
              <TableRow>
                <TableCell colSpan={mayChange ? 3 : 2} className="bg-[var(--muted)] text-xs font-medium">
                  {ch.channel}
                </TableCell>
              </TableRow>
              {ch.items.map((dp) => {
                const control = mayChange ? controlOf(dp) : "none";
                const shown = formatDatapoint(dp, t, lang);
                return (
                  <TableRow key={dp.id}>
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
              })}
            </React.Fragment>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
