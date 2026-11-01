import * as React from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeviceValues } from "@/components/DeviceValues";
import { TileBoard } from "@/components/TileBoard";
import type { Device, FavouriteItem } from "@/lib/api";
import { filterDevices, sortByName } from "@/lib/devices";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCurrentProfile } from "@/lib/profile-context";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { useModel } from "@/lib/use-model";
import type { ChannelInfo } from "@/lib/widgets";
import { Status } from "./Status";

/** An opened device: its channels as tiles (as in Rooms), and the technical tables one click away. */
function DeviceDetails({ device, sid, mayChange, strings, onExpired }: { device: Device; sid: string; mayChange: boolean; strings: Record<string, string>; onExpired: () => void }) {
  const { t } = useI18n();
  const [technical, setTechnical] = React.useState(false);
  const channels = React.useMemo(() => [...device.channels].sort((a, b) => a.index - b.index), [device]);
  const items = React.useMemo<FavouriteItem[]>(() => channels.map((c) => ({ id: c.id, type: "CHANNEL", name: c.name })), [channels]);
  const info = React.useMemo(() => new Map<string, ChannelInfo>(channels.map((c) => [c.id, { id: c.id, name: c.name, channelType: c.channelType, deviceId: device.id, deviceAddress: device.address }])), [channels, device]);
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

function DeviceRows({ device, description, open, onToggle, sid, mayChange, strings, onExpired }: { device: Device; description: string; open: boolean; onToggle: () => void; sid: string; mayChange: boolean; strings: Record<string, string>; onExpired: () => void }) {
  const { t } = useI18n();
  const channels = device.channels;
  return (
    <>
      <TableRow>
        <TableCell>
          <button
            type="button"
            className="flex items-start gap-2 text-left"
            aria-expanded={open}
            aria-label={t(open ? "hideChannels" : "showChannels", { name: device.name })}
            onClick={onToggle}
          >
            <span aria-hidden="true" className="w-3 text-[var(--muted-foreground)]">{open ? "▾" : "▸"}</span>
            <span>{device.name}</span>
          </button>
        </TableCell>
        <TableCell>
          <div>{device.type}</div>
          {description && <div className="text-xs text-[var(--muted-foreground)]">{description}</div>}
        </TableCell>
        <TableCell className="hidden sm:table-cell">{device.address}</TableCell>
        <TableCell className="hidden md:table-cell">{device.interface}</TableCell>
        <TableCell className="text-right">{channels.length}</TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={5} className="bg-[var(--background)]">
            <DeviceDetails device={device} sid={sid} mayChange={mayChange} strings={strings} onExpired={onExpired} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function Devices({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t, lang } = useI18n();
  const profile = useCurrentProfile();
  // a guest only looks, as in the classic UI
  const mayChange = profile?.level === "USER" || profile?.level === "ADMIN";
  const state = useModel("devices", sid, onExpired);
  const strings = useCcuStrings("deviceDescription", "extension", "stringtable");
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());
  const describe = React.useCallback((d: Device) => strings[d.type] ?? "", [strings]);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("devices")}</CardTitle>
        <CardDescription>{mayChange ? t("devicesControl") : t("readOnly")}</CardDescription>
      </div>
      <Status state={state}>
        {(devices) => {
          if (devices.items.length === 0) return <p className="text-sm text-[var(--muted-foreground)]">{t("noDevices")}</p>;
          const shown = sortByName(filterDevices(devices.items, query, describe), lang);
          return (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="device-filter">{t("filter")}</Label>
                <Input id="device-filter" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {shown.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">{t("noMatch")}</p>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>{t("name")}</TableHeader>
                      <TableHeader>{t("type")}</TableHeader>
                      <TableHeader className="hidden sm:table-cell">{t("address")}</TableHeader>
                      <TableHeader className="hidden md:table-cell">{t("interface")}</TableHeader>
                      <TableHeader className="text-right">{t("channels")}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <tbody>
                    {shown.map((d) => (
                      <DeviceRows key={d.id} device={{ ...d, name: text(d.name, strings) }} description={describe(d)} open={open.has(d.id)} onToggle={() => toggle(d.id)} sid={sid} mayChange={mayChange} strings={strings} onExpired={onExpired} />
                    ))}
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
    </Card>
  );
}
