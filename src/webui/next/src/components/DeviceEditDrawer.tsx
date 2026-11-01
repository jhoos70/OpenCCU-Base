import * as React from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { describeChangeError, saveDeviceConfig, type ChannelConfigDelta, type Device, type Room } from "@/lib/api";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Check, Loader2, X } from "lucide-react";

interface ChannelEditState {
  id: string;
  name: string;
  index: number;
  address: string;
  channelType: string;
  isLogged: boolean;
  isLogable: boolean;
  isAesAvailable: boolean;
  mode: "MODE_DEFAULT" | "MODE_AES";
  roomIds: string[];
  funcIds: string[];
}

interface DeviceEditDrawerProps {
  open: boolean;
  onClose: () => void;
  device: Device;
  allRooms: Room[];
  allFunctions: Room[];
  sid: string;
  onSaved: () => void;
  strings: Record<string, string>;
}

export function DeviceEditDrawer({
  open,
  onClose,
  device,
  allRooms,
  allFunctions,
  sid,
  onSaved,
  strings,
}: DeviceEditDrawerProps) {
  const { t } = useI18n();

  const [deviceName, setDeviceName] = React.useState(device.name);
  const [channels, setChannels] = React.useState<ChannelEditState[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Initialize or reset form state whenever open or device changes
  React.useEffect(() => {
    if (!open) return;
    setDeviceName(device.name);
    setError(null);

    const sortedChannels = [...device.channels].sort((a, b) => a.index - b.index);
    const initialChannels: ChannelEditState[] = sortedChannels.map((c) => ({
      id: c.id,
      name: c.name,
      index: c.index,
      address: c.address,
      channelType: c.channelType,
      isLogged: Boolean(c.isLogged),
      isLogable: c.isLogable !== false,
      isAesAvailable: Boolean(c.isAesAvailable),
      mode: c.mode === "MODE_AES" ? "MODE_AES" : "MODE_DEFAULT",
      roomIds: allRooms.filter((r) => r.channelIds.includes(c.id)).map((r) => r.id),
      funcIds: allFunctions.filter((f) => f.channelIds.includes(c.id)).map((f) => f.id),
    }));
    setChannels(initialChannels);
  }, [open, device, allRooms, allFunctions]);

  const toggleChannelRoom = (channelId: string, roomId: string) => {
    setChannels((prev) =>
      prev.map((ch) => {
        if (ch.id !== channelId) return ch;
        const exists = ch.roomIds.includes(roomId);
        const nextRooms = exists ? ch.roomIds.filter((id) => id !== roomId) : [...ch.roomIds, roomId];
        return { ...ch, roomIds: nextRooms };
      }),
    );
  };

  const toggleChannelFunction = (channelId: string, funcId: string) => {
    setChannels((prev) =>
      prev.map((ch) => {
        if (ch.id !== channelId) return ch;
        const exists = ch.funcIds.includes(funcId);
        const nextFuncs = exists ? ch.funcIds.filter((id) => id !== funcId) : [...ch.funcIds, funcId];
        return { ...ch, funcIds: nextFuncs };
      }),
    );
  };

  const updateChannelName = (channelId: string, name: string) => {
    setChannels((prev) => prev.map((ch) => (ch.id === channelId ? { ...ch, name } : ch)));
  };

  const toggleChannelLogging = (channelId: string) => {
    setChannels((prev) => prev.map((ch) => (ch.id === channelId ? { ...ch, isLogged: !ch.isLogged } : ch)));
  };

  const setChannelMode = (channelId: string, mode: "MODE_DEFAULT" | "MODE_AES") => {
    setChannels((prev) => prev.map((ch) => (ch.id === channelId ? { ...ch, mode } : ch)));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceName.trim()) {
      setError(t("errDeviceNameRequired"));
      return;
    }

    for (const ch of channels) {
      if (!ch.name.trim()) {
        setError(t("errChannelNameRequired"));
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    try {
      // Calculate changes
      const channelDeltas: ChannelConfigDelta[] = [];

      for (const ch of channels) {
        const origCh = device.channels.find((c) => c.id === ch.id);
        const origRoomIds = allRooms.filter((r) => r.channelIds.includes(ch.id)).map((r) => r.id);
        const origFuncIds = allFunctions.filter((f) => f.channelIds.includes(ch.id)).map((f) => f.id);

        const nameChanged = origCh && ch.name.trim() !== origCh.name;
        const loggingChanged = origCh && ch.isLogged !== Boolean(origCh.isLogged);
        const origMode = origCh?.mode === "MODE_AES" ? "MODE_AES" : "MODE_DEFAULT";
        const modeChanged = origCh && ch.mode !== origMode;

        const addRoomIds = ch.roomIds.filter((id) => !origRoomIds.includes(id));
        const removeRoomIds = origRoomIds.filter((id) => !ch.roomIds.includes(id));

        const addFuncIds = ch.funcIds.filter((id) => !origFuncIds.includes(id));
        const removeFuncIds = origFuncIds.filter((id) => !ch.funcIds.includes(id));

        if (
          nameChanged ||
          loggingChanged ||
          modeChanged ||
          addRoomIds.length > 0 ||
          removeRoomIds.length > 0 ||
          addFuncIds.length > 0 ||
          removeFuncIds.length > 0
        ) {
          channelDeltas.push({
            channelId: ch.id,
            name: nameChanged ? ch.name.trim() : undefined,
            isLogged: loggingChanged ? ch.isLogged : undefined,
            mode: modeChanged ? ch.mode : undefined,
            addRoomIds: addRoomIds.length > 0 ? addRoomIds : undefined,
            removeRoomIds: removeRoomIds.length > 0 ? removeRoomIds : undefined,
            addFuncIds: addFuncIds.length > 0 ? addFuncIds : undefined,
            removeFuncIds: removeFuncIds.length > 0 ? removeFuncIds : undefined,
          });
        }
      }

      const deviceNameChanged = deviceName.trim() !== device.name;

      if (deviceNameChanged || channelDeltas.length > 0) {
        await saveDeviceConfig(sid, {
          deviceId: device.id,
          name: deviceNameChanged ? deviceName.trim() : undefined,
          channels: channelDeltas.length > 0 ? channelDeltas : undefined,
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(describeChangeError(err, t));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 bg-[var(--card)] sticky top-0 z-10">
          <div>
            <SheetTitle className="text-lg font-bold text-[var(--foreground)]">{t("editDeviceTitle")}</SheetTitle>
            <p className="text-xs text-[var(--muted-foreground)]">
              {device.type} · <span className="font-mono">{device.address}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("cancel")}
            className="rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form Body */}
        <form id="device-edit-form" onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Device level settings */}
          <div className="space-y-2">
            <Label htmlFor="device-name-input" className="text-sm font-semibold text-[var(--foreground)]">
              {t("deviceName")}
            </Label>
            <Input
              id="device-name-input"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder={device.name}
              required
              disabled={isSaving}
              className="text-base"
            />
          </div>

          {/* Channels list */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                {t("deviceChannels")} ({channels.length})
              </h3>
            </div>

            <div className="space-y-4">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-2xs space-y-3.5 transition-colors"
                >
                  {/* Channel Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-[var(--muted)] px-2 py-0.5 text-xs font-semibold text-[var(--foreground)]">
                        {t("channelIndex", { index: ch.index })}
                      </span>
                      <span className="font-mono text-xs text-[var(--muted-foreground)]">{ch.channelType}</span>
                    </div>
                    <span className="font-mono text-xs text-[var(--muted-foreground)]">{ch.address}</span>
                  </div>

                  {/* Channel Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`ch-name-${ch.id}`} className="text-xs font-medium text-[var(--muted-foreground)]">
                      {t("channelName")}
                    </Label>
                    <Input
                      id={`ch-name-${ch.id}`}
                      value={ch.name}
                      onChange={(e) => updateChannelName(ch.id, e.target.value)}
                      placeholder={ch.name}
                      required
                      disabled={isSaving}
                    />
                  </div>

                  {/* Room Assignment Pills */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-[var(--muted-foreground)]">{t("rooms")}</Label>
                    {allRooms.length === 0 ? (
                      <p className="text-xs text-[var(--muted-foreground)]">{t("noRoomsAvailable")}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {allRooms.map((r) => {
                          const active = ch.roomIds.includes(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => toggleChannelRoom(ch.id, r.id)}
                              disabled={isSaving}
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors border ${
                                active
                                  ? "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)] font-medium shadow-2xs"
                                  : "bg-[var(--muted)]/60 text-[var(--muted-foreground)] border-transparent hover:border-[var(--border)] hover:text-[var(--foreground)]"
                              }`}
                            >
                              {active && <Check className="size-3 shrink-0" />}
                              <span>{text(r.name, strings)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Function Assignment Pills */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-[var(--muted-foreground)]">{t("functions")}</Label>
                    {allFunctions.length === 0 ? (
                      <p className="text-xs text-[var(--muted-foreground)]">{t("noFunctionsAvailable")}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {allFunctions.map((f) => {
                          const active = ch.funcIds.includes(f.id);
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => toggleChannelFunction(ch.id, f.id)}
                              disabled={isSaving}
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors border ${
                                active
                                  ? "bg-[var(--primary)]/15 text-[var(--primary)] border-[var(--primary)]/40 font-medium shadow-2xs"
                                  : "bg-[var(--muted)]/60 text-[var(--muted-foreground)] border-transparent hover:border-[var(--border)] hover:text-[var(--foreground)]"
                              }`}
                            >
                              {active && <Check className="size-3 shrink-0" />}
                              <span>{text(f.name, strings)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Channel options: Logging & Transmission Mode */}
                  {(ch.isLogable || ch.isAesAvailable) && (
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[var(--border)] text-xs">
                      {ch.isLogable && (
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={ch.isLogged}
                            onChange={() => toggleChannelLogging(ch.id)}
                            disabled={isSaving}
                            className="size-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                          />
                          <span className="font-medium text-[var(--foreground)]">{t("logging")}</span>
                        </label>
                      )}

                      {ch.isAesAvailable && (
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--muted-foreground)]">{t("transmissionMode")}:</span>
                          <select
                            value={ch.mode}
                            onChange={(e) => setChannelMode(ch.id, e.target.value as "MODE_DEFAULT" | "MODE_AES")}
                            disabled={isSaving}
                            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)] shadow-2xs"
                          >
                            <option value="MODE_DEFAULT">{t("modeDefault")}</option>
                            <option value="MODE_AES">{t("modeAes")}</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </form>

        {/* Sticky Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border)] px-6 py-4 bg-[var(--card)] sticky bottom-0 z-10">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="device-edit-form" disabled={isSaving} className="gap-2">
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            <span>{isSaving ? t("saving") : t("saveChanges")}</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
