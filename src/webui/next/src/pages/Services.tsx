import { ConfirmAll, ConfirmButton, useConfirm } from "@/components/ConfirmControls";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { expand } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCurrentProfile } from "@/lib/profile-context";
import { formatTime, sortServices, stickyCount } from "@/lib/service-messages";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { useMessages } from "@/lib/use-messages";

export default function Services() {
  const { t, lang } = useI18n();
  const m = useMessages();
  const strings = useCcuStrings("base", "stringtable", "extension");
  const sticky = stickyCount(m.services);
  const profile = useCurrentProfile();
  const mayChange = profile?.level === "USER" || profile?.level === "ADMIN";
  const confirm = useConfirm();
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("serviceMessages")}</CardTitle>
        <CardDescription>{mayChange ? t("sysvarsControl") : t("readOnly")}</CardDescription>
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
          {mayChange && <ConfirmAll ids={m.services.filter((s) => s.canAcknowledge).map((s) => s.id)} busy={confirm.busy} notice={confirm.notice} onConfirmAll={(ids) => void confirm.all(ids)} />}
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t("time")}</TableHeader>
                <TableHeader>{t("channel")}</TableHeader>
                <TableHeader>{t("message")}</TableHeader>
                {mayChange && <TableHeader className="text-right">{t("confirm")}</TableHeader>}
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
                  {mayChange && (
                    <TableCell className="text-right">
                      <ConfirmButton id={s.id} name={`${s.channelName}: ${expand(s.message, strings)}`} canAcknowledge={s.canAcknowledge} busy={confirm.busy} onConfirm={(id) => void confirm.one(id)} />
                    </TableCell>
                  )}
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
