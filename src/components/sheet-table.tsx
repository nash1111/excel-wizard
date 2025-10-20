import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SheetTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  limit?: number;
}

export function SheetTable({ columns, rows, limit = 50 }: SheetTableProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No data in this sheet.</p>;
  }

  const previewRows = rows.slice(0, limit);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map(column => (
              <TableHead key={column}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {previewRows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {columns.map(column => {
                const value = row[column];
                if (value === null || value === undefined || value === "") {
                  return (
                    <TableCell key={column}>
                      <span className="text-muted-foreground">NULL</span>
                    </TableCell>
                  );
                }
                const display =
                  typeof value === "object" && !(value instanceof Date) ? JSON.stringify(value) : value instanceof Date ? value.toISOString() : String(value);
                return <TableCell key={column}>{display}</TableCell>;
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > limit ? (
        <div className="border-t p-2 text-xs text-muted-foreground">Showing first {limit} of {rows.length} rows.</div>
      ) : null}
    </div>
  );
}
