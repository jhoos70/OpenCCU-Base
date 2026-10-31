import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { expand } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { formatTime, sortServices, stickyCount } from "@/lib/service-messages";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { useMessages } from "@/lib/use-messages";

export default function Services() {
  const { t, lang } = useI18n();
  const m = useMessages();
  const strings = useCcuStrings("stringtable", "extension");
  const sticky = stickyCount(m.services);
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("serviceMessages")}</CardTitle>
        <CardDescription>{t("readOnly")}</CardDescription>
      </div>
      {m.failed && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {t("messagesFailed")}
        </p>
      )}
      {!m.loaded ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("loading")}</p>
      ) : m.services.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{t("noServices")}</p>
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t("time")}</TableHeader>
                <TableHeader>{t("channel")}</TableHeader>
                <TableHeader>{t("message")}</TableHeader>
              </TableRow>
            </TableHead>
            <tbody>
              {sortServices(m.services).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap">{formatTime(s.occurredAt, lang)}</TableCell>
                  <TableCell>{s.channelName}</TableCell>
                  <TableCell>
                    {expand(s.message, strings)}
                    {s.isSticky && <span className="ml-2 rounded bg-[var(--background)] px-1.5 py-0.5 text-xs text-[var(--muted-foreground)]">{t("sticky")}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
          {m.hideSticky && sticky > 0 && <p className="text-sm text-[var(--muted-foreground)]">{t("stickyHidden", { count: sticky })}</p>}
        </>
      )}
    </Card>
  );
}
