import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addDeviceLink,
  describeChangeError,
  describeError,
  getDeviceLinks,
  removeDeviceLink,
  setDeviceLinkInfo,
  type Device,
  type DeviceLink,
  type Room,
} from "@/lib/api";
import { deviceIcon } from "@/lib/ccu-strings";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  ArrowRight,
  ExternalLink,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

interface DeviceLinksProps {
  device: Device;
  allDevices: Device[];
  allRooms: Room[];
  sid: string;
  mayChange: boolean;
  strings: Record<string, string>;
  icons: Record<string, string>;
  onExpired: () => void;
}

export function DeviceLinks({
  device,
  allDevices,
  allRooms,
  sid,
  mayChange,
  strings,
  icons,
  onExpired,
}: DeviceLinksProps) {
  const { t } = useI18n();

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [links, setLinks] = React.useState<DeviceLink[]>([]);

  // Modals state
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [editingLink, setEditingLink] = React.useState<DeviceLink | null>(null);
  const [deletingLink, setDeletingLink] = React.useState<DeviceLink | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Form states for Create Link
  const [createSender, setCreateSender] = React.useState<string>("");
  const [createReceiver, setCreateReceiver] = React.useState<string>("");
  const [createName, setCreateName] = React.useState<string>("");
  const [createDesc, setCreateDesc] = React.useState<string>("");

  // Form states for Edit Link
  const [editName, setEditName] = React.useState<string>("");
  const [editDesc, setEditDesc] = React.useState<string>("");

  const roomMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allRooms) {
      map.set(r.id, text(r.name, strings));
    }
    return map;
  }, [allRooms, strings]);

  // Address resolver
  const resolveAddress = React.useCallback(
    (addr: string) => {
      for (const d of allDevices) {
        for (const c of d.channels) {
          if (c.address === addr) {
            const devRooms = (d.roomIds ?? []).map((id) => roomMap.get(id)).filter(Boolean) as string[];
            return {
              device: d,
              channel: c,
              name: text(c.name, strings),
              deviceName: text(d.name, strings),
              icon: deviceIcon(d.type, icons),
              rooms: devRooms,
            };
          }
        }
      }
      return null;
    },
    [allDevices, roomMap, strings, icons],
  );

  // Load links for all channels of the device
  const loadLinks = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const channelAddresses = device.channels.map((c) => c.address);
      if (channelAddresses.length === 0) {
        channelAddresses.push(device.address);
      }

      // Query links for all channels in parallel
      const results = await Promise.all(
        channelAddresses.map((addr) =>
          getDeviceLinks(sid, device.interface, addr).catch(() => [] as DeviceLink[]),
        ),
      );

      // Deduplicate links by sender + receiver
      const seen = new Set<string>();
      const combined: DeviceLink[] = [];
      for (const list of results) {
        for (const l of list) {
          const key = `${l.sender}->${l.receiver}`;
          if (!seen.has(key)) {
            seen.add(key);
            combined.push(l);
          }
        }
      }

      setLinks(combined);
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setLoading(false);
    }
  }, [device, sid, t]);

  React.useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  // Handle Delete Link
  const handleDelete = async () => {
    if (!deletingLink) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await removeDeviceLink(sid, device.interface, deletingLink.sender, deletingLink.receiver);
      setDeletingLink(null);
      loadLinks();
    } catch (err) {
      setActionError(describeChangeError(err, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Link Info
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLink) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await setDeviceLinkInfo(
        sid,
        device.interface,
        editingLink.sender,
        editingLink.receiver,
        editName.trim(),
        editDesc.trim(),
      );
      setEditingLink(null);
      loadLinks();
    } catch (err) {
      setActionError(describeChangeError(err, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Compatible channels on same interface for New Link
  const sameInterfaceDevices = React.useMemo(() => {
    return allDevices.filter((d) => d.interface === device.interface);
  }, [allDevices, device.interface]);

  const allAvailableChannels = React.useMemo(() => {
    const list: { address: string; label: string; deviceName: string; type: string }[] = [];
    for (const d of sameInterfaceDevices) {
      for (const c of d.channels) {
        if (c.index === 0) continue; // skip maintenance channels
        list.push({
          address: c.address,
          label: `${text(d.name, strings)}: ${text(c.name, strings)} (${c.address})`,
          deviceName: text(d.name, strings),
          type: c.channelType,
        });
      }
    }
    return list;
  }, [sameInterfaceDevices, strings]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createSender || !createReceiver) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await addDeviceLink(
        sid,
        device.interface,
        createSender,
        createReceiver,
        createName.trim(),
        createDesc.trim(),
      );
      setShowCreateModal(false);
      setCreateSender("");
      setCreateReceiver("");
      setCreateName("");
      setCreateDesc("");
      loadLinks();
    } catch (err) {
      setActionError(describeChangeError(err, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Create Dialog initialized with device's first channel
  const openCreateDialog = () => {
    const firstCh = device.channels.find((c) => c.index > 0) ?? device.channels[0];
    setCreateSender(firstCh ? firstCh.address : "");
    setCreateReceiver("");
    setCreateName("");
    setCreateDesc("");
    setActionError(null);
    setShowCreateModal(true);
  };

  return (
    <div className="space-y-5">
      {/* Header Info & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--foreground)]">{t("linksTitle")}</h3>
          <p className="text-xs text-[var(--muted-foreground)]">{t("linksHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadLinks}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{t("refresh")}</span>
          </Button>
          {mayChange && (
            <Button type="button" size="sm" onClick={openCreateDialog} className="gap-1.5">
              <Plus className="size-4" />
              <span>{t("createLink")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center p-12 text-[var(--muted-foreground)]">
          <Loader2 className="size-6 animate-spin mr-2" />
          <span className="text-sm">{t("loading")}</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && links.length === 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center space-y-3">
          <Link2 className="size-8 mx-auto text-[var(--muted-foreground)] opacity-50" />
          <h4 className="text-sm font-semibold text-[var(--foreground)]">{t("noLinksFound")}</h4>
          <p className="text-xs text-[var(--muted-foreground)] max-w-sm mx-auto">
            Verknüpfen Sie Taster, Fensterkontakte oder Thermostate direkt mit Aktoren für schnellste Reaktionszeiten.
          </p>
          {mayChange && (
            <Button type="button" size="sm" onClick={openCreateDialog} className="gap-1.5 mt-2">
              <Plus className="size-4" />
              <span>{t("createLink")}</span>
            </Button>
          )}
        </div>
      )}

      {/* Links List */}
      {!loading && !error && links.length > 0 && (
        <div className="space-y-4">
          {links.map((link) => {
            const isOutgoing = device.channels.some((c) => c.address === link.sender);
            const senderInfo = resolveAddress(link.sender);
            const receiverInfo = resolveAddress(link.receiver);

            return (
              <div
                key={`${link.sender}->${link.receiver}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-2xs space-y-4 hover:border-[var(--primary)]/40 transition-colors"
              >
                {/* Top: Name, Direction Badge, Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isOutgoing
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "bg-[var(--primary)]/15 text-[var(--primary)]"
                      }`}
                    >
                      {isOutgoing ? t("outgoing") : t("incoming")}
                    </span>
                    <h4 className="text-sm font-bold text-[var(--foreground)]">
                      {link.name || `${link.sender} ↔ ${link.receiver}`}
                    </h4>
                  </div>

                  {mayChange && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLink(link);
                          setEditName(link.name);
                          setEditDesc(link.description);
                          setActionError(null);
                        }}
                        className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                        title={t("editLink")}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingLink(link);
                          setActionError(null);
                        }}
                        className="rounded-md p-1.5 text-red-500/80 hover:bg-red-500/10 hover:text-red-600 transition-colors"
                        title={t("deleteLink")}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Description if present */}
                {link.description && (
                  <p className="text-xs text-[var(--muted-foreground)] -mt-2">
                    {text(link.description, strings)}
                  </p>
                )}

                {/* Sender -> Receiver Flow */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] items-center gap-4 pt-1">
                  {/* Sender Box */}
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      {senderInfo?.icon ? (
                        <img
                          src={senderInfo.icon}
                          alt=""
                          className="size-8 shrink-0 rounded bg-white object-contain p-0.5 border border-[var(--border)]"
                        />
                      ) : (
                        <Radio className="size-5 text-[var(--muted-foreground)] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--foreground)] truncate">
                          {senderInfo ? senderInfo.deviceName : link.sender}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] truncate">
                          {senderInfo ? senderInfo.name : link.sender}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-[var(--muted-foreground)]">
                      <span className="font-mono bg-[var(--muted)] px-1.5 py-0.5 rounded">
                        {link.sender}
                      </span>
                      {senderInfo?.rooms.map((r) => (
                        <span
                          key={r}
                          className="rounded-full bg-[var(--accent-soft)] px-2 py-0.2 text-[10px] text-[var(--accent)] font-medium"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Flow Arrow */}
                  <div className="flex justify-center text-[var(--muted-foreground)] py-1 md:py-0">
                    <ArrowRight className="size-5" />
                  </div>

                  {/* Receiver Box */}
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      {receiverInfo?.icon ? (
                        <img
                          src={receiverInfo.icon}
                          alt=""
                          className="size-8 shrink-0 rounded bg-white object-contain p-0.5 border border-[var(--border)]"
                        />
                      ) : (
                        <Radio className="size-5 text-[var(--muted-foreground)] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--foreground)] truncate">
                          {receiverInfo ? receiverInfo.deviceName : link.receiver}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] truncate">
                          {receiverInfo ? receiverInfo.name : link.receiver}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-[var(--muted-foreground)]">
                      <span className="font-mono bg-[var(--muted)] px-1.5 py-0.5 rounded">
                        {link.receiver}
                      </span>
                      {receiverInfo?.rooms.map((r) => (
                        <span
                          key={r}
                          className="rounded-full bg-[var(--accent-soft)] px-2 py-0.2 text-[10px] text-[var(--accent)] font-medium"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Receiver Paramset values preview if present */}
                {link.receiverParamset && Object.keys(link.receiverParamset).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                    {Object.entries(link.receiverParamset).map(([k, v]) => (
                      <span key={k} className="rounded bg-[var(--muted)] px-2 py-0.5 font-mono text-[11px]">
                        {k}: <span className="font-semibold text-[var(--foreground)]">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create Direct Link */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold text-[var(--foreground)]">{t("createLink")}</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {actionError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                  {actionError}
                </div>
              )}

              {/* Sender Channel */}
              <div className="space-y-1.5">
                <Label htmlFor="create-sender" className="text-xs font-semibold">
                  {t("sender")} ({device.name})
                </Label>
                <select
                  id="create-sender"
                  value={createSender}
                  onChange={(e) => setCreateSender(e.target.value)}
                  required
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] shadow-2xs"
                >
                  {device.channels.map((c) => (
                    <option key={c.address} value={c.address}>
                      {text(c.name, strings)} ({c.address}) · {c.channelType}
                    </option>
                  ))}
                </select>
              </div>

              {/* Receiver Channel */}
              <div className="space-y-1.5">
                <Label htmlFor="create-receiver" className="text-xs font-semibold">
                  {t("receiver")} ({device.interface})
                </Label>
                <select
                  id="create-receiver"
                  value={createReceiver}
                  onChange={(e) => setCreateReceiver(e.target.value)}
                  required
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] shadow-2xs"
                >
                  <option value="" disabled>
                    -- {t("selectPartner")} --
                  </option>
                  {allAvailableChannels
                    .filter((c) => c.address !== createSender)
                    .map((c) => (
                      <option key={c.address} value={c.address}>
                        {c.label} · {c.type}
                      </option>
                    ))}
                </select>
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="create-name" className="text-xs font-semibold">
                  {t("linkName")}
                </Label>
                <Input
                  id="create-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="z.B. Taster Licht Flur"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="create-desc" className="text-xs font-semibold">
                  {t("linkDescription")}
                </Label>
                <Input
                  id="create-desc"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="Optionale Beschreibung"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting || !createSender || !createReceiver}>
                  {isSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
                  <span>{t("createLink")}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Link Info */}
      {editingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-bold text-[var(--foreground)]">{t("editLink")}</h3>
              <button
                type="button"
                onClick={() => setEditingLink(null)}
                className="rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {actionError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                  {actionError}
                </div>
              )}

              <p className="text-xs font-mono text-[var(--muted-foreground)]">
                {editingLink.sender} ➔ {editingLink.receiver}
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-xs font-semibold">
                  {t("linkName")}
                </Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-desc" className="text-xs font-semibold">
                  {t("linkDescription")}
                </Label>
                <Input
                  id="edit-desc"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingLink(null)}
                  disabled={isSubmitting}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
                  <span>{t("saveChanges")}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Link */}
      {deletingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[var(--foreground)]">{t("deleteLink")}</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              {t("deleteLinkConfirm", {
                sender: deletingLink.sender,
                receiver: deletingLink.receiver,
              })}
            </p>

            {actionError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeletingLink(null)}
                disabled={isSubmitting}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
                <span>{t("deleteLink")}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
