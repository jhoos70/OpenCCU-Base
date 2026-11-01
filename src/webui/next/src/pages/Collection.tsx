import * as React from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FavouriteListDialog, type EditableFavouriteList } from "@/components/FavouriteListDialog";
import { TileBoard } from "@/components/TileBoard";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { deleteFavourite, describeChangeError, describeError, getFavourites, getModel, isSessionExpired, type FavouriteItem } from "@/lib/api";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCurrentProfile } from "@/lib/profile-context";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { usePolled } from "@/lib/use-polled";
import type { ChannelInfo } from "@/lib/widgets";

export type CollectionKind = "favourites" | "rooms" | "functions";

interface Group {
  id: string;
  name: string;
  description: string;
  items: FavouriteItem[];
}

const GROUPS_MS = 60_000;
const MODEL_MS = 300_000;

const getSubIdFromHash = (expectedKind: string): string | null => {
  const parts = window.location.hash.replace(/^#\/?/, "").split(/[\/?#]/);
  return parts[0] === expectedKind && parts[1] ? decodeURIComponent(parts[1]) : null;
};

/**
 * Favourites, rooms and functions are the same page: a set of named groups of channels, picked as buttons, whose members
 * are shown as tiles with their live values and controls. Only where the groups come from differs.
 */
export default function Collection({ kind, sid, onExpired }: { kind: CollectionKind; sid: string; onExpired: () => void }) {
  const { t } = useI18n();
  const strings = useCcuStrings("extension", "stringtable");
  const profile = useCurrentProfile();
  const mayChange = profile?.level === "USER" || profile?.level === "ADMIN";
  // which kind of channel each member is, and which device it belongs to, comes from the device model
  const devices = usePolled(React.useCallback(async () => (await getModel("devices", sid)).items, [sid]), MODEL_MS, onExpired);
  const info = React.useMemo(() => {
    const m = new Map<string, ChannelInfo>();
    for (const d of devices.data ?? []) for (const c of d.channels) m.set(c.id, { id: c.id, name: c.name, channelType: c.channelType, deviceId: d.id, deviceAddress: d.address });
    return m;
  }, [devices.data]);

  const loadGroups = React.useCallback(async (): Promise<Group[]> => {
    if (kind === "favourites") return (await getFavourites(sid)).map((l) => ({ id: l.id, name: l.name, description: l.info, items: l.items }));
    return (await getModel(kind, sid)).items.map((r) => ({ id: r.id, name: r.name, description: r.description, items: r.channelIds.map((id): FavouriteItem => ({ id, type: "CHANNEL", name: "" })) }));
  }, [kind, sid]);
  const groups = usePolled(loadGroups, GROUPS_MS, onExpired);
  const [picked, setPicked] = React.useState<string | null>(() => getSubIdFromHash(kind));

  React.useEffect(() => {
    const onHash = () => {
      const sub = getSubIdFromHash(kind);
      if (sub) setPicked(sub);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [kind]);
  const [refreshSignal, setRefreshSignal] = React.useState(0);
  const [editing, setEditing] = React.useState<EditableFavouriteList | null>(null);
  const [deleting, setDeleting] = React.useState<Group | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);

  const restoreFocus = () => {
    const back = opener.current;
    window.setTimeout(() => back?.isConnected && back.focus(), 0);
  };

  const group = groups.data?.find((g) => g.id === picked) ?? groups.data?.[0] ?? null;
  // a room or function holds channels in no useful order: by name, so the channels of one device are together
  const items = React.useMemo(() => {
    if (!group) return [];
    const named = group.items.map((i) => (i.type === "CHANNEL" && i.name === "" ? { ...i, name: info.get(i.id)?.name ?? i.id } : i));
    return kind === "favourites" ? named : named.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [group, kind, info]);

  const title = kind === "favourites" ? t("favourites") : kind === "rooms" ? t("rooms") : t("functions");
  const none = kind === "favourites" ? t("noFavourites") : kind === "rooms" ? t("noRooms") : t("noFunctions");
  const ready = groups.loaded && devices.loaded;

  async function confirmDelete(target: Group): Promise<string | null> {
    try {
      await deleteFavourite(sid, target.id);
      if (picked === target.id) setPicked(null);
      groups.refresh();
      return null;
    } catch (e) {
      if (isSessionExpired(e)) {
        onExpired();
        return null;
      }
      return describeChangeError(e, t);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{mayChange ? t("devicesControl") : t("readOnly")}</CardDescription>
        </div>
        {kind === "favourites" && mayChange && ready && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 px-3"
              onClick={(e) => {
                opener.current = e.currentTarget;
                setEditing({ name: "", description: "", items: [] });
              }}
            >
              {t("newList")}
            </Button>
            {group && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3"
                  onClick={(e) => {
                    opener.current = e.currentTarget;
                    setEditing({ id: group.id, name: group.name, description: group.description, items: group.items });
                  }}
                >
                  {t("editList")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-3"
                  onClick={(e) => {
                    opener.current = e.currentTarget;
                    setDeleting(group);
                  }}
                >
                  {t("deleteList")}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {Boolean(groups.error) && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {describeError(groups.error, t)}
        </p>
      )}
      {!ready ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>
      ) : !groups.data || groups.data.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{none}</p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div role="group" aria-label={title} className="flex flex-wrap gap-2">
              {groups.data.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={g.id === group?.id}
                  aria-label={t("openList", { name: g.name })}
                  onClick={() => {
                    setPicked(g.id);
                    window.location.hash = `#/${kind}/${g.id}`;
                  }}
                  className={`h-9 rounded-full border px-3.5 text-[15px] ${g.id === group?.id ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--accent)]"}`}
                >
                  {text(g.name, strings)}
                </button>
              ))}
            </div>
            <Button variant="outline" className="h-9 shrink-0 px-3" onClick={() => (groups.refresh(), devices.refresh(), setRefreshSignal((n) => n + 1))}>
              {t("refresh")}
            </Button>
          </div>
          {group && group.description && <p className="text-sm text-[var(--muted-foreground)]">{text(group.description, strings)}</p>}
          {group && items.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">{kind === "favourites" ? t("emptyList") : t("emptyCollection")}</p>}
          {group && items.length > 0 && <TileBoard key={group.id} items={items} info={info} sid={sid} mayChange={mayChange} strings={strings} refreshSignal={refreshSignal} onExpired={onExpired} />}
        </>
      )}
      {editing && mayChange && (
        <FavouriteListDialog
          key={editing.id ?? "new"}
          initial={editing}
          devices={devices.data ?? []}
          sid={sid}
          strings={strings}
          onClose={() => {
            setEditing(null);
            restoreFocus();
          }}
          onSaved={(saved) => {
            setPicked(saved.id);
            groups.refresh();
          }}
          onExpired={onExpired}
        />
      )}
      {deleting && mayChange && (
        <ConfirmDialog
          key={deleting.id}
          title={t("deleteListTitle")}
          message={t("deleteListWarning", { name: text(deleting.name, strings) })}
          confirmLabel={t("delete")}
          onConfirm={() => confirmDelete(deleting)}
          onClose={() => {
            setDeleting(null);
            restoreFocus();
          }}
        />
      )}
    </Card>
  );
}
