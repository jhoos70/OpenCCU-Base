import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DeviceParameters } from "@/components/DeviceParameters";
import { TileBoard } from "@/components/TileBoard";
import {
  getHeatingGroupList,
  type Channel,
  type Device,
  type FavouriteItem,
  type HeatingGroup,
  type HeatingGroupMember,
} from "@/lib/api";
import { deviceIcon } from "@/lib/ccu-strings";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCurrentProfile } from "@/lib/profile-context";
import { useCcuStrings, useDeviceIcons } from "@/lib/use-ccu-strings";
import { useModel } from "@/lib/use-model";
import type { ChannelInfo } from "@/lib/widgets";
import {
  ArrowLeft,
  ChevronRight,
  DoorOpen,
  ExternalLink,
  Flame,
  LayoutGrid,
  Loader2,
  Lock,
  Radio,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Thermometer,
  Zap,
} from "lucide-react";

function categorizeMember(member: HeatingGroupMember): "wall" | "radiator" | "window" | "switch" | "other" {
  const typeId = (member.memberType?.id || "").toUpperCase();
  if (typeId.includes("WALL") || typeId.includes("TC-IT") || typeId.includes("WTH") || typeId.includes("BWTH")) {
    return "wall";
  }
  if (typeId.includes("RADIATOR") || typeId.includes("CC-RT") || typeId.includes("ETRV")) {
    return "radiator";
  }
  if (typeId.includes("WINDOW") || typeId.includes("SEC-SC") || typeId.includes("SWDO") || typeId.includes("SHUTTER")) {
    return "window";
  }
  if (typeId.includes("SWITCH") || typeId.includes("ACTUATOR") || typeId.includes("FLOOR") || typeId.includes("FAL")) {
    return "switch";
  }
  return "other";
}

interface GroupsProps {
  sid: string;
  onExpired: () => void;
}

export default function Groups({ sid, onExpired }: GroupsProps) {
  const { t, lang } = useI18n();
  const profile = useCurrentProfile();
  const mayChange = profile?.level === "ADMIN" || profile?.level === "USER";

  const strings = useCcuStrings("deviceDescription", "extension", "stringtable", "group");
  const icons = useDeviceIcons();

  const [refreshSignal, setRefreshSignal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [groups, setGroups] = React.useState<HeatingGroup[]>([]);
  const [search, setSearch] = React.useState("");

  // Read devices and rooms from central model
  const devicesState = useModel("devices", sid, onExpired, refreshSignal);
  const roomsState = useModel("rooms", sid, onExpired, refreshSignal);

  const allDevices: Device[] = devicesState.status === "ready" ? devicesState.data.items : [];
  const allRooms = roomsState.status === "ready" ? roomsState.data.items : [];

  // Routing: selected group id from URL hash #/groups/:id
  const [selectedGroupId, setSelectedGroupId] = React.useState<number | null>(() => {
    const parts = window.location.hash.replace(/^#\/?/, "").split(/[\/?#]/);
    if (parts[0] === "groups" && parts[1]) {
      const parsed = parseInt(parts[1], 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  });

  const [detailTab, setDetailTab] = React.useState<"control" | "parameters">("control");

  React.useEffect(() => {
    const onHashChange = () => {
      const parts = window.location.hash.replace(/^#\/?/, "").split(/[\/?#]/);
      if (parts[0] === "groups" && parts[1]) {
        const parsed = parseInt(parts[1], 10);
        setSelectedGroupId(Number.isNaN(parsed) ? null : parsed);
      } else {
        setSelectedGroupId(null);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Fetch groups list
  const loadGroups = React.useCallback(async () => {
    try {
      setLoading(true);
      const list = await getHeatingGroupList(sid);
      setGroups(list);
    } catch (err) {
      console.error("Failed to load heating groups:", err);
    } finally {
      setLoading(false);
    }
  }, [sid]);

  React.useEffect(() => {
    loadGroups();
  }, [loadGroups, refreshSignal]);

  // Helper to resolve virtual group device
  const getVirtualDevice = React.useCallback(
    (group: HeatingGroup): Device | undefined => {
      const paddedAddr = `INT${String(group.id).padStart(7, "0")}`;
      return allDevices.find(
        (d) =>
          d.address === paddedAddr ||
          d.name === group.groupProperties.GROUP_DEVICE_NAME ||
          d.address.includes(paddedAddr),
      );
    },
    [allDevices],
  );

  // Helper to resolve member device
  const getMemberDevice = React.useCallback(
    (member: HeatingGroupMember): Device | undefined => {
      const memberAddr = member.id.split(":")[0];
      return allDevices.find((d) => d.address === memberAddr || d.address === member.id);
    },
    [allDevices],
  );

  // Helper to resolve room of a device
  const getDeviceRoom = React.useCallback(
    (device: Device | undefined): string | null => {
      if (!device) return null;
      for (const ch of device.channels) {
        const room = allRooms.find((r) => r.channelIds.includes(ch.id));
        if (room) return room.name;
      }
      return null;
    },
    [allRooms],
  );

  // Filtered groups
  const filteredGroups = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => {
      const name = g.groupProperties.NAME.toLowerCase();
      const devName = g.groupProperties.GROUP_DEVICE_NAME.toLowerCase();
      return name.includes(term) || devName.includes(term) || String(g.id).includes(term);
    });
  }, [groups, search]);

  // If viewing a detail page
  const selectedGroup = selectedGroupId !== null ? groups.find((g) => g.id === selectedGroupId) : null;
  const selectedVirtualDevice = selectedGroup ? getVirtualDevice(selectedGroup) : null;

  // Selected virtual device tiles
  const groupTiles = React.useMemo(() => {
    if (!selectedVirtualDevice) return { items: [], info: new Map<string, ChannelInfo>() };
    const channels = [...selectedVirtualDevice.channels]
      .filter((c) => c.index > 0)
      .sort((a, b) => a.index - b.index);
    const info = new Map<string, ChannelInfo>(
      channels.map((c) => [
        c.id,
        {
          id: c.id,
          name: c.name,
          channelType: c.channelType,
          deviceId: selectedVirtualDevice.id,
          deviceAddress: selectedVirtualDevice.address,
        },
      ]),
    );
    const items: FavouriteItem[] = channels.map((c) => ({
      id: c.id,
      type: "CHANNEL",
      name: c.name,
    }));
    return { items, info };
  }, [selectedVirtualDevice]);

  if (loading && groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-[var(--muted-foreground)] space-y-3">
        <Loader2 className="size-6 animate-spin text-[var(--primary)]" />
        <span className="text-sm font-medium">{t("loading")}</span>
      </div>
    );
  }

  // ---- DETAIL VIEW ----
  if (selectedGroupId !== null) {
    if (!selectedGroup) {
      return (
        <div className="space-y-4">
          <a
            href="#/groups"
            className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="size-4" />
            <span>{t("backToGroups")}</span>
          </a>
          <p className="text-sm text-[var(--muted-foreground)]">{t("groupNotFound")}</p>
        </div>
      );
    }

    const groupRoom = getDeviceRoom(selectedVirtualDevice ?? undefined);
    const isHmIP = selectedGroup.groupType.id.includes("hmip");

    // Group members categorized
    const wallMembers = selectedGroup.groupMembers.filter((m) => categorizeMember(m) === "wall");
    const radiatorMembers = selectedGroup.groupMembers.filter((m) => categorizeMember(m) === "radiator");
    const windowMembers = selectedGroup.groupMembers.filter((m) => categorizeMember(m) === "window");
    const switchMembers = selectedGroup.groupMembers.filter((m) => categorizeMember(m) === "switch");
    const otherMembers = selectedGroup.groupMembers.filter((m) => categorizeMember(m) === "other");

    return (
      <div className="space-y-6">
        <div>
          <a
            href="#/groups"
            className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="size-4" />
            <span>{t("backToGroups")}</span>
          </a>
        </div>

        {/* Group Header Card */}
        <Card className="p-5 sm:p-6 shadow-sm border border-[var(--border)] bg-[var(--card)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="grid size-12 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0">
                <Flame className="size-6" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">
                    {selectedGroup.groupProperties.NAME}
                  </h1>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      isHmIP
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                        : "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
                    }`}
                  >
                    {isHmIP ? "Homematic IP" : "Homematic Classic"}
                  </span>
                  {groupRoom && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20">
                      {groupRoom}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[var(--muted-foreground)]">
                  <span className="font-mono bg-[var(--muted)] px-2 py-0.5 rounded text-[var(--foreground)] font-medium">
                    {selectedVirtualDevice?.address || `INT${String(selectedGroup.id).padStart(7, "0")}`}
                  </span>
                  <span>{selectedGroup.groupProperties.GROUP_DEVICE_NAME}</span>
                  <span>· {selectedGroup.groupMembers.length} Geräte</span>
                </div>
              </div>
            </div>

            {selectedGroup.groupProperties.FORBID_SINGLE_OPERATION && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
                <Lock className="size-3.5 shrink-0" />
                <span>{t("forbidSingleOperation")}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto pb-px">
          <button
            type="button"
            onClick={() => setDetailTab("control")}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors shrink-0 ${
              detailTab === "control"
                ? "border-[var(--primary)] text-[var(--primary)] font-semibold"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <LayoutGrid className="size-4" />
            <span>{t("groupControl")}</span>
          </button>
          {selectedVirtualDevice && (
            <button
              type="button"
              onClick={() => setDetailTab("parameters")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors shrink-0 ${
                detailTab === "parameters"
                  ? "border-[var(--primary)] text-[var(--primary)] font-semibold"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <SlidersHorizontal className="size-4" />
              <span>{t("tabParameters")}</span>
            </button>
          )}
        </div>

        {/* TAB 1: Climate Control & Member Devices */}
        {detailTab === "control" && (
          <div className="space-y-6">
            {/* Live Interactive Climate Control Tiles */}
            {selectedVirtualDevice && groupTiles.items.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {t("groupControl")}
                </h3>
                <TileBoard
                  items={groupTiles.items}
                  info={groupTiles.info}
                  sid={sid}
                  mayChange={mayChange}
                  strings={strings}
                  refreshSignal={refreshSignal}
                  onExpired={onExpired}
                />
              </div>
            )}

            {/* Assigned Member Devices Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                {t("groupMembers")} ({selectedGroup.groupMembers.length})
              </h3>

              <div className="space-y-4">
                {/* Wall Thermostats */}
                {wallMembers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
                      <Thermometer className="size-3.5 text-orange-500" />
                      <span>{t("wallThermostats")}</span>
                      <span className="text-[var(--muted-foreground)]">({wallMembers.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {wallMembers.map((m) => (
                        <MemberCard
                          key={m.id}
                          member={m}
                          device={getMemberDevice(m)}
                          room={getDeviceRoom(getMemberDevice(m))}
                          icons={icons}
                          strings={strings}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Radiator Thermostats */}
                {radiatorMembers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
                      <Flame className="size-3.5 text-orange-500" />
                      <span>{t("radiatorThermostats")}</span>
                      <span className="text-[var(--muted-foreground)]">({radiatorMembers.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {radiatorMembers.map((m) => (
                        <MemberCard
                          key={m.id}
                          member={m}
                          device={getMemberDevice(m)}
                          room={getDeviceRoom(getMemberDevice(m))}
                          icons={icons}
                          strings={strings}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Window Sensors */}
                {windowMembers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
                      <DoorOpen className="size-3.5 text-blue-500" />
                      <span>{t("windowSensors")}</span>
                      <span className="text-[var(--muted-foreground)]">({windowMembers.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {windowMembers.map((m) => (
                        <MemberCard
                          key={m.id}
                          member={m}
                          device={getMemberDevice(m)}
                          room={getDeviceRoom(getMemberDevice(m))}
                          icons={icons}
                          strings={strings}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Switch Actuators / Underfloor */}
                {switchMembers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
                      <Zap className="size-3.5 text-amber-500" />
                      <span>{t("switchActuators")}</span>
                      <span className="text-[var(--muted-foreground)]">({switchMembers.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {switchMembers.map((m) => (
                        <MemberCard
                          key={m.id}
                          member={m}
                          device={getMemberDevice(m)}
                          room={getDeviceRoom(getMemberDevice(m))}
                          icons={icons}
                          strings={strings}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Other devices */}
                {otherMembers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
                      <Radio className="size-3.5 text-[var(--muted-foreground)]" />
                      <span>Weitere Geräte</span>
                      <span className="text-[var(--muted-foreground)]">({otherMembers.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {otherMembers.map((m) => (
                        <MemberCard
                          key={m.id}
                          member={m}
                          device={getMemberDevice(m)}
                          room={getDeviceRoom(getMemberDevice(m))}
                          icons={icons}
                          strings={strings}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Group Weekly Schedule & Master Paramsets */}
        {detailTab === "parameters" && selectedVirtualDevice && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Wochenprogramm & Gruppenparameter (MASTER)
            </h3>
            <DeviceParameters
              device={selectedVirtualDevice}
              sid={sid}
              mayChange={mayChange}
              strings={strings}
              onExpired={onExpired}
            />
          </div>
        )}
      </div>
    );
  }

  // ---- LIST VIEW ----
  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            {t("groupsTitle")}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted-foreground)]">
            {t("groupsSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRefreshSignal((s) => s + 1)}
            className="gap-2"
          >
            <RefreshCw className="size-3.5" />
            <span>{t("refresh")}</span>
          </Button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--muted-foreground)]" />
        <Input
          type="search"
          placeholder={t("filterGroups")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Grid of Heating Groups */}
      {filteredGroups.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-12 text-center text-sm text-[var(--muted-foreground)]">
          {t("noGroupsFound")}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGroups.map((group) => {
            const vDev = getVirtualDevice(group);
            const room = getDeviceRoom(vDev);
            const isHmIP = group.groupType.id.includes("hmip");

            const walls = group.groupMembers.filter((m) => categorizeMember(m) === "wall").length;
            const radiators = group.groupMembers.filter((m) => categorizeMember(m) === "radiator").length;
            const windows = group.groupMembers.filter((m) => categorizeMember(m) === "window").length;

            return (
              <a
                key={group.id}
                href={`#/groups/${group.id}`}
                className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs hover:border-[var(--primary)] hover:shadow-md transition-all cursor-pointer text-left space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 shrink-0 group-hover:bg-orange-500/20 transition-colors">
                        <Flame className="size-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors">
                          {group.groupProperties.NAME}
                        </h2>
                        {room && (
                          <span className="text-xs text-[var(--muted-foreground)]">{room}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="size-5 text-[var(--muted-foreground)] group-hover:translate-x-0.5 group-hover:text-[var(--primary)] transition-all shrink-0" />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        isHmIP
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                          : "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
                      }`}
                    >
                      {isHmIP ? "HmIP" : "Classic"}
                    </span>
                    <span className="text-[10px] font-mono bg-[var(--muted)] text-[var(--foreground)] px-2 py-0.5 rounded">
                      {vDev?.address || `INT${String(group.id).padStart(7, "0")}`}
                    </span>
                  </div>
                </div>

                <div className="border-t border-[var(--border)] pt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  {walls > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Thermometer className="size-3 text-orange-500" />
                      <span>{walls} Wandthermostat{walls > 1 ? "e" : ""}</span>
                    </span>
                  )}
                  {radiators > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Flame className="size-3 text-orange-500" />
                      <span>{radiators} Heizkörper</span>
                    </span>
                  )}
                  {windows > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <DoorOpen className="size-3 text-blue-500" />
                      <span>{windows} Fenster</span>
                    </span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemberCard({
  member,
  device,
  room,
  icons,
  strings,
}: {
  member: HeatingGroupMember;
  device?: Device;
  room: string | null;
  icons: Record<string, string>;
  strings: Record<string, string>;
}) {
  const iconUrl = device ? deviceIcon(device.type, icons) : null;
  const name = device ? text(device.name, strings) : member.id;
  const devType = device?.type || member.memberType.id;

  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3 hover:bg-[var(--muted)]/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {iconUrl ? (
          <img src={iconUrl} alt={devType} className="size-8 object-contain shrink-0" />
        ) : (
          <div className="grid size-8 place-items-center rounded bg-[var(--muted)] text-[var(--muted-foreground)] shrink-0">
            <Radio className="size-4" />
          </div>
        )}
        <div className="min-w-0 space-y-0.5">
          <div className="text-xs font-bold text-[var(--foreground)] truncate">{name}</div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
            <span className="font-mono">{member.id}</span>
            {room && <span>· {room}</span>}
          </div>
        </div>
      </div>

      {device && (
        <a
          href={`#/devices/${device.id}`}
          className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors shrink-0"
          title="Zum Gerät wechseln"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </div>
  );
}
