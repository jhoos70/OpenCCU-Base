import * as React from "react";
import { SysVarDialog } from "@/components/SysVarDialog";
import { Icon } from "@/components/tiles/Icon";
import { CommandStatus, TileShell } from "@/components/tiles/TileShell";
import { GenericTile, SensorTile, ShutterTile, SwitchTile, ThermostatTile, type TileProps } from "@/components/tiles/Tiles";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { describeChangeError, describeError, getChannelValues, getFavourites, getModel, isSessionExpired, setSysVar, type Datapoint, type FavouriteItem, type SysVar } from "@/lib/api";
import { formatSysVarValue, text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCurrentProfile } from "@/lib/profile-context";
import { isEditable } from "@/lib/sysvar-edit";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import type { CommandState } from "@/lib/use-command";
import { usePolled } from "@/lib/use-polled";
import { buildEntries, healthOf, type ChannelInfo, type Entry } from "@/lib/widgets";

const LISTS_MS = 60_000;
const VALUES_MS = 10_000;
const MODEL_MS = 300_000;

/** A system variable on a list: a switch for a logic variable, else the value and the same dialog as on the System variables page. */
function VariableTile({ item, sv, mayChange, sid, strings, onChanged, onEdit, onExpired }: { item: FavouriteItem; sv: SysVar | undefined; mayChange: boolean; sid: string; strings: Record<string, string>; onChanged: () => void; onEdit: (el: HTMLElement) => void; onExpired: () => void }) {
  const { t, lang } = useI18n();
  const [state, setState] = React.useState<CommandState>({ phase: "idle" });
  const title = text(item.name, strings);
  const logic = sv?.type === "LOGIC";
  const on = logic && sv?.value === "true";
  async function toggle() {
    if (!sv) return;
    setState({ phase: "sending", what: title });
    try {
      await setSysVar(sid, sv.id, !on);
      setState({ phase: "ok", what: !on ? t("tileOn") : t("tileOff"), at: new Date(), confirmed: true });
      onChanged();
    } catch (e) {
      if (isSessionExpired(e)) return onExpired();
      setState({ phase: "error", text: describeChangeError(e, t) });
    }
  }
  return (
    <TileShell kind={t("kindVariable")} icon="list" title={title} on={on} status={<CommandStatus state={state} retry={() => void toggle()} />}>
      {logic ? (
        <>
          <button type="button" role="switch" aria-checked={on} aria-label={title} disabled={!mayChange || !sv || !isEditable(sv)} onClick={() => void toggle()} className={`relative my-1 h-9 w-16 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[var(--accent)]" : "bg-[var(--track)]"}`}>
            <span className={`absolute left-1 top-1 h-7 w-7 rounded-full bg-white shadow transition-transform ${on ? "translate-x-7" : ""}`} />
          </button>
          <p className="m-0 text-[22px] font-semibold">{sv ? formatSysVarValue(sv, t, strings, lang) : "–"}</p>
        </>
      ) : (
        <>
          <p className="m-0 text-2xl font-semibold">{sv ? formatSysVarValue(sv, t, strings, lang) : "–"}</p>
          {mayChange && sv && isEditable(sv) && (
            <Button variant="outline" className="mt-1 h-8 self-start px-3" aria-label={`${t("change")}: ${title}`} onClick={(e) => onEdit(e.currentTarget)}>
              {t("change")}
            </Button>
          )}
        </>
      )}
      <p className="m-0 text-xs text-[var(--muted-foreground)]">{t("systemVariable")}</p>
    </TileShell>
  );
}

/** The favourite lists of the signed-in user, as in the classic "Favorites": pick a list, see and operate its members as tiles. */
export default function Favourites({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t } = useI18n();
  const strings = useCcuStrings("extension", "stringtable");
  const profile = useCurrentProfile();
  const mayChange = profile?.level === "USER" || profile?.level === "ADMIN";
  const lists = usePolled(React.useCallback(() => getFavourites(sid), [sid]), LISTS_MS, onExpired);
  // which kind of channel each member is, and which device it belongs to, comes from the device model
  const devices = usePolled(React.useCallback(async () => (await getModel("devices", sid)).items, [sid]), MODEL_MS, onExpired);
  const info = React.useMemo(() => {
    const m = new Map<string, ChannelInfo>();
    for (const d of devices.data ?? []) for (const c of d.channels) m.set(c.id, { id: c.id, name: c.name, channelType: c.channelType, deviceId: d.id, deviceAddress: d.address });
    return m;
  }, [devices.data]);

  const [picked, setPicked] = React.useState<string | null>(null);
  const list = lists.data?.find((l) => l.id === picked) ?? lists.data?.[0] ?? null;
  const { entries, hidden } = React.useMemo(() => buildEntries(list?.items ?? [], info), [list, info]);
  const ids = React.useMemo(() => [...new Set(entries.flatMap((e) => (e.type === "tile" ? e.channelIds : [])))], [entries]);
  const idsKey = ids.join(",");
  const values = usePolled(
    React.useCallback(() => (ids.length ? getChannelValues(sid, ids) : Promise.resolve([] as Datapoint[])), [sid, idsKey]), // eslint-disable-line react-hooks/exhaustive-deps
    VALUES_MS,
    onExpired,
  );
  const all = values.data ?? [];

  const hasVars = entries.some((e) => e.type === "sysvar");
  const vars = usePolled(React.useCallback(async () => (hasVars ? (await getModel("sysvars", sid)).items : ([] as SysVar[])), [sid, hasVars]), VALUES_MS, onExpired);
  const [editingVar, setEditingVar] = React.useState<string | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const closeVar = () => {
    setEditingVar(null);
    const back = opener.current;
    window.setTimeout(() => back?.isConnected && back.focus(), 0);
  };
  const [showHidden, setShowHidden] = React.useState(false);

  const tileProps = (e: Extract<Entry, { type: "tile" }>): TileProps => ({
    title: text(e.title, strings),
    dps: all.filter((d) => e.channelIds.includes(d.channelId)),
    health: healthOf(all, e.deviceAddress),
    mayChange,
    sid,
    refresh: values.refresh,
    onExpired,
  });
  const ready = lists.loaded && devices.loaded && values.loaded;

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
          <div className="flex items-start justify-between gap-2">
            <div role="group" aria-label={t("favouriteLists")} className="flex flex-wrap gap-2">
              {lists.data.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={l.id === list?.id}
                  aria-label={t("openList", { name: l.name })}
                  onClick={() => setPicked(l.id)}
                  className={`h-9 rounded-full border px-3.5 text-[15px] ${l.id === list?.id ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-white hover:border-[var(--accent)]"}`}
                >
                  {text(l.name, strings)}
                </button>
              ))}
            </div>
            <Button variant="outline" className="h-9 shrink-0 px-3" onClick={() => (lists.refresh(), devices.refresh(), values.refresh(), vars.refresh())}>
              {t("refresh")}
            </Button>
          </div>
          {list && list.info && <p className="text-sm text-[var(--muted-foreground)]">{text(list.info, strings)}</p>}
          {Boolean(values.error) && (
            <p role="alert" className="text-sm text-[var(--destructive)]">
              {describeError(values.error, t)}
            </p>
          )}
          {list && list.items.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">{t("emptyList")}</p>}
          {!ready ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3.5">
              {entries.map((e) => {
                if (e.type === "separator") return <hr key={e.key} className="col-span-full my-1 border-[var(--border)]" />;
                if (e.type === "sysvar") {
                  return <VariableTile key={e.key} item={e.item} sv={vars.data?.find((v) => v.id === e.item.id)} mayChange={mayChange} sid={sid} strings={strings} onChanged={vars.refresh} onEdit={(el) => ((opener.current = el), setEditingVar(e.item.id))} onExpired={onExpired} />;
                }
                if (e.type === "program") {
                  return (
                    <TileShell key={e.key} kind={t("kindOther")} icon="list" title={text(e.item.name, strings)}>
                      <p className="m-0 text-[13px] text-[var(--muted-foreground)]">{t("programInList")}</p>
                    </TileShell>
                  );
                }
                const p = tileProps(e);
                switch (e.kind) {
                  case "thermostat":
                    return <ThermostatTile key={e.key} {...p} />;
                  case "shutter":
                    return <ShutterTile key={e.key} {...p} />;
                  case "switch":
                  case "meter":
                    return <SwitchTile key={e.key} {...p} />;
                  case "sensor":
                    return <SensorTile key={e.key} {...p} />;
                  default:
                    return <GenericTile key={e.key} {...p} channelType={info.get(e.channelIds[0])?.channelType ?? ""} />;
                }
              })}
            </div>
          )}
          {ready && hidden > 0 && (
            <p className="text-[13px] text-[var(--muted-foreground)]">
              {t("hiddenChannels", { count: hidden })}{" "}
              <button type="button" className="underline" aria-expanded={showHidden} onClick={() => setShowHidden((s) => !s)}>
                {showHidden ? t("hideValues") : t("showValues")}
              </button>
            </p>
          )}
          {ready && showHidden && (
            <ul className="list-disc pl-5 text-[13px] text-[var(--muted-foreground)]">
              {list?.items
                .filter((i) => i.type === "CHANNEL" && info.get(i.id) && ["BLIND_WEEK_PROFILE", "MAINTENANCE", "VIP-MAINTENANCE"].includes(info.get(i.id)!.channelType))
                .map((i, k) => (
                  <li key={`${i.id}-${k}`}>
                    {i.name} <Icon name="dots" className="inline h-3 w-3" /> {info.get(i.id)?.channelType}
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
      {editingVar && mayChange && vars.data?.find((v) => v.id === editingVar) && (
        <SysVarDialog key={editingVar} sv={vars.data.find((v) => v.id === editingVar)!} sid={sid} strings={strings} onClose={closeVar} onChanged={() => vars.refresh()} onExpired={onExpired} />
      )}
    </Card>
  );
}
