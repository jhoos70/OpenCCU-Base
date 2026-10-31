import * as React from "react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSysVarValue, isUserVar } from "@/lib/format";
import { useModel } from "@/lib/use-model";
import { Status } from "./Status";

export default function SysVars({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const state = useModel("sysvars", sid, onExpired);
  const [internal, setInternal] = React.useState(false);
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>System variables</CardTitle>
        <CardDescription>Read only</CardDescription>
      </div>
      <div className="flex items-center gap-2">
        <input id="internal" type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
        <Label htmlFor="internal">Show internal variables</Label>
      </div>
      <Status state={state}>
        {(vars) => {
          const items = internal ? vars.items : vars.items.filter(isUserVar);
          return items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No system variables.</p>
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Name</TableHeader>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Value</TableHeader>
                  </TableRow>
                </TableHead>
                <tbody>
                  {items.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>{v.name}</TableCell>
                      <TableCell>{v.type}</TableCell>
                      <TableCell>{formatSysVarValue(v)}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
              {vars.total > vars.items.length && (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Showing {vars.items.length} of {vars.total}.
                </p>
              )}
            </>
          );
        }}
      </Status>
    </Card>
  );
}
