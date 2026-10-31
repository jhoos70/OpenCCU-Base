import * as React from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { describeError, getDutyCycle, isUnknownMethod } from "@/lib/api";
import { CS_CRITICAL, CS_WARN, DC_CRITICAL, DC_WARN, carrierSenseSeverity, dutyCycleSeverity, interfaceLabel, parseDutyCycle, type Severity } from "@/lib/duty-cycle";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { usePolled } from "@/lib/use-polled";
import { cn } from "@/lib/utils";

/** The file behind it is rewritten every few minutes: a minute is often enough. */
const POLL_MS = 60_000;

const SEVERITY: Record<Severity, { text: MessageKey; bar: string }> = {
  ok: { text: "dcNormal", bar: "bg-green-500" },
  warning: { text: "dcWarning", bar: "bg-amber-400" },
  critical: { text: "dcCritical", bar: "bg-red-500" },
};

// The bar says it with a width and a colour, the text with a word: colour alone is not enough.
function Meter({ label, value, severity, barClass }: { label: string; value: number | null; severity: Severity | null; barClass?: string }) {
  const { t } = useI18n();
  const shown = value === null ? t("dcNotAvailable") : `${value} %`;
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular-nums">
          <strong>{shown}</strong>
          {severity && <span className="ml-2 text-[var(--muted-foreground)]">{t(SEVERITY[severity].text)}</span>}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={shown + (severity ? `, ${t(SEVERITY[severity].text)}` : "")}
        className="h-3 overflow-hidden rounded bg-[var(--background)]"
      >
        <div className={cn("h-full rounded", severity ? (barClass ?? SEVERITY[severity].bar) : "")} style={{ width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

/** The load of the radio interfaces: a card of the overview. */
export default function DutyCycle({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t } = useI18n();
  const load = React.useCallback(async () => parseDutyCycle(await getDutyCycle(sid)), [sid]);
  const { data, error, loaded } = usePolled(load, POLL_MS, onExpired);
  const unsupported = isUnknownMethod(error);
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle as="h2">{t("dutyCycle")}</CardTitle>
        <CardDescription>{t("dutyCycleHelp")}</CardDescription>
      </div>
      {!loaded && <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>}
      {unsupported && <p className="text-sm text-[var(--muted-foreground)]">{t("dcUnsupported")}</p>}
      {Boolean(error) && !unsupported && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {describeError(error, t)}
        </p>
      )}
      {loaded && !unsupported && data && data.length === 0 && !error && (
        <div className="text-sm text-[var(--muted-foreground)]">
          <p>{t("dcNone")}</p>
          <p>{t("dcNoneHint")}</p>
        </div>
      )}
      {!unsupported && data && data.length > 0 && (
        <>
          <ul className="space-y-6">
            {data.map((i) => (
              <li key={i.address || i.name} className="space-y-3">
                <h3 className="text-base font-semibold">
                  {interfaceLabel(i, t)} <span className="text-sm font-normal text-[var(--muted-foreground)]">{i.address}</span>
                </h3>
                <Meter label={t("dutyCycle")} value={i.dutyCycle} severity={i.dutyCycle === null ? null : dutyCycleSeverity(i.dutyCycle)} />
                {i.carrierSense !== null && (
                  <Meter label={t("carrierSense")} value={i.carrierSense} severity={carrierSenseSeverity(i.carrierSense)} barClass={carrierSenseSeverity(i.carrierSense) === "ok" ? "bg-sky-500" : undefined} />
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t("dutyCycle")}: {t("dcThresholds", { warn: DC_WARN, critical: DC_CRITICAL })} {t("carrierSense")}: {t("dcThresholds", { warn: CS_WARN, critical: CS_CRITICAL })}
          </p>
        </>
      )}
    </Card>
  );
}
