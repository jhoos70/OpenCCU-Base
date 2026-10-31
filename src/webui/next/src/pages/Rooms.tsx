import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useModel } from "@/lib/use-model";
import { Status } from "./Status";

export default function Rooms({ sid, onExpired }: { sid: string; onExpired: () => void }) {
  const state = useModel("rooms", sid, onExpired);
  return (
    <Card className="space-y-4">
      <div>
        <CardTitle>Rooms</CardTitle>
        <CardDescription>Read only</CardDescription>
      </div>
      <Status state={state}>
        {(rooms) =>
          rooms.items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No rooms defined.</p>
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Name</TableHeader>
                    <TableHeader className="hidden sm:table-cell">Description</TableHeader>
                    <TableHeader className="text-right">Channels</TableHeader>
                  </TableRow>
                </TableHead>
                <tbody>
                  {rooms.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="hidden sm:table-cell">{r.description}</TableCell>
                      <TableCell className="text-right">{r.channelIds.length}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
              {rooms.total > rooms.items.length && (
                <p className="text-sm text-[var(--muted-foreground)]">
                  Showing {rooms.items.length} of {rooms.total}.
                </p>
              )}
            </>
          )
        }
      </Status>
    </Card>
  );
}
