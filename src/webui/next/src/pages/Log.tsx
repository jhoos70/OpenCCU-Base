import * as React from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clearLog, describeChangeError, describeError, getLog, isSessionExpired, type LogItem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatTime } from "@/lib/service-messages";
import { activityText, entryName, filterLog, recordsIn } from "@/lib/syslog";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { useCurrentProfile } from "@/lib/profile-context";

/** Records per request: the log can be long (thousands), so the newest come first and older ones on request. */
const PAGE = 200;

/** The system log: the history of the logged channels and system variables, newest first, with refresh, export and clear. */
export default function Log({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t, lang } = useI18n();
  const strings = useCcuStrings("extension", "stringtable");
  const profile = useCurrentProfile();
  const mayClear = profile?.level === "USER" || profile?.level === "ADMIN";
  const [items, setItems] = React.useState<LogItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [query, setQuery] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; failed: boolean } | null>(null);
  const clearButton = React.useRef<HTMLButtonElement | null>(null);

  // from the newest on (refresh), or the next older page (more)
  const load = React.useCallback(
    async (more: boolean) => {
      setBusy(true);
      try {
        const page = await getLog(sid, PAGE, more ? recordsIn(items) : 0);
        setItems((cur) => (more ? [...cur, ...page.items] : page.items));
        setTotal(page.total);
        setError(null);
      } catch (e) {
        if (isSessionExpired(e)) return onExpired();
        setError(e);
      } finally {
        setBusy(false);
        setLoaded(true);
      }
    },
    [sid, items, onExpired],
  );

  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      void load(false);
    }
  }, [load]);

  async function doClear(): Promise<string | null> {
    try {
      const r = await clearLog(sid);
      setItems([]);
      setTotal(r.total);
      setMessage({ text: t(r.cleared ? "logCleared" : "logNotCleared"), failed: !r.cleared });
      if (!r.cleared) void load(false);
      return null;
    } catch (e) {
      if (isSessionExpired(e)) {
        onExpired();
        return null;
      }
      return describeChangeError(e, t);
    }
  }

  const activity = (i: LogItem) => activityText(i, t, strings, lang);
  const name = (i: LogItem) => entryName(i, strings);
  const shown = filterLog(items, query, activity, name);
  const loadedRecords = recordsIn(items);

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("log")}</CardTitle>
        <CardDescription>{mayClear ? t("programsControl") : t("readOnly")}</CardDescription>
      </div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="log-filter">{t("filter")}</Label>
          <Input id="log-filter" type="search" value={query} placeholder={t("filterByLog")} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => (setMessage(null), void load(false))} disabled={busy}>
          {t("refresh")}
        </Button>
        {/* ReGa serves the export itself, as it does for the classic UI */}
        <Button asChild variant="outline">
          <a href={`/HistoryBuffer.csv?sid=@${sid}@`} download="HistoryBuffer.csv">
            {t("exportLog")}
          </a>
        </Button>
        {mayClear && (
          <Button ref={clearButton} variant="destructiveOutline" onClick={() => setConfirming(true)} disabled={busy || total === 0}>
            {t("clearLog")}
          </Button>
        )}
      </div>
      <div role="status" aria-live="polite">
        {message && <p className={message.failed ? "text-sm text-[var(--destructive)]" : "text-sm"}>{message.text}</p>}
      </div>
      {Boolean(error) && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {describeError(error, t)}
        </p>
      )}
      {!loaded ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>
      ) : total === 0 && items.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("noLog")}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("noMatchLog")}</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t("dateTime")}</TableHeader>
              <TableHeader>{t("name")}</TableHeader>
              <TableHeader>{t("activity")}</TableHeader>
            </TableRow>
          </TableHead>
          <tbody>
            {shown.map((i, n) => (
              <TableRow key={`${i.time}-${i.name}-${n}`}>
                <TableCell className="whitespace-nowrap">{formatTime(i.time, lang)}</TableCell>
                <TableCell>{name(i)}</TableCell>
                <TableCell>{activity(i)}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
      {loaded && total > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted-foreground)]">
          <span>{t("logCount", { shown: loadedRecords, total })}</span>
          {loadedRecords < total && (
            <Button variant="outline" className="h-8 px-3" onClick={() => void load(true)} disabled={busy}>
              {t("loadOlder")}
            </Button>
          )}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title={t("clearLogTitle")}
          message={t("clearLogWarning")}
          confirmLabel={t("delete")}
          onConfirm={doClear}
          onClose={() => {
            setConfirming(false);
            // back to the button that asked; it is disabled once the log is empty, then the filter is the next stop
            window.setTimeout(() => {
              const b = clearButton.current;
              (b && !b.disabled ? b : document.getElementById("log-filter"))?.focus();
            }, 0);
          }}
        />
      )}
    </Card>
  );
}
