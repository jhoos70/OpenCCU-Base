import { ConfirmAll, ConfirmButton, useConfirm } from "@/components/ConfirmControls";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCurrentProfile } from "@/lib/profile-context";
import { formatTime, sortAlarms } from "@/lib/service-messages";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { useMessages } from "@/lib/use-messages";

export default function Alarms() {
  const { t, lang } = useI18n();
  const m = useMessages();
  const strings = useCcuStrings("extension", "stringtable");
  const profile = useCurrentProfile();
  const mayChange = profile?.level === "USER" || profile?.level === "ADMIN";
  const confirm = useConfirm();
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("alarmMessages")}</CardTitle>
        <CardDescription>{mayChange ? t("sysvarsControl") : t("readOnly")}</CardDescription>
      </div>
      {m.failed && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {t("messagesFailed")}
        </p>
      )}
      {!m.loaded ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>
      ) : m.alarms.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("noAlarms")}</p>
      ) : (
        <>
        {mayChange && <ConfirmAll ids={m.alarms.filter((a) => a.canAcknowledge).map((a) => a.id)} busy={confirm.busy} notice={confirm.notice} onConfirmAll={(ids) => void confirm.all(ids)} />}
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t("time")}</TableHeader>
              <TableHeader>{t("name")}</TableHeader>
              {mayChange && <TableHeader className="text-right">{t("confirm")}</TableHeader>}
            </TableRow>
          </TableHead>
          <tbody>
            {sortAlarms(m.alarms).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap">{formatTime(a.occurredAt, lang)}</TableCell>
                <TableCell>{text(a.name, strings)}</TableCell>
                {mayChange && (
                  <TableCell className="text-right">
                    <ConfirmButton id={a.id} name={text(a.name, strings)} canAcknowledge={a.canAcknowledge} busy={confirm.busy} onConfirm={(id) => void confirm.one(id)} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </tbody>
        </Table>
        </>
      )}
    </Card>
  );
}
