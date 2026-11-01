import * as React from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  describeChangeError,
  describeError,
  getParamset,
  getParamsetDescription,
  putParamset,
  xmlRpcTypeFor,
  type Device,
  type ParamDescription,
  type Paramset,
  type PutParamsetItem,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Check, Info, Loader2, RefreshCw, RotateCcw, Search, SlidersHorizontal } from "lucide-react";

interface DeviceParametersProps {
  device: Device;
  sid: string;
  mayChange: boolean;
  strings: Record<string, string>;
  onExpired: () => void;
}

interface TargetItem {
  key: string;
  label: string;
  address: string;
  isDevice: boolean;
}

export function DeviceParameters({
  device,
  sid,
  mayChange,
  strings,
  onExpired,
}: DeviceParametersProps) {
  const { t } = useI18n();

  // All targets: the device itself and its channels
  const targets = React.useMemo<TargetItem[]>(() => {
    const list: TargetItem[] = [
      {
        key: `dev-${device.address}`,
        label: t("deviceBase"),
        address: device.address,
        isDevice: true,
      },
    ];
    const sorted = [...device.channels].sort((a, b) => a.index - b.index);
    for (const c of sorted) {
      list.push({
        key: `ch-${c.id}`,
        label: `${t("channelIndex", { index: c.index })}: ${c.name}`,
        address: c.address,
        isDevice: false,
      });
    }
    return list;
  }, [device, t]);

  const [selectedKey, setSelectedKey] = React.useState<string>(targets[0]?.key ?? "");
  const currentTarget = targets.find((t) => t.key === selectedKey) ?? targets[0];

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState<ParamDescription[]>([]);
  const [initialValues, setInitialValues] = React.useState<Paramset>({});
  const [values, setValues] = React.useState<Paramset>({});
  const [query, setQuery] = React.useState("");

  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Fetch paramset & description when target changes
  const loadParams = React.useCallback(async () => {
    if (!currentTarget) return;
    setLoading(true);
    setError(null);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const [desc, vals] = await Promise.all([
        getParamsetDescription(sid, device.interface, currentTarget.address, "MASTER"),
        getParamset(sid, device.interface, currentTarget.address, "MASTER"),
      ]);

      // Filter visible parameters (FLAGS & 1 !== 0, default visible if flags missing)
      const visibleDesc = desc.filter((p) => {
        const flags = Number(p.FLAGS);
        return isNaN(flags) || (flags & 1) !== 0;
      });

      // Sort by TAB_ORDER if present, else by NAME
      visibleDesc.sort((a, b) => {
        const orderA = a.TAB_ORDER !== undefined ? Number(a.TAB_ORDER) : 9999;
        const orderB = b.TAB_ORDER !== undefined ? Number(b.TAB_ORDER) : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return a.NAME.localeCompare(b.NAME);
      });

      setDescription(visibleDesc);
      setInitialValues(vals);
      setValues(vals);
    } catch (err) {
      // Daemon might report no paramset for this address
      setError(describeError(err, t));
    } finally {
      setLoading(false);
    }
  }, [currentTarget, device.interface, sid, t]);

  React.useEffect(() => {
    loadParams();
  }, [loadParams]);

  // Track modified parameters
  const dirtyKeys = React.useMemo(() => {
    const dirty = new Set<string>();
    for (const p of description) {
      const initial = initialValues[p.NAME];
      const current = values[p.NAME];
      if (initial !== undefined && current !== undefined && String(initial) !== String(current)) {
        dirty.add(p.NAME);
      }
    }
    return dirty;
  }, [description, initialValues, values]);

  const handleValueChange = (name: string, val: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [name]: val }));
    setSaveSuccess(false);
    setSaveError(null);
  };

  const handleRevert = () => {
    setValues(initialValues);
    setSaveSuccess(false);
    setSaveError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dirtyKeys.size === 0 || !currentTarget) return;

    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      const items: PutParamsetItem[] = [];
      for (const name of dirtyKeys) {
        const pDesc = description.find((p) => p.NAME === name);
        if (!pDesc) continue;
        const type = xmlRpcTypeFor(pDesc.TYPE);
        let valStr = String(values[name]);
        if (pDesc.TYPE.toUpperCase() === "BOOL") {
          valStr = values[name] ? "1" : "0";
        }
        items.push({
          name,
          type,
          value: valStr,
        });
      }

      await putParamset(sid, device.interface, currentTarget.address, items, "MASTER");

      setSaveSuccess(true);
      setInitialValues(values);
    } catch (err) {
      setSaveError(describeChangeError(err, t));
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered parameters
  const filteredParams = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return description;
    return description.filter((p) => {
      const name = p.NAME.toLowerCase();
      const unit = (p.UNIT ?? "").toLowerCase();
      const list = (p.VALUE_LIST ?? []).join(" ").toLowerCase();
      return name.includes(q) || unit.includes(q) || list.includes(q);
    });
  }, [description, query]);

  return (
    <div className="space-y-5">
      {/* Target Selector (Device Base / Channels) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
        {targets.map((tgt) => (
          <button
            key={tgt.key}
            type="button"
            onClick={() => setSelectedKey(tgt.key)}
            className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
              currentTarget.key === tgt.key
                ? "bg-[var(--primary)] text-white shadow-2xs"
                : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/80 hover:text-[var(--foreground)]"
            }`}
          >
            {tgt.label}
          </button>
        ))}
      </div>

      {/* Header Info & Battery Hint */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--foreground)]">{t("parametersTitle")}</h3>
          <p className="text-xs text-[var(--muted-foreground)]">{t("parametersHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadParams}
            disabled={loading || isSaving}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{t("refresh")}</span>
          </Button>
        </div>
      </div>

      {/* Battery Device Notice Banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        <Info className="size-4 shrink-0 mt-0.5" />
        <span>{t("batteryWakeupHint")}</span>
      </div>

      {/* Search Filter */}
      {description.length > 4 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-[var(--muted-foreground)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("filterParameters")}
            className="pl-8 text-sm"
          />
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center p-12 text-[var(--muted-foreground)]">
          <Loader2 className="size-6 animate-spin mr-2" />
          <span className="text-sm">{t("loading")}</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-center space-y-2">
          <SlidersHorizontal className="size-8 mx-auto text-[var(--muted-foreground)] opacity-50" />
          <p className="text-sm font-medium text-[var(--foreground)]">{error}</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Für diese Adresse ({currentTarget?.address}) konnten keine MASTER-Parameter abgerufen werden.
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredParams.length === 0 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          {t("noParametersFound")}
        </div>
      )}

      {/* Parameters Form */}
      {!loading && !error && filteredParams.length > 0 && (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredParams.map((p) => {
              const name = p.NAME;
              const type = p.TYPE.toUpperCase();
              const val = values[name] ?? initialValues[name] ?? p.DEFAULT ?? "";
              const isDirty = dirtyKeys.has(name);
              const op = Number(p.OPERATIONS);
              const isReadOnly = !mayChange || (!isNaN(op) && (op & 2) === 0);

              return (
                <div
                  key={name}
                  className={`rounded-xl border p-4 shadow-2xs space-y-2 transition-colors ${
                    isDirty
                      ? "border-[var(--primary)]/60 bg-[var(--primary)]/5"
                      : "border-[var(--border)] bg-[var(--card)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Label htmlFor={`param-${name}`} className="text-sm font-medium text-[var(--foreground)]">
                        {name}
                      </Label>
                      {p.UNIT && (
                        <span className="ml-1.5 rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--muted-foreground)]">
                          {p.UNIT}
                        </span>
                      )}
                    </div>
                    {isDirty && (
                      <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                        Geändert
                      </span>
                    )}
                  </div>

                  {/* Input by TYPE */}
                  <div>
                    {type === "BOOL" ? (
                      <div className="pt-1">
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            id={`param-${name}`}
                            type="checkbox"
                            checked={Boolean(val === true || val === "1" || val === 1 || val === "true")}
                            onChange={(e) => handleValueChange(name, e.target.checked)}
                            disabled={isReadOnly || isSaving}
                            className="size-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                          />
                          <span className="text-xs text-[var(--foreground)]">
                            {Boolean(val === true || val === "1" || val === 1 || val === "true") ? "Aktiviert (Ja)" : "Deaktiviert (Nein)"}
                          </span>
                        </label>
                      </div>
                    ) : type === "ENUM" && Array.isArray(p.VALUE_LIST) ? (
                      <select
                        id={`param-${name}`}
                        value={String(val)}
                        onChange={(e) => handleValueChange(name, Number(e.target.value))}
                        disabled={isReadOnly || isSaving}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm text-[var(--foreground)] shadow-2xs"
                      >
                        {p.VALUE_LIST.map((opt, idx) => (
                          <option key={opt} value={String(idx)}>
                            {opt} ({idx})
                          </option>
                        ))}
                      </select>
                    ) : type === "INTEGER" || type === "FLOAT" ? (
                      <Input
                        id={`param-${name}`}
                        type="number"
                        step={type === "FLOAT" ? "any" : "1"}
                        min={p.MIN !== undefined ? Number(p.MIN) : undefined}
                        max={p.MAX !== undefined ? Number(p.MAX) : undefined}
                        value={String(val)}
                        onChange={(e) => handleValueChange(name, e.target.value)}
                        disabled={isReadOnly || isSaving}
                        className="text-sm font-mono"
                      />
                    ) : (
                      <Input
                        id={`param-${name}`}
                        type="text"
                        value={String(val)}
                        onChange={(e) => handleValueChange(name, e.target.value)}
                        disabled={isReadOnly || isSaving}
                        className="text-sm"
                      />
                    )}
                  </div>

                  {/* Hints: Min, Max, Default */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                    {p.DEFAULT !== undefined && <span>Standard: {String(p.DEFAULT)}</span>}
                    {p.MIN !== undefined && p.MAX !== undefined && (
                      <span>
                        · Bereich: {String(p.MIN)} bis {String(p.MAX)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save & Revert Action Bar */}
          {mayChange && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sticky bottom-3 z-10">
              <div className="flex items-center gap-2">
                {dirtyKeys.size > 0 ? (
                  <span className="rounded-md bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                    {dirtyKeys.size} Parameter geändert
                  </span>
                ) : (
                  <span className="text-xs text-[var(--muted-foreground)]">Keine ungespeicherten Änderungen</span>
                )}
                {saveSuccess && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                    <Check className="size-4" />
                    {t("parametersSaved")}
                  </span>
                )}
                {saveError && <span className="text-xs text-red-600 dark:text-red-400">{saveError}</span>}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRevert}
                  disabled={dirtyKeys.size === 0 || isSaving}
                  className="gap-1.5"
                >
                  <RotateCcw className="size-3.5" />
                  <span>{t("revert")}</span>
                </Button>
                <Button type="submit" size="sm" disabled={dirtyKeys.size === 0 || isSaving} className="gap-1.5">
                  {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                  <span>{isSaving ? t("savingParameters") : t("saveParameters")}</span>
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
