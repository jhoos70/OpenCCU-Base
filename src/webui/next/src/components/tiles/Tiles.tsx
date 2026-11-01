import * as React from "react";
import { DatapointRow, useDatapointOps } from "@/components/DatapointRow";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Datapoint } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCommand } from "@/lib/use-command";
import { contactModel, dimmerModel, keyModel, sensorModel, shutterModel, switchModel, thermostatModel, type ModeName } from "@/lib/widgets";
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
  <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--accent)] active:bg-[var(--accent-soft)] disabled:opacity-40">
    <Icon name={icon} className="h-5 w-5" />
  </button>
);
const TileButton = ({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled: boolean; label?: string }) => (
  <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="inline-flex h-[38px] min-w-0 items-center justify-center gap-1 rounded-[10px] border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] px-1 text-[13px] hover:border-[var(--accent)] disabled:opacity-40">
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
      <Sub>{sub || (shown === null ? t("noValueTile") : "")}</Sub>
      {m.modes.length > 0 && (
        <div role="group" aria-label={t("modeGroup")} className="mt-2 flex gap-1.5">
          {m.modes.map((mode) => (
            <button
              key={mode.name}
              type="button"
              aria-pressed={m.mode === mode.name}
              disabled={!can}
              onClick={() => void cmd.run(mode.dp, mode.value, modeLabel[mode.name], mode.expect)}
              className={`h-8 flex-1 rounded-lg border text-[13px] disabled:opacity-40 ${m.mode === mode.name ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--accent)]"}`}
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
  const motionSensor = m.motion !== null || (m.temperature === null && m.brightness !== null);
  const sub = [m.humidity !== null ? t("humidityPct", { value: Math.round(m.humidity) }) : "", m.brightness !== null ? t("brightnessValue", { value: Math.round(m.brightness) }) : ""].filter(Boolean).join(" · ");
  return (
    <TileShell kind={motionSensor ? t("kindMotion") : t("kindWeather")} icon="sun" title={p.title} health={p.health} on={m.motion === true}>
      {motionSensor ? (
        <p className="m-0 text-[22px] font-semibold">{m.motion === null ? "–" : m.motion ? t("motionYes") : t("motionNo")}</p>
      ) : m.temperature !== null ? (
        <Big value={fmt(m.temperature)} unit="°C" />
      ) : (
        <span className="text-4xl text-[var(--muted-foreground)]">–</span>
      )}
      <Sub>{sub || (m.temperature === null && m.motion === null ? t("noValueTile") : "")}</Sub>
      <p className="m-0 text-[11px] text-[var(--muted-foreground)]">{t("readOnlyTile")}</p>
    </TileShell>
  );
}

/** A window or door contact: open or closed, nothing to operate. */
export function ContactTile(p: TileProps) {
  const { t } = useI18n();
  const m = contactModel(p.dps);
  return (
    <TileShell kind={t("kindContact")} icon="contact" title={p.title} health={p.health} on={m.open === true}>
      <p className={`m-0 text-[22px] font-semibold ${m.open ? "text-[var(--warn)]" : ""}`}>{m.open === null ? "–" : m.open ? t("contactOpen") : t("contactClosed")}</p>
      <p className="m-0 text-[11px] text-[var(--muted-foreground)]">{t("readOnlyTile")}</p>
    </TileShell>
  );
}

/** A button (a wall key, a virtual key of the central): pressing it is a command with nothing to confirm. */
export function KeyTile(p: TileProps) {
  const { t } = useI18n();
  const m = keyModel(p.dps);
  const cmd = useCommand(p.sid, p.dps, p.refresh, p.onExpired, t);
  const can = p.mayChange && !p.health.unreachable;
  return (
    <TileShell kind={t("kindKey")} icon="key" title={p.title} health={p.health} status={<CommandStatus state={cmd.state} retry={cmd.retry} note={p.health.unreachable ? t("unreachableNote") : undefined} />}>
      <div className="mt-1 grid grid-cols-2 gap-1.5">
        {m.short && (
          <TileButton disabled={!can || !m.short.writable} onClick={() => void cmd.run(m.short!, true, t("pressShort"))}>
            {t("pressShort")}
          </TileButton>
        )}
        {m.long && (
          <TileButton disabled={!can || !m.long.writable} onClick={() => void cmd.run(m.long!, true, t("pressLong"))}>
            {t("pressLong")}
          </TileButton>
        )}
      </div>
    </TileShell>
  );
}

/** A dimmable light: the level in percent and a slider; the command goes out when the slider has rested. */
export function DimmerTile(p: TileProps) {
  const { t } = useI18n();
  const m = dimmerModel(p.dps);
  const cmd = useCommand(p.sid, p.dps, p.refresh, p.onExpired, t);
  const [draft, setDraft] = React.useState<number | null>(null);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  React.useEffect(() => {
    if (cmd.state.phase === "ok" || cmd.state.phase === "error") setDraft(null);
  }, [cmd.state.phase]);
  const can = p.mayChange && !p.health.unreachable && m.operable;
  const shown = draft ?? m.percent;
  const set = (v: number) => {
    const lvl = m.level;
    if (!lvl) return;
    setDraft(v);
    window.clearTimeout(timer.current);
    const value = (v / 100).toFixed(2);
    timer.current = window.setTimeout(() => void cmd.run(lvl, value, t("levelWhat", { value: v }), { dp: lvl, value }), DEBOUNCE_MS);
  };
  return (
    <TileShell kind={t("kindLight")} icon="bulb" title={p.title} health={p.health} on={(shown ?? 0) > 0} status={<CommandStatus state={cmd.state} retry={cmd.retry} note={p.health.unreachable ? t("unreachableNote") : undefined} />}>
      {shown !== null ? <Big value={String(shown)} unit="%" /> : <span className="text-4xl text-[var(--muted-foreground)]">–</span>}
      <input type="range" min={0} max={100} step={5} value={shown ?? 0} aria-label={`${t("lightLevel")}: ${p.title}`} disabled={!can} onChange={(e) => set(Number(e.target.value))} className="my-1 w-full accent-[var(--accent)]" />
      {p.mayChange && (
        <div className="grid grid-cols-2 gap-1.5">
          <TileButton disabled={!can} onClick={() => set(0)}>
            {t("tileOff")}
          </TileButton>
          <TileButton disabled={!can} onClick={() => set(100)}>
            {t("tileOn")}
          </TileButton>
        </div>
      )}
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
