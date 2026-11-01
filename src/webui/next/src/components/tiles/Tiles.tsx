import * as React from "react";
import { DatapointRow, useDatapointOps } from "@/components/DatapointRow";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Datapoint } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCommand } from "@/lib/use-command";
import { sensorModel, shutterModel, switchModel, thermostatModel, type ModeName } from "@/lib/widgets";
import { Icon } from "./Icon";
import { CommandStatus, TileShell, type Health } from "./TileShell";

export interface TileProps {
  title: string;
  dps: Datapoint[];
  health: Health;
  mayChange: boolean;
  sid: string;
  refresh: () => void;
  onExpired: () => void;
}

/** Taps on the target temperature are collected: one command goes out when the taps have stopped. */
export const DEBOUNCE_MS = 1200;

const Big = ({ value, unit }: { value: string; unit?: string }) => (
  <div className="my-0.5 flex items-baseline">
    <span className="text-4xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
    {unit && <span className="ml-1 text-[15px] font-medium text-[var(--muted-foreground)]">{unit}</span>}
  </div>
);
const Sub = ({ children }: { children: React.ReactNode }) => <p className="m-0 text-[13px] text-[var(--muted-foreground)]">{children}</p>;
const RoundButton = ({ label, icon, onClick, disabled }: { label: string; icon: "minus" | "plus"; onClick: () => void; disabled: boolean }) => (
  <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-white hover:border-[var(--accent)] active:bg-[var(--accent-soft)] disabled:opacity-40">
    <Icon name={icon} className="h-5 w-5" />
  </button>
);
const TileButton = ({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled: boolean; label?: string }) => (
  <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="inline-flex h-[38px] min-w-0 items-center justify-center gap-1 rounded-[10px] border border-[var(--border)] bg-white px-1 text-[13px] hover:border-[var(--accent)] disabled:opacity-40">
    {children}
  </button>
);

export function ThermostatTile(p: TileProps) {
  const { t, lang } = useI18n();
  const m = thermostatModel(p.dps);
  const cmd = useCommand(p.sid, p.dps, p.refresh, p.onExpired, t);
  const [draft, setDraft] = React.useState<number | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  // the CCU's own value is shown again once a command is confirmed or has failed
  React.useEffect(() => {
    if (cmd.state.phase === "ok" || cmd.state.phase === "error") setDraft(null);
  }, [cmd.state.phase]);

  const can = p.mayChange && !p.health.unreachable;
  const fmt = (v: number) => v.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const shown = draft ?? m.target;
  const step = (delta: number) => {
    const sp = m.setpoint;
    if (!sp) return;
    const v = Math.min(m.max, Math.max(m.min, Math.round(((draft ?? m.target ?? 20) + delta) * 2) / 2));
    setDraft(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void cmd.run(sp, v.toFixed(1), t("targetWhat", { value: `${fmt(v)} °C` }), { dp: sp, value: v.toFixed(1) }), DEBOUNCE_MS);
  };
  const modeLabel: Record<ModeName, string> = { auto: t("modeAuto"), manual: t("modeManual"), boost: t("modeBoost") };
  const sub = [m.actual !== null ? t("nowTemp", { value: `${fmt(m.actual)} °C` }) : "", m.humidity !== null ? t("humidityPct", { value: Math.round(m.humidity) }) : ""].filter(Boolean).join(" · ");

  return (
    <TileShell kind={t("kindHeating")} icon="thermo" title={p.title} health={p.health} status={<CommandStatus state={cmd.state} retry={cmd.retry} note={p.health.unreachable ? t("unreachableNote") : undefined} />}>
      <div className="grid grid-cols-[44px_1fr_44px] items-center gap-1">
        {m.setpoint?.writable ? <RoundButton label={t("lowerTarget")} icon="minus" onClick={() => step(-0.5)} disabled={!can} /> : <span />}
        <div className={`text-center ${draft !== null ? "border-b-2 border-dashed border-[var(--accent)]" : "border-b-2 border-transparent"}`} aria-live="polite">
          {shown !== null ? <Big value={fmt(shown)} unit="°C" /> : <span className="text-4xl text-[var(--muted-foreground)]" title={t("noValueTile")}>–</span>}
        </div>
        {m.setpoint?.writable ? <RoundButton label={t("raiseTarget")} icon="plus" onClick={() => step(0.5)} disabled={!can} /> : <span />}
      </div>
      <Sub>{sub || t("noValueTile")}</Sub>
      {m.modes.length > 0 && (
        <div role="group" aria-label={t("modeGroup")} className="mt-2 flex gap-1.5">
          {m.modes.map((mode) => (
            <button
              key={mode.name}
              type="button"
              aria-pressed={m.mode === mode.name}
              disabled={!can}
              onClick={() => void cmd.run(mode.dp, mode.value, modeLabel[mode.name], mode.expect)}
              className={`h-8 flex-1 rounded-lg border text-[13px] disabled:opacity-40 ${m.mode === mode.name ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "border-[var(--border)] bg-white hover:border-[var(--accent)]"}`}
            >
              {modeLabel[mode.name]}
            </button>
          ))}
        </div>
      )}
      {m.valve !== null && (
        <>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--track)]" aria-hidden="true">
            <span className="block h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${m.valve}%` }} />
          </div>
          <p className="m-0 text-[11px] text-[var(--muted-foreground)]">{t("valvePct", { value: m.valve })}</p>
        </>
      )}
    </TileShell>
  );
}

export function ShutterTile(p: TileProps) {
  const { t } = useI18n();
  const m = shutterModel(p.dps);
  const cmd = useCommand(p.sid, p.dps, p.refresh, p.onExpired, t);
  const can = p.mayChange && !p.health.unreachable;
  const level = m.level;
  const go = (value: "0" | "1", what: string) => level && void cmd.run(level, value, what, { dp: level, value });
  return (
    <TileShell kind={t("kindShutter")} icon="blinds" title={p.title} health={p.health} status={<CommandStatus state={cmd.state} retry={cmd.retry} note={p.health.unreachable ? t("unreachableNote") : m.moving ? t("moving") : undefined} />}>
      {m.percent !== null ? <Big value={String(m.percent)} unit={t("percentOpen")} /> : <span className="text-4xl text-[var(--muted-foreground)]" title={t("noValueTile")}>–</span>}
      <div className="my-2 h-2.5 overflow-hidden rounded-full bg-[var(--track)]" role="img" aria-label={m.percent !== null ? `${m.percent} ${t("percentOpen")}` : t("noValueTile")}>
        <span className="block h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${m.percent ?? 0}%` }} />
      </div>
      {p.mayChange && (
        <div className="grid grid-cols-3 gap-1.5">
          <TileButton disabled={!can || !level?.writable} onClick={() => go("1", t("tileOpen"))}>
            <Icon name="up" className="h-4 w-4" />
            {t("tileOpen")}
          </TileButton>
          <TileButton disabled={!can || !m.stop} onClick={() => m.stop && void cmd.run(m.stop, true, t("tileStop"))}>
            <Icon name="stop" className="h-4 w-4" />
            {t("tileStop")}
          </TileButton>
          <TileButton disabled={!can || !level?.writable} onClick={() => go("0", t("tileClose"))}>
            <Icon name="down" className="h-4 w-4" />
            {t("tileClose")}
          </TileButton>
        </div>
      )}
    </TileShell>
  );
}

/** A switch (a socket, a light) with its feedback and, if it has one, its power meter; a meter alone is a read-only tile. */
export function SwitchTile(p: TileProps) {
  const { t, lang } = useI18n();
  const m = switchModel(p.dps);
  const cmd = useCommand(p.sid, p.dps, p.refresh, p.onExpired, t);
  const can = p.mayChange && !p.health.unreachable && m.operable;
  const kwh = m.kwh === null ? "" : t("kwhTotal", { value: m.kwh.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
  if (!m.state) {
    return (
      <TileShell kind={t("kindPower")} icon="bolt" title={p.title} health={p.health}>
        {m.watts !== null ? <Big value={Math.round(m.watts).toLocaleString(lang)} unit="W" /> : <span className="text-4xl text-[var(--muted-foreground)]">–</span>}
        <Sub>{kwh || t("noValueTile")}</Sub>
        <p className="m-0 text-[11px] text-[var(--muted-foreground)]">{t("readOnlyTile")}</p>
      </TileShell>
    );
  }
  const toggle = () => m.on !== null && void cmd.run(m.state!, !m.on, m.on ? t("tileOff") : t("tileOn"), { dp: m.watch ?? m.state!, value: String(!m.on) });
  return (
    <TileShell kind={t("kindSwitch")} icon="plug" title={p.title} health={p.health} on={m.on === true} status={<CommandStatus state={cmd.state} retry={cmd.retry} note={p.health.unreachable ? t("unreachableNote") : undefined} />}>
      <button
        type="button"
        role="switch"
        aria-checked={m.on === true}
        aria-label={p.title}
        disabled={!can || m.on === null}
        onClick={toggle}
        className={`relative my-1 h-9 w-16 rounded-full transition-colors disabled:opacity-50 ${m.on ? "bg-[var(--accent)]" : "bg-[var(--track)]"}`}
      >
        <span className={`absolute left-1 top-1 h-7 w-7 rounded-full bg-white shadow transition-transform ${m.on ? "translate-x-7" : ""}`} />
      </button>
      <p className="m-0 text-[22px] font-semibold">{m.on === null ? "–" : m.on ? t("tileOn") : t("tileOff")}</p>
      <Sub>{m.watts !== null && m.on ? t("wattsNow", { value: Math.round(m.watts) }) : m.watts !== null ? t("noPower") : m.operable ? "" : t("readOnlyTile")}</Sub>
    </TileShell>
  );
}

export function SensorTile(p: TileProps) {
  const { t, lang } = useI18n();
  const m = sensorModel(p.dps);
  const fmt = (v: number) => v.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const sub = [m.humidity !== null ? t("humidityPct", { value: Math.round(m.humidity) }) : ""].filter(Boolean).join(" · ");
  return (
    <TileShell kind={t("kindWeather")} icon="sun" title={p.title} health={p.health}>
      {m.temperature !== null ? <Big value={fmt(m.temperature)} unit="°C" /> : <span className="text-4xl text-[var(--muted-foreground)]">–</span>}
      <Sub>{sub || t("noValueTile")}</Sub>
      <p className="m-0 text-[11px] text-[var(--muted-foreground)]">{t("readOnlyTile")}</p>
    </TileShell>
  );
}

/** Anything without a tile of its own: its values as a table, as before. */
export function GenericTile(p: TileProps & { channelType: string }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const ops = useDatapointOps(p.sid, p.refresh, p.onExpired);
  return (
    <TileShell kind={t("kindOther")} icon="dots" title={p.title} health={p.health}>
      <Sub>{p.channelType.toLowerCase().replace(/_/g, " ")}</Sub>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mt-1 self-start text-sm underline">
        {open ? t("hideValues") : t("showValues")}
      </button>
      {open && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="sr-only">{t("param")}</TableHeader>
              <TableHeader className="sr-only">{t("value")}</TableHeader>
              {p.mayChange && <TableHeader className="sr-only">{t("change")}</TableHeader>}
            </TableRow>
          </TableHead>
          <tbody>
            {p.dps.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>{t("noValues")}</TableCell>
              </TableRow>
            ) : (
              p.dps.map((dp) => <DatapointRow key={dp.id} dp={dp} mayChange={p.mayChange} ops={ops} />)
            )}
          </tbody>
        </Table>
      )}
    </TileShell>
  );
}
