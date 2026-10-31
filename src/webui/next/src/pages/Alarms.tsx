import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { formatTime, sortAlarms } from "@/lib/service-messages";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { useMessages } from "@/lib/use-messages";

export default function Alarms() {
  const { t, lang } = useI18n();
  const m = useMessages();
  const strings = useCcuStrings("extension", "stringtable");
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("alarmMessages")}</CardTitle>
        <CardDescription>{t("readOnly")}</CardDescription>
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
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t("time")}</TableHeader>
              <TableHeader>{t("name")}</TableHeader>
            </TableRow>
          </TableHead>
          <tbody>
            {sortAlarms(m.alarms).map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap">{formatTime(a.occurredAt, lang)}</TableCell>
                <TableCell>{text(a.name, strings)}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
