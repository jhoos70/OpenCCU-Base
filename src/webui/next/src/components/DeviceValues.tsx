import * as React from "react";
import { Button } from "@/components/ui/button";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeChangeError, describeError, getValues } from "@/lib/api";
import { byChannel } from "@/lib/datapoints";
import { useI18n } from "@/lib/i18n";
import { usePolled } from "@/lib/use-polled";
import { DatapointRow, OpsNotice, useDatapointOps } from "./DatapointRow";

const POLL_MS = 10_000;

/** The live values of one device, channel by channel, and (for a user) the controls: yes/no buttons, a button, or a field with OK. */
export function DeviceValues({ deviceId, sid, mayChange, onExpired }: { deviceId: string; sid: string; mayChange: boolean; onExpired: () => void }) {
  const { t } = useI18n();
  const load = React.useCallback(() => getValues(sid, deviceId), [sid, deviceId]);
  const { data, error, loaded, refresh } = usePolled(load, POLL_MS, onExpired);
  const ops = useDatapointOps(sid, refresh, onExpired);

  if (!loaded) return <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>;
  if (!data) {
    return (
      <p role="alert" className="text-sm text-[var(--destructive)]">
        {error ? describeChangeError(error, t) : t("noValues")}
      </p>
    );
  }
  if (data.length === 0) return <p className="text-sm text-[var(--muted-foreground)]">{t("noValues")}</p>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{t("valuesTitle")}</h4>
        <Button variant="outline" className="h-8 px-3" onClick={refresh}>
          {t("refresh")}
        </Button>
      </div>
      {Boolean(error) && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {describeError(error, t)}
        </p>
      )}
      <OpsNotice notice={ops.notice} />
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t("param")}</TableHeader>
            <TableHeader>{t("value")}</TableHeader>
            {mayChange && <TableHeader className="w-1/3">{t("change")}</TableHeader>}
          </TableRow>
        </TableHead>
        <tbody>
          {byChannel(data).map((ch) => (
            <React.Fragment key={ch.channelId}>
              <TableRow>
                <TableCell colSpan={mayChange ? 3 : 2} className="bg-[var(--muted)] text-xs font-medium">
                  {ch.channel}
                </TableCell>
              </TableRow>
              {ch.items.map((dp) => (
                <DatapointRow key={dp.id} dp={dp} mayChange={mayChange} ops={ops} />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
