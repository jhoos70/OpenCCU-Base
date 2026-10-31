import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { useModel } from "@/lib/use-model";
import { Status } from "./Status";

export default function Rooms({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t } = useI18n();
  const state = useModel("rooms", sid, onExpired);
  const strings = useCcuStrings("extension", "stringtable");
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("rooms")}</CardTitle>
        <CardDescription>{t("readOnly")}</CardDescription>
      </div>
      <Status state={state}>
        {(rooms) =>
          rooms.items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t("noRooms")}</p>
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t("name")}</TableHeader>
                    <TableHeader className="hidden sm:table-cell">{t("description")}</TableHeader>
                    <TableHeader className="text-right">{t("channels")}</TableHeader>
                  </TableRow>
                </TableHead>
                <tbody>
                  {rooms.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{text(r.name, strings)}</TableCell>
                      <TableCell className="hidden sm:table-cell">{text(r.description, strings)}</TableCell>
                      <TableCell className="text-right">{r.channelIds.length}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
              {rooms.total > rooms.items.length && (
                <p className="text-sm text-[var(--muted-foreground)]">{t("showingOf", { shown: rooms.items.length, total: rooms.total })}</p>
              )}
            </>
          )
        }
      </Status>
    </Card>
  );
}
