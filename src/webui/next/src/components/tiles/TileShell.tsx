import * as React from "react";
import { useI18n } from "@/lib/i18n";
import type { CommandState } from "@/lib/use-command";
import { Icon, type IconName } from "./Icon";

export interface Health {
  unreachable: boolean;
  lowBattery: boolean;
}

/** The unreachable and low-battery badges of a device (on a tile, or next to the device's name in the Devices list). */
export function HealthBadges({ health }: { health?: Health }) {
  const { t } = useI18n();
  if (!health?.unreachable && !health?.lowBattery) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {health.unreachable && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--bad-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--destructive)]">
          <Icon name="wifioff" className="h-3 w-3" />
          {t("unreachable")}
        </span>
      )}
      {health.lowBattery && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[var(--warn-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn)]">
          <Icon name="battery" className="h-3 w-3" />
          {t("batteryLow")}
        </span>
      )}
    </span>
  );
}

/** The card every tile sits in: what kind of thing it is, the health of the device, the name, the content and the status line. */
export function TileShell({ kind, icon, title, health, on = false, children, status }: { kind: string; icon: IconName; title: string; health?: Health; on?: boolean; children: React.ReactNode; status?: React.ReactNode }) {
  return (
    <article
      aria-label={title}
      className={`flex min-w-0 flex-col gap-1 rounded-2xl border p-3.5 shadow-sm transition-colors ${on ? "border-[var(--accent)] bg-[var(--tile-on)]" : "border-[var(--border)] bg-white"} ${health?.unreachable ? "opacity-75" : ""}`}
    >
      <header className="flex min-h-[22px] flex-wrap items-center justify-between gap-x-1.5 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
          <Icon name={icon} />
          <span>{kind}</span>
        </span>
        <HealthBadges health={health} />
      </header>
      <h3 className="mb-1 line-clamp-2 min-h-[2.5em] text-[15px] font-semibold leading-tight" title={title}>
        {title}
      </h3>
      {children}
      {status}
    </article>
  );
}

/** The line under a tile that says what a command is doing; polite, so a screen reader hears the answer. */
export function CommandStatus({ state, retry, note }: { state: CommandState; retry: () => void; note?: string }) {
  const { t, lang } = useI18n();
  let text = note ?? "";
  let tone = "text-[var(--muted-foreground)]";
  let mark: React.ReactNode = null;
  if (state.phase === "sending") {
    text = t("cmdSending");
    mark = <span aria-hidden="true" className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-[var(--accent)] border-r-transparent motion-reduce:animate-none" />;
  } else if (state.phase === "ok") {
    const time = state.at.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
    text = state.confirmed ? t("cmdConfirmed", { what: state.what, time }) : t("cmdSent", { what: state.what });
    tone = "text-[var(--ok)]";
    mark = <span aria-hidden="true">✓</span>;
  } else if (state.phase === "noconfirm") {
    text = t("cmdNoConfirm");
    tone = "text-[var(--warn)]";
    mark = <span aria-hidden="true">!</span>;
  } else if (state.phase === "error") {
    return (
      <div role="alert" className="flex min-h-5 items-center gap-1.5 text-xs text-[var(--destructive)]">
        <span aria-hidden="true">!</span>
        {state.text}
        <button type="button" className="ml-auto underline" onClick={retry}>
          {t("tryAgain")}
        </button>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className={`flex min-h-5 items-center gap-1.5 text-xs ${tone}`}>
      {mark}
      {text}
      {state.phase === "noconfirm" && (
        <button type="button" className="ml-auto underline" onClick={retry}>
          {t("tryAgain")}
        </button>
      )}
    </div>
  );
}
