import * as React from "react";
import { SysVarDialog } from "@/components/SysVarDialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeError, getModel, type SysVar, type SysVarChange } from "@/lib/api";
import { formatSysVarValue, isUserVar, text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCurrentProfile } from "@/lib/profile-context";
import { isEditable } from "@/lib/sysvar-edit";
import { formatTime } from "@/lib/service-messages";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { usePolled } from "@/lib/use-polled";

/** The classic list refreshes with the CCU's update cycle; a request runs a script, so every 10 seconds is enough. */
const POLL_MS = 10_000;

/** "" for a variable that was never set (the epoch), as the classic list shows nothing there. */
const changedAt = (v: SysVar, lang: string): string => (v.lastModified.startsWith("1970-") ? "" : formatTime(v.lastModified, lang));

/** Status and control of the system variables: the list as the classic one has it, and a dialog to change a value. */
export default function SysVars({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t, lang } = useI18n();
  const strings = useCcuStrings("extension", "stringtable");
  const profile = useCurrentProfile();
  const load = React.useCallback(async () => (await getModel("sysvars", sid)).items, [sid]);
  const { data, error, loaded, refresh } = usePolled(load, POLL_MS, onExpired);
  const [internal, setInternal] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<string | null>(null); // the id of the variable in the dialog
  // the button that opened the dialog gets the focus back, so a keyboard user keeps their place in the table
  const opener = React.useRef<HTMLElement | null>(null);
  const closeDialog = React.useCallback(() => {
    setEditing(null);
    const back = opener.current;
    window.setTimeout(() => back?.isConnected && back.focus(), 0);
  }, []);
  // what the CCU answered to a change, shown until the next update brings the same
  const [changes, setChanges] = React.useState<Record<string, SysVarChange>>({});

  // the override ends when an update has caught up with it, so a later change by someone else shows
  React.useEffect(() => {
    if (!data) return;
    setChanges((m) => {
      const next = { ...m };
      for (const id of Object.keys(m)) {
        const d = data.find((x) => x.id === id);
        if (d && d.lastModified >= m[id].lastModified) delete next[id];
      }
      return Object.keys(next).length === Object.keys(m).length ? m : next;
    });
  }, [data]);

  // a guest only looks, as in the classic UI
  const mayChange = profile?.level === "USER" || profile?.level === "ADMIN";
  const merged = React.useMemo(() => (data ?? []).map((v) => (changes[v.id] ? { ...v, value: changes[v.id].value, lastModified: changes[v.id].lastModified } : v)), [data, changes]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const items = merged
    .filter((v) => internal || isUserVar(v))
    .filter((v) => words.every((w) => `${text(v.name, strings)} ${text(v.description, strings)}`.toLowerCase().includes(w)));
  const current = merged.find((v) => v.id === editing) ?? null;

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("sysvars")}</CardTitle>
        <CardDescription>{mayChange ? t("sysvarsControl") : t("readOnly")}</CardDescription>
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="sysvar-filter">{t("filter")}</Label>
          <Input id="sysvar-filter" type="search" value={query} placeholder={t("filterByName")} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input id="internal" type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          <Label htmlFor="internal">{t("showInternal")}</Label>
        </div>
      </div>
      {Boolean(error) && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {describeError(error, t)}
        </p>
      )}
      {!loaded ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>
      ) : merged.filter((v) => internal || isUserVar(v)).length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("noSysvars")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("noMatchVars")}</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t("name")}</TableHeader>
              <TableHeader className="hidden md:table-cell">{t("description")}</TableHeader>
              <TableHeader className="hidden sm:table-cell">{t("lastModified")}</TableHeader>
              <TableHeader>{t("status")}</TableHeader>
            </TableRow>
          </TableHead>
          <tbody>
            {items.map((v) => (
              <TableRow key={v.id}>
                <TableCell>{text(v.name, strings)}</TableCell>
                <TableCell className="hidden md:table-cell">{text(v.description, strings)}</TableCell>
                <TableCell className="hidden whitespace-nowrap sm:table-cell">{changedAt(v, lang)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-between gap-2">
                    <span>{formatSysVarValue(v, t, strings, lang)}</span>
                    {mayChange && isEditable(v) && (
                      <Button variant="outline" className="h-8 px-3" onClick={(e) => ((opener.current = e.currentTarget), setEditing(v.id))} aria-label={`${t("change")}: ${text(v.name, strings)}`}>
                        {t("change")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
      {current && mayChange && (
        <SysVarDialog
          key={current.id}
          sv={current}
          sid={sid}
          strings={strings}
          onClose={closeDialog}
          onChanged={(c) => (setChanges((m) => ({ ...m, [c.id]: c })), refresh())}
          onExpired={onExpired}
        />
      )}
    </Card>
  );
}
