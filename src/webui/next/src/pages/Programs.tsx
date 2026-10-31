import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeChangeError, describeError, executeProgram, getModel, isSessionExpired, type Program } from "@/lib/api";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCurrentProfile } from "@/lib/profile-context";
import { filterPrograms, neverRan } from "@/lib/programs";
import { formatTime } from "@/lib/service-messages";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { usePolled } from "@/lib/use-polled";

/** A request runs a script on the CCU, so every 10 seconds is enough to keep the last run current. */
const POLL_MS = 10_000;

/** Status and control of the programs: the classic status list and its action, the run. */
export default function Programs({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t, lang } = useI18n();
  const strings = useCcuStrings("extension", "stringtable");
  const profile = useCurrentProfile();
  const load = React.useCallback(async () => (await getModel("programs", sid)).items, [sid]);
  const { data, error, loaded, refresh } = usePolled(load, POLL_MS, onExpired);
  const [query, setQuery] = React.useState("");
  const [running, setRunning] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ text: string; failed: boolean } | null>(null);
  // the time of the last run the CCU reported for a run, shown until the next update has caught up
  const [lastRuns, setLastRuns] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!data) return;
    setLastRuns((m) => {
      const next = { ...m };
      for (const id of Object.keys(m)) {
        const d = data.find((x) => x.id === id);
        if (d && d.lastExecuteTime >= m[id]) delete next[id];
      }
      return Object.keys(next).length === Object.keys(m).length ? m : next;
    });
  }, [data]);

  const mayRun = profile?.level === "USER" || profile?.level === "ADMIN";
  const shown = filterPrograms((data ?? []).map((p): Program => (lastRuns[p.id] ? { ...p, lastExecuteTime: lastRuns[p.id] } : p)), query, lang);
  const any = filterPrograms(data ?? [], "", lang).length > 0;

  async function run(p: Program) {
    const name = text(p.name, strings);
    setRunning(p.id);
    setMessage(null);
    try {
      const r = await executeProgram(sid, p.id);
      setMessage({ text: t(r.executed ? "programStarted" : "programNotStarted", { name }), failed: !r.executed });
      if (r.lastExecuteTime) setLastRuns((m) => ({ ...m, [p.id]: r.lastExecuteTime }));
      refresh();
    } catch (e) {
      if (isSessionExpired(e)) return onExpired();
      setMessage({ text: t("programFailed", { name, reason: describeChangeError(e, t) }), failed: true });
    } finally {
      setRunning(null);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("programs")}</CardTitle>
        <CardDescription>{mayRun ? t("programsControl") : t("readOnly")}</CardDescription>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="program-filter">{t("filter")}</Label>
        <Input id="program-filter" type="search" value={query} placeholder={t("filterByName")} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {/* The result of a run: announced to a screen reader, shown to everybody */}
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
      ) : !any ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("noPrograms")}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("noMatchPrograms")}</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t("name")}</TableHeader>
              <TableHeader className="hidden md:table-cell">{t("description")}</TableHeader>
              <TableHeader className="hidden sm:table-cell">{t("lastRun")}</TableHeader>
              {mayRun && <TableHeader className="text-right">{t("action")}</TableHeader>}
            </TableRow>
          </TableHead>
          <tbody>
            {shown.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{text(p.name, strings)}</TableCell>
                <TableCell className="hidden md:table-cell">{text(p.description, strings)}</TableCell>
                <TableCell className="hidden whitespace-nowrap sm:table-cell">{neverRan(p) ? "—" : formatTime(p.lastExecuteTime, lang)}</TableCell>
                {mayRun && (
                  <TableCell className="text-right">
                    <Button variant="outline" className="h-8 px-3" disabled={running !== null} onClick={() => void run(p)} aria-label={`${t("run")}: ${text(p.name, strings)}`}>
                      {running === p.id ? t("saving") : t("run")}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
