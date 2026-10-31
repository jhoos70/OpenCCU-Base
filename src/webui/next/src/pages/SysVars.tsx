import * as React from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSysVarValue, isUserVar, text } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useCcuStrings } from "@/lib/use-ccu-strings";
import { useModel } from "@/lib/use-model";
import { Status } from "./Status";

export default function SysVars({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const { t } = useI18n();
  const state = useModel("sysvars", sid, onExpired);
  const strings = useCcuStrings("extension", "stringtable");
  const [internal, setInternal] = React.useState(false);
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>{t("sysvars")}</CardTitle>
        <CardDescription>{t("readOnly")}</CardDescription>
      </div>
      <div className="flex items-center gap-2">
        <input id="internal" type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
        <Label htmlFor="internal">{t("showInternal")}</Label>
      </div>
      <Status state={state}>
        {(vars) => {
          const items = internal ? vars.items : vars.items.filter(isUserVar);
          return items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t("noSysvars")}</p>
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t("name")}</TableHeader>
                    <TableHeader>{t("type")}</TableHeader>
                    <TableHeader>{t("value")}</TableHeader>
                  </TableRow>
                </TableHead>
                <tbody>
                  {items.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>{text(v.name, strings)}</TableCell>
                      <TableCell>{v.type}</TableCell>
                      <TableCell>{formatSysVarValue(v, t, strings)}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
              {vars.total > vars.items.length && (
                <p className="text-sm text-[var(--muted-foreground)]">{t("showingOf", { shown: vars.items.length, total: vars.total })}</p>
              )}
            </>
          );
        }}
      </Status>
    </Card>
  );
}
