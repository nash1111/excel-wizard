import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { SheetTable } from "@/components/sheet-table";

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

interface QueryPanelProps {
  availableTables: string[];
  defaultQuery: string;
  onExecute: (query: string) => Promise<QueryResult>;
}

export interface QueryPanelRef {
  setQuery: (query: string) => void;
  executeQuery: () => void;
}

export const QueryPanel = forwardRef<QueryPanelRef, QueryPanelProps>(
  ({ availableTables, defaultQuery, onExecute }, ref) => {
    const [query, setQuery] = useState(defaultQuery);
    const [result, setResult] = useState<QueryResult | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Update query when defaultQuery changes (e.g., when sheet or table changes)
    useEffect(() => {
      if (defaultQuery) {
        setQuery(defaultQuery);
      }
    }, [defaultQuery]);

    const run = async () => {
      try {
        setIsRunning(true);
        setError(null);
        const response = await onExecute(query);
        setResult(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to execute query");
      } finally {
        setIsRunning(false);
      }
    };

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      setQuery,
      executeQuery: run,
    }));

    return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>SQL Query</CardTitle>
        <CardDescription>Execute queries with DuckDB Wasm. Available tables: {availableTables.join(", ") || "None"}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <div className="border rounded-md overflow-hidden">
          <Editor
            height="300px"
            defaultLanguage="sql"
            theme="vs-dark"
            value={query}
            onChange={value => setQuery(value ?? "")}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: "on",
              automaticLayout: true,
            }}
          />
        </div>
        <Button onClick={run} disabled={isRunning}>
          {isRunning ? "Running..." : "Execute Query"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {result ? (
          <div className="space-y-2">
            <h3 className="font-medium">Results</h3>
            <div className="max-h-[400px] overflow-auto">
              <SheetTable columns={result.columns} rows={result.rows} limit={100} />
            </div>
          </div>
        ) : null}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">DuckDB Wasm runs in-browser, so your data stays local.</p>
      </CardFooter>
    </Card>
    );
  },
);
