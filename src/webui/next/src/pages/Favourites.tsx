import * as React from "react";
import { DatapointRow, OpsNotice, useDatapointOps } from "@/components/DatapointRow";
import { SysVarDialog } from "@/components/SysVarDialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeError, getChannelValues, getFavourites, getModel, type Datapoint, type FavouriteItem, type SysVar } from "@/lib/api";
import { text } from "@/lib/format";
import { formatSysVarValue } from "@/lib/format";
import { channelIds, splitDatapoints } from "@/lib/favourites";
import { useI18n } from "@/lib/i18n";
import { isEditable } from "@/lib/sysvar-edit";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { useCurrentProfile } from "@/lib/profile-context";
import { usePolled } from "@/lib/use-polled";

const LISTS_MS = 60_000;
const VALUES_MS = 10_000;

/** One channel of a list: its name, the values that matter, and the rest under "more values". */
function ChannelBlock({ item, items, mayChange, ops }: { item: FavouriteItem; items: Datapoint[]; mayChange: boolean; ops: ReturnType<typeof useDatapointOps> }) {
  const { t } = useI18n();
  const { shown, more } = splitDatapoints(items);
  const cols = mayChange ? 3 : 2;
  return (
    <section aria-label={item.name} className="space-y-1">
      <h3 className="text-sm font-medium">{item.name}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("notADevice")}</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="sr-only">{t("param")}</TableHeader>
              <TableHeader className="sr-only">{t("value")}</TableHeader>
              {mayChange && <TableHeader className="sr-only">{t("change")}</TableHeader>}
            </TableRow>
          </TableHead>
          <tbody>
            {shown.map((dp) => (
              <DatapointRow key={dp.id} dp={dp} mayChange={mayChange} ops={ops} />
            ))}
            {more.length > 0 && (
              <TableRow>
                <TableCell colSpan={cols}>
                  <details>
                    <summary className="cursor-pointer text-sm">{t("moreValues", { count: more.length })}</summary>
                    <Table>
                      <tbody>
                        {more.map((dp) => (
                          <DatapointRow key={dp.id} dp={dp} mayChange={mayChange} ops={ops} />
                        ))}
                      </tbody>
                    </Table>
                  </details>
                </TableCell>
              </TableRow>
            )}
          </tbody>
        </Table>
      )}
    </section>
  );
}

/** The favourite lists of the signed-in user, as in the classic "Favorites": pick a list, see and operate its members. */
export default function Favourites({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t, lang } = useI18n();
  const strings = useCcuStrings("extension", "stringtable");
  const profile = useCurrentProfile();
  const mayChange = profile?.level === "USER" || profile?.level === "ADMIN";
  const loadLists = React.useCallback(() => getFavourites(sid), [sid]);
  const lists = usePolled(loadLists, LISTS_MS, onExpired);
  const [picked, setPicked] = React.useState<string | null>(null);
  const list = lists.data?.find((l) => l.id === picked) ?? lists.data?.[0] ?? null;

  const ids = React.useMemo(() => channelIds(list?.items ?? []), [list]);
  const idsKey = ids.join(",");
  const loadValues = React.useCallback(() => (ids.length ? getChannelValues(sid, ids) : Promise.resolve([] as Datapoint[])), [sid, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const values = usePolled(loadValues, VALUES_MS, onExpired);
  const ops = useDatapointOps(sid, values.refresh, onExpired);

  // system variables on a list: shown with their value, changed with the same dialog as on the System variables page
  const hasVars = (list?.items ?? []).some((i) => i.type === "SYSVAR");
  const loadVars = React.useCallback(async () => (hasVars ? (await getModel("sysvars", sid)).items : ([] as SysVar[])), [sid, hasVars]);
  const vars = usePolled(loadVars, VALUES_MS, onExpired);
  const [editingVar, setEditingVar] = React.useState<string | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const closeVar = () => {
    setEditingVar(null);
    const back = opener.current;
    window.setTimeout(() => back?.isConnected && back.focus(), 0);
  };

  const byChannel = React.useMemo(() => {
    const m = new Map<string, Datapoint[]>();
    for (const dp of values.data ?? []) m.set(dp.channelId, [...(m.get(dp.channelId) ?? []), dp]);
    return m;
  }, [values.data]);

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("favourites")}</CardTitle>
        <CardDescription>{mayChange ? t("devicesControl") : t("readOnly")}</CardDescription>
      </div>
      {Boolean(lists.error) && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {describeError(lists.error, t)}
        </p>
      )}
      {!lists.loaded ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>
      ) : !lists.data || lists.data.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("noFavourites")}</p>
      ) : (
        <>
          <div role="group" aria-label={t("favouriteLists")} className="flex flex-wrap gap-2">
            {lists.data.map((l) => (
              <Button key={l.id} variant={l.id === list?.id ? "default" : "outline"} className="h-9 px-3" aria-pressed={l.id === list?.id} aria-label={t("openList", { name: l.name })} onClick={() => setPicked(l.id)}>
                {text(l.name, strings)}
              </Button>
            ))}
          </div>
          {list && list.info && <p className="text-sm text-[var(--muted-foreground)]">{text(list.info, strings)}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" className="h-8 px-3" onClick={() => (lists.refresh(), values.refresh(), vars.refresh())}>
              {t("refresh")}
            </Button>
          </div>
          {Boolean(values.error) && (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              {describeError(values.error, t)}
            </p>
          )}
          <OpsNotice notice={ops.notice} />
          {list && list.items.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">{t("emptyList")}</p>}
          <div className="space-y-4">
            {list?.items.map((item, i) => {
              if (item.type === "SEPARATOR") return <hr key={`${item.id}-${i}`} className="border-[var(--border)]" />;
              if (item.type === "CHANNEL") {
                if (!values.loaded) return <p key={`${item.id}-${i}`} className="text-sm text-[var(--muted-foreground)]">{text(item.name, strings)}</p>;
                return <ChannelBlock key={`${item.id}-${i}`} item={{ ...item, name: text(item.name, strings) }} items={byChannel.get(item.id) ?? []} mayChange={mayChange} ops={ops} />;
              }
              if (item.type === "SYSVAR") {
                const v = vars.data?.find((x) => x.id === item.id);
                return (
                  <section key={`${item.id}-${i}`} aria-label={item.name} className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-medium">{text(item.name, strings)}</h3>
                      <p className="text-sm">{v ? formatSysVarValue(v, t, strings, lang) : ""}</p>
                    </div>
                    {mayChange && v && isEditable(v) && (
                      <Button variant="outline" className="h-8 px-3" aria-label={`${t("change")}: ${text(item.name, strings)}`} onClick={(e) => ((opener.current = e.currentTarget), setEditingVar(v.id))}>
                        {t("change")}
                      </Button>
                    )}
                  </section>
                );
              }
              return (
                <section key={`${item.id}-${i}`} aria-label={item.name}>
                  <h3 className="text-sm font-medium">{text(item.name, strings)}</h3>
                  <p className="text-sm text-[var(--muted-foreground)]">{t("programInList")}</p>
                </section>
              );
            })}
          </div>
        </>
      )}
      {editingVar && mayChange && vars.data?.find((v) => v.id === editingVar) && (
        <SysVarDialog key={editingVar} sv={vars.data.find((v) => v.id === editingVar)!} sid={sid} strings={strings} onClose={closeVar} onChanged={() => vars.refresh()} onExpired={onExpired} />
      )}
    </Card>
  );
}
