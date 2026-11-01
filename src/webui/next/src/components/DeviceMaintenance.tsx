import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeDevice,
  deleteDevice,
  describeChangeError,
  describeError,
  getDeviceDescription,
  getParamset,
  getRssiInfo,
  restoreConfigToDevice,
  updateDeviceFirmware,
  type Device,
  type DeviceDescription,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Battery,
  CheckCircle2,
  Cpu,
  HelpCircle,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  Wifi,
  WifiOff,
  Wrench,
  Zap,
} from "lucide-react";

interface DeviceMaintenanceProps {
  device: Device;
  allDevices: Device[];
  sid: string;
  mayChange: boolean;
  strings: Record<string, string>;
  onExpired: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
}

export function DeviceMaintenance({
  device,
  allDevices,
  sid,
  mayChange,
  strings,
  onExpired,
  onDeleted,
  onUpdated,
}: DeviceMaintenanceProps) {
  const { t } = useI18n();

  const [loading, setLoading] = React.useState(true);
  const [deviceDesc, setDeviceDesc] = React.useState<DeviceDescription | null>(null);
  const [channelZeroValues, setChannelZeroValues] = React.useState<Record<string, unknown> | null>(null);
  const [rssiPeerVal, setRssiPeerVal] = React.useState<number | null>(null);
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null);

  const [actionMessage, setActionMessage] = React.useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // In-flight action states
  const [refreshing, setRefreshing] = React.useState(false);
  const [restoringConfig, setRestoringConfig] = React.useState(false);
  const [firmwareUpdating, setFirmwareUpdating] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Modal states
  const [replaceModalOpen, setReplaceModalOpen] = React.useState(false);
  const [replacementTarget, setReplacementTarget] = React.useState("");
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [deleteFlag, setDeleteFlag] = React.useState<number>(1); // 1 = Reset, 2 = Force, 5 = Reset & Defer
  const [deleteConfirmed, setDeleteConfirmed] = React.useState(false);

  const loadData = React.useCallback(async () => {
    const startTime = performance.now();
    try {
      // 1. Fetch DeviceDescription
      let desc: DeviceDescription | null = null;
      try {
        desc = await getDeviceDescription(sid, device.interface, device.address);
      } catch (e) {
        console.warn("Failed to get device description:", e);
      }
      setDeviceDesc(desc);

      // 2. Fetch Channel 0 VALUES (Maintenance channel)
      let values: Record<string, unknown> | null = null;
      try {
        values = await getParamset(sid, device.interface, `${device.address}:0`, "VALUES");
      } catch (e) {
        console.warn("Failed to get channel 0 values:", e);
      }
      setChannelZeroValues(values);

      // 3. For BidCos devices without RSSI in channel 0, query rssiInfo
      if ((!values || typeof values.RSSI_DEVICE === "undefined") && device.interface === "BidCos-RF") {
        try {
          const rssiList = await getRssiInfo(sid, device.interface);
          const devRssi = rssiList.find((r) => r.name === device.address);
          if (devRssi && devRssi.partner.length > 0) {
            const firstPartner = devRssi.partner[0];
            if (firstPartner.rssiData) {
              setRssiPeerVal(firstPartner.rssiData[1]);
            }
          }
        } catch (e) {
          console.warn("Failed to get rssi info:", e);
        }
      }

      setLatencyMs(Math.round(performance.now() - startTime));
    } catch (err) {
      console.error("Maintenance load error:", err);
    } finally {
      setLoading(false);
    }
  }, [device.address, device.interface, sid]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh status button handler
  const handleRefresh = async () => {
    setRefreshing(true);
    setActionMessage(null);
    try {
      await loadData();
      setActionMessage({
        type: "success",
        text: latencyMs !== null ? `${t("maintenanceRefresh")} (${latencyMs} ms)` : t("maintenanceRefresh"),
      });
    } catch (err) {
      setActionMessage({ type: "error", text: describeChangeError(err, t) });
    } finally {
      setRefreshing(false);
    }
  };

  // Restore configuration handler
  const handleRestoreConfig = async () => {
    setRestoringConfig(true);
    setActionMessage(null);
    try {
      await restoreConfigToDevice(sid, device.interface, device.address);
      setActionMessage({ type: "success", text: t("maintenanceRestoreSuccess") });
      await loadData();
    } catch (err) {
      setActionMessage({ type: "error", text: describeChangeError(err, t) });
    } finally {
      setRestoringConfig(false);
    }
  };

  // Firmware update trigger
  const handleFirmwareUpdate = async () => {
    setFirmwareUpdating(true);
    setActionMessage(null);
    try {
      await updateDeviceFirmware(sid, device.interface, device.address);
      setActionMessage({ type: "success", text: t("maintenanceFwSuccess") });
      await loadData();
      onUpdated?.();
    } catch (err) {
      setActionMessage({ type: "error", text: describeChangeError(err, t) });
    } finally {
      setFirmwareUpdating(false);
    }
  };

  // Device replacement handler
  const handleReplaceDevice = async () => {
    if (!replacementTarget) return;
    setIsSubmitting(true);
    setActionMessage(null);
    try {
      await changeDevice(sid, device.interface, device.address, replacementTarget);
      setActionMessage({ type: "success", text: t("maintenanceReplaceSuccess") });
      setReplaceModalOpen(false);
      onUpdated?.();
    } catch (err) {
      setActionMessage({ type: "error", text: describeChangeError(err, t) });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete & Unpair handler
  const handleDeleteDevice = async () => {
    if (!deleteConfirmed) return;
    setIsSubmitting(true);
    setActionMessage(null);
    try {
      await deleteDevice(sid, device.interface, device.address, deleteFlag);
      setDeleteModalOpen(false);
      if (onDeleted) {
        onDeleted();
      }
    } catch (err) {
      setActionMessage({ type: "error", text: describeChangeError(err, t) });
      setIsSubmitting(false);
    }
  };

  // Derived values from Channel 0
  const unreach = channelZeroValues?.UNREACH === true || channelZeroValues?.UNREACH === 1;
  const configPending =
    channelZeroValues?.CONFIG_PENDING === true || channelZeroValues?.CONFIG_PENDING === 1;
  const lowBat =
    channelZeroValues?.LOW_BAT === true ||
    channelZeroValues?.LOW_BAT === 1 ||
    channelZeroValues?.LOWBAT === true ||
    channelZeroValues?.LOWBAT === 1;
  const dutyCycle =
    channelZeroValues?.DUTY_CYCLE === true || channelZeroValues?.DUTY_CYCLE === 1;

  const operatingVoltage =
    typeof channelZeroValues?.OPERATING_VOLTAGE === "number"
      ? channelZeroValues.OPERATING_VOLTAGE
      : null;

  // RSSI calculation
  const rssiDevice =
    typeof channelZeroValues?.RSSI_DEVICE === "number" && channelZeroValues.RSSI_DEVICE !== 65536
      ? channelZeroValues.RSSI_DEVICE
      : null;
  const rssiPeer =
    typeof channelZeroValues?.RSSI_PEER === "number" &&
    channelZeroValues.RSSI_PEER !== 65536 &&
    channelZeroValues.RSSI_PEER !== -191
      ? channelZeroValues.RSSI_PEER
      : rssiPeerVal;

  const rssiQuality = (val: number | null) => {
    if (val === null) return null;
    if (val >= -65) return { label: t("maintenanceRssiGood"), color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", bars: 4 };
    if (val >= -80) return { label: t("maintenanceRssiFair"), color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", bars: 3 };
    return { label: t("maintenanceRssiPoor"), color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20", bars: 1 };
  };

  const deviceQuality = rssiQuality(rssiDevice);

  // Firmware helpers
  const currentFw = deviceDesc?.firmware || "—";
  const availableFw = deviceDesc?.availableFirmware || null;
  const fwUpdateState = deviceDesc?.firmwareUpdateState || null;
  const isUpToDate = fwUpdateState === "UP_TO_DATE" || (!availableFw && fwUpdateState === null);
  const isDelivering =
    fwUpdateState === "DELIVER_FIRMWARE_IMAGE" || fwUpdateState === "LIVE_DELIVER_FIRMWARE_IMAGE";
  const isReadyForUpdate =
    fwUpdateState === "READY_FOR_UPDATE" || (Boolean(availableFw) && availableFw !== currentFw);

  // Filter candidate devices for replacement (same interface, not this device)
  const candidateDevices = React.useMemo(() => {
    return allDevices.filter(
      (d) => d.id !== device.id && d.interface === device.interface && d.type === device.type,
    );
  }, [allDevices, device.id, device.interface, device.type]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-[var(--muted-foreground)] space-y-3">
        <Loader2 className="size-6 animate-spin text-[var(--primary)]" />
        <span className="text-sm font-medium">{t("loading")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action result banner */}
      {actionMessage && (
        <div
          className={`flex items-start justify-between rounded-xl border p-4 text-sm ${
            actionMessage.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : actionMessage.type === "error"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionMessage.type === "success" ? (
              <CheckCircle2 className="size-5 shrink-0" />
            ) : actionMessage.type === "error" ? (
              <AlertTriangle className="size-5 shrink-0" />
            ) : (
              <Activity className="size-5 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">{t("maintenanceTitle")}</h2>
          <p className="text-xs sm:text-sm text-[var(--muted-foreground)]">{t("maintenanceHint")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2 shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          <span>{refreshing ? t("maintenanceRefreshing") : t("maintenanceRefresh")}</span>
        </Button>
      </div>

      {/* Section 1: Diagnostics & Connection */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-[var(--primary)]" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              {t("maintenanceDiagnostics")}
            </h3>
          </div>
          {latencyMs !== null && (
            <span className="text-xs text-[var(--muted-foreground)] font-mono">
              RTT: {latencyMs} ms
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Status: Reachable / Unreach */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3.5 space-y-1.5">
            <span className="text-xs text-[var(--muted-foreground)] font-medium">Verbindung</span>
            <div className="flex items-center gap-2">
              {unreach ? (
                <>
                  <WifiOff className="size-4 text-rose-500" />
                  <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                    {t("maintenanceUnreach")}
                  </span>
                </>
              ) : (
                <>
                  <Wifi className="size-4 text-emerald-500" />
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {t("maintenanceReachable")}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* RSSI Signal Device */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3.5 space-y-1.5">
            <span className="text-xs text-[var(--muted-foreground)] font-medium">
              {t("maintenanceRssiDevice")}
            </span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono font-bold text-[var(--foreground)]">
                {rssiDevice !== null ? `${rssiDevice} dBm` : t("maintenanceRssiUnknown")}
              </span>
              {deviceQuality && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${deviceQuality.bg} ${deviceQuality.color} ${deviceQuality.border}`}
                >
                  {deviceQuality.label}
                </span>
              )}
            </div>
          </div>

          {/* Configuration State */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3.5 space-y-1.5">
            <span className="text-xs text-[var(--muted-foreground)] font-medium">
              Konfigurationsstatus
            </span>
            <div className="flex items-center gap-2">
              {configPending ? (
                <>
                  <AlertTriangle className="size-4 text-amber-500" />
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 leading-tight">
                    {t("maintenanceConfigPending")}
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Synchronisiert
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Hardware & Battery */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3.5 space-y-1.5">
            <span className="text-xs text-[var(--muted-foreground)] font-medium">
              Hardware-Status
            </span>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {lowBat && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  <Battery className="size-3" />
                  <span>{t("maintenanceLowBat")}</span>
                </span>
              )}
              {dutyCycle && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  <Zap className="size-3" />
                  <span>{t("maintenanceDutyCycle")}</span>
                </span>
              )}
              {operatingVoltage !== null && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--foreground)] bg-[var(--card)] px-2 py-0.5 rounded border border-[var(--border)]">
                  <span>{operatingVoltage.toFixed(1)} V</span>
                </span>
              )}
              {!lowBat && !dutyCycle && operatingVoltage === null && (
                <span className="text-xs text-[var(--muted-foreground)]">Keine Besonderheiten</span>
              )}
            </div>
          </div>
        </div>

        {/* Restore Config Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted-foreground)]">
            Überträgt die gespeicherten Konfigurationsdaten erneut an das Gerät, wenn Einstellungen noch anstehen.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRestoreConfig}
            disabled={restoringConfig || !mayChange}
            className="gap-2 shrink-0 self-start sm:self-auto"
          >
            <Send className={`size-4 ${restoringConfig ? "animate-pulse" : ""}`} />
            <span>
              {restoringConfig ? t("maintenanceRestoring") : t("maintenanceRestoreConfig")}
            </span>
          </Button>
        </div>
      </div>

      {/* Section 2: Firmware & OTAU */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
          <Cpu className="size-4 text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {t("maintenanceFirmware")}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <span className="text-xs text-[var(--muted-foreground)]">
              {t("maintenanceCurrentFw")}
            </span>
            <div className="text-base font-mono font-bold text-[var(--foreground)]">{currentFw}</div>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-[var(--muted-foreground)]">
              {t("maintenanceAvailableFw")}
            </span>
            <div className="text-base font-mono font-bold text-[var(--foreground)]">
              {availableFw || "—"}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-[var(--muted-foreground)]">
              {t("maintenanceFwStatus")}
            </span>
            <div>
              {isUpToDate && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  <CheckCircle2 className="size-3.5" />
                  <span>{t("maintenanceFwUpToDate")}</span>
                </span>
              )}
              {isDelivering && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{t("maintenanceFwDelivering")}</span>
                </span>
              )}
              {isReadyForUpdate && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                  <AlertTriangle className="size-3.5" />
                  <span>{t("maintenanceFwReady")}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {isReadyForUpdate && (
          <div className="pt-2 border-t border-[var(--border)] flex justify-end">
            <Button
              type="button"
              onClick={handleFirmwareUpdate}
              disabled={firmwareUpdating || !mayChange}
              className="gap-2"
            >
              <Cpu className={`size-4 ${firmwareUpdating ? "animate-spin" : ""}`} />
              <span>
                {firmwareUpdating ? t("maintenanceFwUpdating") : t("maintenanceFwUpdateBtn")}
              </span>
            </Button>
          </div>
        )}
      </div>

      {/* Section 3: Device Replacement (Gerätetausch) */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
          <ArrowRightLeft className="size-4 text-[var(--primary)]" />
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {t("maintenanceReplace")}
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs sm:text-sm text-[var(--muted-foreground)] max-w-xl">
            {t("maintenanceReplaceDesc")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setReplaceModalOpen(true)}
            disabled={!mayChange}
            className="gap-2 shrink-0 self-start sm:self-auto"
          >
            <ArrowRightLeft className="size-4" />
            <span>{t("maintenanceReplaceBtn")}</span>
          </Button>
        </div>
      </div>

      {/* Section 4: Danger Zone (Ablernen & Löschen) */}
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-rose-500/20 pb-3">
          <Trash2 className="size-4 text-rose-500" />
          <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">
            {t("maintenanceDangerZone")}
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs sm:text-sm text-[var(--muted-foreground)] max-w-xl">
            {t("maintenanceDeleteDesc")}
          </p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              setDeleteConfirmed(false);
              setDeleteModalOpen(true);
            }}
            disabled={!mayChange}
            className="gap-2 shrink-0 self-start sm:self-auto"
          >
            <Trash2 className="size-4" />
            <span>{t("maintenanceDeleteBtn")}</span>
          </Button>
        </div>
      </div>

      {/* Modal: Device Replacement */}
      {replaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-[var(--foreground)]">
              {t("maintenanceReplaceTitle")}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              Wählen Sie das neu angelernte Gerät aus, auf das alle Einstellungen und Verknüpfungen übertragen werden sollen.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="replacement-select" className="text-xs font-semibold">
                {t("maintenanceReplaceSelect")}
              </Label>
              {candidateDevices.length > 0 ? (
                <select
                  id="replacement-select"
                  value={replacementTarget}
                  onChange={(e) => setReplacementTarget(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
                >
                  <option value="">— Bitte Gerät wählen —</option>
                  {candidateDevices.map((d) => (
                    <option key={d.id} value={d.address}>
                      {d.name} ({d.address})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-3 text-xs text-[var(--muted-foreground)]">
                  Keine kompatiblen Geräte vom Typ {device.type} auf {device.interface} gefunden. Bitte lernen Sie das neue Gerät zuerst an.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReplaceModalOpen(false)}
                disabled={isSubmitting}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleReplaceDevice}
                disabled={!replacementTarget || isSubmitting}
              >
                {isSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
                <span>{t("maintenanceReplaceSubmit")}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Unpair & Delete */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-xl border border-rose-500/30 bg-[var(--card)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-500">
              <Trash2 className="size-5" />
              <h3 className="text-base font-bold text-[var(--foreground)]">
                {t("maintenanceDeleteTitle")}
              </h3>
            </div>

            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
              {t("maintenanceDeleteConfirmWarning")}
            </div>

            <div className="space-y-3 pt-1">
              {/* Option 1: Factory Reset (Flag 1) */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)]/50 cursor-pointer">
                <input
                  type="radio"
                  name="delete-flag"
                  checked={deleteFlag === 1}
                  onChange={() => setDeleteFlag(1)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-[var(--foreground)]">
                    {t("maintenanceDeleteOptionReset")}
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {t("maintenanceDeleteOptionResetDesc")}
                  </div>
                </div>
              </label>

              {/* Option 2: Force CCU delete only (Flag 2) */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)]/50 cursor-pointer">
                <input
                  type="radio"
                  name="delete-flag"
                  checked={deleteFlag === 2}
                  onChange={() => setDeleteFlag(2)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-[var(--foreground)]">
                    {t("maintenanceDeleteOptionForce")}
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {t("maintenanceDeleteOptionForceDesc")}
                  </div>
                </div>
              </label>

              {/* Option 3: Reset on next transmission (Flag 5) */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)]/50 cursor-pointer">
                <input
                  type="radio"
                  name="delete-flag"
                  checked={deleteFlag === 5}
                  onChange={() => setDeleteFlag(5)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-[var(--foreground)]">
                    {t("maintenanceDeleteOptionDefer")}
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    {t("maintenanceDeleteOptionDeferDesc")}
                  </div>
                </div>
              </label>
            </div>

            {/* Checkbox confirmation */}
            <div className="pt-2 border-t border-[var(--border)]">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={deleteConfirmed}
                  onChange={(e) => setDeleteConfirmed(e.target.checked)}
                  className="size-4 rounded"
                />
                <span>{t("maintenanceDeleteConfirmCheck")}</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isSubmitting}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteDevice}
                disabled={!deleteConfirmed || isSubmitting}
              >
                {isSubmitting && <Loader2 className="size-4 animate-spin mr-2" />}
                <span>{t("maintenanceDeleteSubmit")}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
