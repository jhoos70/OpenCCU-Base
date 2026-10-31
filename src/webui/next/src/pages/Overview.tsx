import * as React from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { describeError, getSystem } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCurrentProfile } from "@/lib/profile-context";
import { usePolled } from "@/lib/use-polled";
import { formatClock, formatDay, wallNow } from "@/lib/wall-clock";
import DutyCycle from "@/pages/DutyCycle";

/** The time is asked again now and then to stay right; in between it runs with the browser's clock. */
const POLL_MS = 60_000;

function Row({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-[var(--border)] py-2 last:border-0">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="tabular-nums">{value || t("notKnown")}</dd>
    </div>
  );
}

/** The classic start page: the time, sunrise and sunset, the firmware version, a hint if the account has no password,
 *  and the load of the radio interfaces. Favourites are not built yet. */
export default function Overview({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t, lang } = useI18n();
  const profile = useCurrentProfile();
  const load = React.useCallback(async () => ({ info: await getSystem(sid), at: Date.now() }), [sid]);
  const { data, error } = usePolled(load, POLL_MS, onExpired);

  // a tick moves the displayed time on between two answers of the CCU
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);
  const clock = data ? wallNow(data.info.time, data.at, now) : null;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t("overview")}</h1>
      {profile && !profile.hasPassword && (
        <p role="note" className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("noPassword")}
        </p>
      )}
      <Card className="space-y-4">
        <div>
          <CardTitle as="h2">{t("systemInfo")}</CardTitle>
          <CardDescription>{t("readOnly")}</CardDescription>
        </div>
        {Boolean(error) && (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {describeError(error, t)}
          </p>
        )}
        {!data && !error && <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>}
        {data && (
          <dl className="text-sm">
            <Row label={t("clockTime")} value={clock ? formatClock(clock, lang) : ""} />
            <Row label={t("clockDate")} value={clock ? formatDay(clock, lang) : ""} />
            <Row label={t("sunrise")} value={data.info.sunrise} />
            <Row label={t("sunset")} value={data.info.sunset} />
            <Row label={t("firmwareVersion")} value={data.info.firmwareVersion} />
          </dl>
        )}
      </Card>
      <DutyCycle sid={sid} onExpired={onExpired} />
      <Card>
        <CardTitle as="h2">{t("favourites")}</CardTitle>
        <CardDescription>{t("favouritesLater")}</CardDescription>
        <p className="mt-2 text-sm">
          <a className="underline" href={`/pages/index.htm?sid=@${sid}@`}>
            {t("openClassic")}
          </a>
        </p>
      </Card>
    </div>
  );
}
