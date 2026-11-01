import * as React from "react";
import {
  type ColumnDef,
  type FilterFn,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableColumnHeader, DataTableViewOptions } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { DeviceEditDrawer } from "@/components/DeviceEditDrawer";
import { DeviceParameters } from "@/components/DeviceParameters";
import { DeviceValues } from "@/components/DeviceValues";
import { TileBoard } from "@/components/TileBoard";
import { HealthBadges, type Health } from "@/components/tiles/TileShell";
import { getChannelValues, type Datapoint, type Device, type FavouriteItem } from "@/lib/api";
import { deviceIcon } from "@/lib/ccu-strings";
import { healthChannelIds } from "@/lib/devices";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCurrentProfile } from "@/lib/profile-context";
import { useCcuStrings, useDeviceIcons } from "@/lib/use-ccu-strings";
import { useModel } from "@/lib/use-model";
import { usePolled } from "@/lib/use-polled";
import { healthOf, type ChannelInfo } from "@/lib/widgets";
import { Status } from "./Status";
import { ArrowLeft, ExternalLink, LayoutGrid, Link2, Pencil, Radio, SlidersHorizontal, Wrench } from "lucide-react";

const HEALTH_MS = 10_000;
const STORAGE_KEY = "openccu.next.devices.columns";

/** An opened device: its channels as tiles (as in Rooms), and the technical tables one click away. */
function DeviceDetails({
  device,
  sid,
  mayChange,
  strings,
  onExpired,
}: {
  device: Device;
  sid: string;
  mayChange: boolean;
  strings: Record<string, string>;
  onExpired: () => void;
}) {
  const { t } = useI18n();
  const [technical, setTechnical] = React.useState(false);
  const channels = React.useMemo(() => [...device.channels].sort((a, b) => a.index - b.index), [device]);
  const items = React.useMemo<FavouriteItem[]>(() => channels.map((c) => ({ id: c.id, type: "CHANNEL", name: c.name })), [channels]);
  const info = React.useMemo(
    () =>
      new Map<string, ChannelInfo>(
        channels.map((c) => [c.id, { id: c.id, name: c.name, channelType: c.channelType, deviceId: device.id, deviceAddress: device.address }]),
      ),
    [channels, device],
  );
  return (
    <>
      <TileBoard items={items} info={info} sid={sid} mayChange={mayChange} strings={strings} refreshSignal={0} onExpired={onExpired} />
      <details className="mt-4" onToggle={(e) => setTechnical((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-sm">{t("technicalDetails")}</summary>
        {technical && (
          <div className="mt-2 space-y-4">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader className="w-16">{t("channelNumber")}</TableHeader>
                  <TableHeader>{t("name")}</TableHeader>
                  <TableHeader>{t("channelType")}</TableHeader>
                </TableRow>
              </TableHead>
              <tbody>
                {channels.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.index}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.channelType}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
            <DeviceValues deviceId={device.id} sid={sid} mayChange={mayChange} onExpired={onExpired} />
          </div>
        )}
      </details>
    </>
  );
}

function formatLastUpdated(ts: string | undefined, lang: string): string {
  if (!ts || ts.startsWith("1970") || ts.trim() === "") return "–";
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(ts);
  if (!m) return ts;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y, mo - 1, d, h, mi, s).toLocaleString(lang, { dateStyle: "short", timeStyle: "medium" });
}

interface DeviceTableRow {
  id: string;
  device: Device;
  name: string;
  type: string;
  description: string;
  icon?: string;
  health: Health;
  rooms: string[];
  funcs: string[];
  lastUpdated?: string;
  address: string;
  interface: string;
  channelCount: number;
}

const getDeviceIdFromHash = (): string | null => {
  const parts = window.location.hash.replace(/^#\/?/, "").split(/[\/?#]/);
  return parts[0] === "devices" && parts[1] ? decodeURIComponent(parts[1]) : null;
};

export default function Devices({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t, lang } = useI18n();
  const profile = useCurrentProfile();
  // a guest only looks, as in the classic UI
  const mayChange = profile?.level === "USER" || profile?.level === "ADMIN";
  const mayEdit = profile?.level === "ADMIN";

  const [refreshSignal, setRefreshSignal] = React.useState(0);
  const [editingDevice, setEditingDevice] = React.useState<Device | null>(null);
  const [activeTab, setActiveTab] = React.useState<"status" | "parameters" | "links" | "maintenance">("status");

  const state = useModel("devices", sid, onExpired, refreshSignal);
  const roomsState = useModel("rooms", sid, onExpired, refreshSignal);
  const functionsState = useModel("functions", sid, onExpired, refreshSignal);
  const strings = useCcuStrings("deviceDescription", "extension", "stringtable");
  const icons = useDeviceIcons();

  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(getDeviceIdFromHash);

  React.useEffect(() => {
    const handleHash = () => setSelectedDeviceId(getDeviceIdFromHash());
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "name", desc: false }]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {};
  });

  const handleColumnVisibilityChange = React.useCallback(
    (updaterOrValue: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setColumnVisibility((prev) => {
        const next = typeof updaterOrValue === "function" ? updaterOrValue(prev) : updaterOrValue;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [],
  );

  const describe = React.useCallback((d: Device) => strings[d.type] ?? "", [strings]);

  const roomMap = React.useMemo(() => {
    const map = new Map<string, string>();
    if (roomsState.status === "ready") {
      for (const r of roomsState.data.items) {
        map.set(r.id, text(r.name, strings));
      }
    }
    return map;
  }, [roomsState, strings]);

  const funcMap = React.useMemo(() => {
    const map = new Map<string, string>();
    if (functionsState.status === "ready") {
      for (const f of functionsState.data.items) {
        map.set(f.id, text(f.name, strings));
      }
    }
    return map;
  }, [functionsState, strings]);

  const chIds = React.useMemo(() => (state.status === "ready" ? healthChannelIds(state.data.items) : []), [state]);
  const chKey = chIds.join(",");
  const healthValues = usePolled(
    React.useCallback(() => (chIds.length ? getChannelValues(sid, chIds) : Promise.resolve([] as Datapoint[])), [sid, chKey]), // eslint-disable-line react-hooks/exhaustive-deps
    HEALTH_MS,
    onExpired,
  );
  const healthDps = healthValues.data ?? [];

  const toggle = React.useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  // Prepare table data rows
  const tableData = React.useMemo<DeviceTableRow[]>(() => {
    if (state.status !== "ready") return [];
    return state.data.items.map((d) => ({
      id: d.id,
      device: d,
      name: text(d.name, strings),
      type: d.type,
      description: describe(d),
      icon: deviceIcon(d.type, icons),
      health: healthOf(healthDps, d.address),
      rooms: (d.roomIds ?? []).map((id) => roomMap.get(id)).filter(Boolean) as string[],
      funcs: (d.funcIds ?? []).map((id) => funcMap.get(id)).filter(Boolean) as string[],
      lastUpdated: d.lastUpdated,
      address: d.address,
      interface: d.interface,
      channelCount: d.channels.length,
    }));
  }, [state, strings, describe, icons, healthDps, roomMap, funcMap]);

  // Column definitions
  const columns = React.useMemo<ColumnDef<DeviceTableRow>[]>(() => {
    return [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("name")} />,
        cell: ({ row }) => {
          const d = row.original;
          const isOpen = open.has(d.id);
          return (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-2 text-left"
                aria-expanded={isOpen}
                aria-label={t(isOpen ? "hideChannels" : "showChannels", { name: d.name })}
                onClick={() => toggle(d.id)}
              >
                <span aria-hidden="true" className="w-3 text-[var(--muted-foreground)]">
                  {isOpen ? "▾" : "▸"}
                </span>
                {d.icon && (
                  <img src={d.icon} alt="" aria-hidden="true" loading="lazy" className="h-9 w-9 shrink-0 rounded bg-white object-contain p-0.5" />
                )}
                <span>{d.name}</span>
              </button>
              <a
                href={`#/devices/${d.id}`}
                className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--primary)] transition-colors"
                title={`${t("deviceDetails")}: ${d.name}`}
                aria-label={`${t("deviceDetails")}: ${d.name}`}
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
              <HealthBadges health={d.health} />
            </div>
          );
        },
        enableHiding: false,
        sortingFn: (rowA, rowB, columnId) => {
          const valA = String(rowA.getValue(columnId) ?? "");
          const valB = String(rowB.getValue(columnId) ?? "");
          return valA.localeCompare(valB, lang, { numeric: true, sensitivity: "base" });
        },
      },
      {
        id: "type",
        accessorKey: "type",
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("type")} />,
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div>
              <div>{d.type}</div>
              {d.description && <div className="text-xs text-[var(--muted-foreground)]">{d.description}</div>}
            </div>
          );
        },
        enableHiding: true,
      },
      {
        id: "rooms",
        accessorFn: (row) => row.rooms.join(", "),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("rooms")} />,
        cell: ({ row }) => {
          const rooms = row.original.rooms;
          if (rooms.length === 0) return <span className="text-[var(--muted-foreground)]">–</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {rooms.map((r) => (
                <span key={r} className="inline-flex items-center rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs font-medium text-[var(--foreground)]">
                  {r}
                </span>
              ))}
            </div>
          );
        },
        meta: { className: "hidden sm:table-cell" },
        enableHiding: true,
      },
      {
        id: "functions",
        accessorFn: (row) => row.funcs.join(", "),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("functions")} />,
        cell: ({ row }) => {
          const funcs = row.original.funcs;
          if (funcs.length === 0) return <span className="text-[var(--muted-foreground)]">–</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {funcs.map((f) => (
                <span key={f} className="inline-flex items-center rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs font-medium text-[var(--foreground)]">
                  {f}
                </span>
              ))}
            </div>
          );
        },
        meta: { className: "hidden md:table-cell" },
        enableHiding: true,
      },
      {
        id: "lastUpdated",
        accessorKey: "lastUpdated",
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("lastUpdated")} />,
        cell: ({ row }) => (
          <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
            {formatLastUpdated(row.original.lastUpdated, lang)}
          </span>
        ),
        meta: { className: "hidden lg:table-cell" },
        enableHiding: true,
      },
      {
        id: "address",
        accessorKey: "address",
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("address")} />,
        cell: ({ row }) => row.original.address,
        meta: { className: "hidden xl:table-cell" },
        enableHiding: true,
      },
      {
        id: "interface",
        accessorKey: "interface",
        header: ({ column }) => <DataTableColumnHeader column={column} title={t("interface")} />,
        cell: ({ row }) => row.original.interface,
        meta: { className: "hidden 2xl:table-cell" },
        enableHiding: true,
      },
      {
        id: "channels",
        accessorKey: "channelCount",
        header: ({ column }) => (
          <div className="text-right">
            <DataTableColumnHeader column={column} title={t("channels")} className="justify-end" />
          </div>
        ),
        cell: ({ row }) => <div className="text-right">{row.original.channelCount}</div>,
        meta: { className: "text-right" },
        enableHiding: true,
      },
      ...(mayEdit
        ? [
            {
              id: "actions",
              header: () => null,
              cell: ({ row }: { row: { original: DeviceTableRow } }) => (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingDevice(row.original.device);
                    }}
                    title={t("editDevice")}
                    aria-label={t("editDevice")}
                    className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <Pencil className="size-4" />
                  </button>
                </div>
              ),
              meta: { className: "w-10 text-right" },
              enableHiding: false,
            } as ColumnDef<DeviceTableRow>,
          ]
        : []),
    ];
  }, [t, lang, open, toggle, mayEdit]);

  const columnLabels = React.useMemo<Record<string, string>>(
    () => ({
      name: t("name"),
      type: t("type"),
      rooms: t("rooms"),
      functions: t("functions"),
      lastUpdated: t("lastUpdated"),
      address: t("address"),
      interface: t("interface"),
      channels: t("channels"),
    }),
    [t],
  );

  const globalFilterFn = React.useCallback<FilterFn<DeviceTableRow>>((row, _columnId, filterValue: string) => {
    const words = filterValue.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const d = row.original;
    const hay = `${d.name} ${d.type} ${d.description} ${d.address} ${d.interface} ${d.rooms.join(" ")} ${d.funcs.join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  }, []);

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      globalFilter: query,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuery,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (selectedDeviceId) {
    if (state.status === "loading") {
      return (
        <div className="space-y-4">
          <a
            href="#/devices"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs sm:text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors shadow-2xs"
          >
            <ArrowLeft className="size-4" />
            <span>{t("backToDevices")}</span>
          </a>
          <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>
        </div>
      );
    }
    if (state.status === "ready") {
      const selectedDevice = state.data.items.find((d) => d.id === selectedDeviceId || d.address === selectedDeviceId);
      if (!selectedDevice) {
        return (
          <div className="space-y-4">
            <a
              href="#/devices"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs sm:text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors shadow-2xs"
            >
              <ArrowLeft className="size-4" />
              <span>{t("backToDevices")}</span>
            </a>
            <p className="text-sm text-[var(--muted-foreground)]">{t("deviceNotFound")}</p>
          </div>
        );
      }

      const devName = text(selectedDevice.name, strings);
      const devDesc = describe(selectedDevice);
      const devIcon = deviceIcon(selectedDevice.type, icons);
      const devHealth = healthOf(healthDps, selectedDevice.address);
      const devRooms = (selectedDevice.roomIds ?? []).map((id) => roomMap.get(id)).filter(Boolean) as string[];
      const devFuncs = (selectedDevice.funcIds ?? []).map((id) => funcMap.get(id)).filter(Boolean) as string[];

      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <a
              href="#/devices"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs sm:text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors shadow-2xs"
            >
              <ArrowLeft className="size-4" />
              <span>{t("backToDevices")}</span>
            </a>
          </div>

          <Card className="p-5 sm:p-6 space-y-4 shadow-sm border border-[var(--border)] bg-[var(--card)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                {devIcon ? (
                  <img
                    src={devIcon}
                    alt=""
                    aria-hidden="true"
                    className="size-12 sm:size-14 shrink-0 rounded-lg bg-white object-contain p-1 border border-[var(--border)] shadow-2xs"
                  />
                ) : (
                  <div className="flex size-12 sm:size-14 shrink-0 items-center justify-center rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)]">
                    <Radio className="size-6" />
                  </div>
                )}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">{devName}</h1>
                    <HealthBadges health={devHealth} />
                  </div>
                  {devDesc && <p className="text-sm text-[var(--muted-foreground)]">{devDesc}</p>}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[var(--muted-foreground)]">
                    <span className="font-mono bg-[var(--muted)] px-2 py-0.5 rounded text-[var(--foreground)] font-medium">
                      {selectedDevice.type}
                    </span>
                    <span className="font-mono bg-[var(--muted)] px-2 py-0.5 rounded text-[var(--foreground)] font-medium">
                      {selectedDevice.address}
                    </span>
                    <span>{selectedDevice.interface}</span>
                    {selectedDevice.lastUpdated && (
                      <span>· {formatLastUpdated(selectedDevice.lastUpdated, lang)}</span>
                    )}
                  </div>
                </div>
              </div>
              {mayEdit && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingDevice(selectedDevice)}
                  className="self-start sm:self-center gap-1.5 shrink-0"
                >
                  <Pencil className="size-4" />
                  <span>{t("editDevice")}</span>
                </Button>
              )}
            </div>

            {(devRooms.length > 0 || devFuncs.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]">
                {devRooms.map((r) => (
                  <span
                    key={r}
                    className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]"
                  >
                    {r}
                  </span>
                ))}
                {devFuncs.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--muted-foreground)]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto pb-px">
            <button
              type="button"
              onClick={() => setActiveTab("status")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
                activeTab === "status"
                  ? "border-[var(--primary)] text-[var(--primary)] font-semibold"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <LayoutGrid className="size-4" />
              <span>{t("tabStatus")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("parameters")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
                activeTab === "parameters"
                  ? "border-[var(--primary)] text-[var(--primary)] font-semibold"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <SlidersHorizontal className="size-4" />
              <span>{t("tabParameters")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("links")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors shrink-0 ${
                activeTab === "links"
                  ? "border-[var(--primary)] text-[var(--primary)] font-semibold"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <Link2 className="size-4" />
              <span>{t("tabLinks")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("maintenance")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors shrink-0 ${
                activeTab === "maintenance"
                  ? "border-[var(--primary)] text-[var(--primary)] font-semibold"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <Wrench className="size-4" />
              <span>{t("tabMaintenance")}</span>
            </button>
          </div>

          {/* Tab 1: Status & Control */}
          {activeTab === "status" && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                {t("deviceChannels")} ({selectedDevice.channels.length})
              </h2>
              <DeviceDetails
                device={selectedDevice}
                sid={sid}
                mayChange={mayChange}
                strings={strings}
                onExpired={onExpired}
              />
            </div>
          )}

          {/* Tab 2: Parameters & Settings (MASTER) */}
          {activeTab === "parameters" && (
            <DeviceParameters
              device={selectedDevice}
              sid={sid}
              mayChange={mayEdit}
              strings={strings}
              onExpired={onExpired}
            />
          )}

          {/* Tab 3: Direct Links (Placeholder for Phase 2b) */}
          {activeTab === "links" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center space-y-3">
              <Link2 className="size-8 mx-auto text-[var(--muted-foreground)] opacity-50" />
              <h3 className="text-base font-semibold text-[var(--foreground)]">{t("tabLinks")}</h3>
              <p className="text-sm text-[var(--muted-foreground)] max-w-md mx-auto">{t("directLinksPlaceholder")}</p>
            </div>
          )}

          {/* Tab 4: Maintenance (Placeholder for Phase 2c) */}
          {activeTab === "maintenance" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center space-y-3">
              <Wrench className="size-8 mx-auto text-[var(--muted-foreground)] opacity-50" />
              <h3 className="text-base font-semibold text-[var(--foreground)]">{t("tabMaintenance")}</h3>
              <p className="text-sm text-[var(--muted-foreground)] max-w-md mx-auto">{t("maintenancePlaceholder")}</p>
            </div>
          )}

          {editingDevice && (
            <DeviceEditDrawer
              open={Boolean(editingDevice)}
              onClose={() => setEditingDevice(null)}
              device={editingDevice}
              allRooms={roomsState.status === "ready" ? roomsState.data.items : []}
              allFunctions={functionsState.status === "ready" ? functionsState.data.items : []}
              sid={sid}
              onSaved={() => setRefreshSignal((s) => s + 1)}
              strings={strings}
            />
          )}
        </div>
      );
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("devices")}</CardTitle>
        <CardDescription>{mayChange ? t("devicesControl") : t("readOnly")}</CardDescription>
      </div>
      <Status state={state}>
        {(devices) => {
          if (devices.items.length === 0) return <p className="text-sm text-[var(--muted-foreground)]">{t("noDevices")}</p>;
          const rows = table.getRowModel().rows;
          return (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex-1 max-w-md space-y-1.5">
                  <Label htmlFor="device-filter">{t("filter")}</Label>
                  <Input id="device-filter" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <DataTableViewOptions table={table} columnLabels={columnLabels} />
                </div>
              </div>
              {rows.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">{t("noMatch")}</p>
              ) : (
                <Table>
                  <TableHead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                          const metaClass = (header.column.columnDef.meta as { className?: string } | undefined)?.className;
                          return (
                            <TableHeader key={header.id} className={metaClass}>
                              {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHeader>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableHead>
                  <tbody>
                    {rows.map((row) => {
                      const isOpen = open.has(row.original.id);
                      return (
                        <React.Fragment key={row.original.id}>
                          <TableRow>
                            {row.getVisibleCells().map((cell) => {
                              const metaClass = (cell.column.columnDef.meta as { className?: string } | undefined)?.className;
                              return (
                                <TableCell key={cell.id} className={metaClass}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                          {isOpen && (
                            <TableRow>
                              <TableCell colSpan={row.getVisibleCells().length} className="bg-[var(--background)]">
                                <DeviceDetails
                                  device={row.original.device}
                                  sid={sid}
                                  mayChange={mayChange}
                                  strings={strings}
                                  onExpired={onExpired}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </Table>
              )}
              {devices.total > devices.items.length && (
                <p className="text-sm text-[var(--muted-foreground)]">{t("showingOf", { shown: devices.items.length, total: devices.total })}</p>
              )}
            </>
          );
        }}
      </Status>

      {editingDevice && (
        <DeviceEditDrawer
          open={Boolean(editingDevice)}
          onClose={() => setEditingDevice(null)}
          device={editingDevice}
          allRooms={roomsState.status === "ready" ? roomsState.data.items : []}
          allFunctions={functionsState.status === "ready" ? functionsState.data.items : []}
          sid={sid}
          onSaved={() => setRefreshSignal((s) => s + 1)}
          strings={strings}
        />
      )}
    </Card>
  );
}
