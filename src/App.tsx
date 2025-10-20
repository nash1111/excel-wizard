import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExcelUploader } from "@/components/excel-uploader";
import { SheetChart } from "@/components/sheet-chart";
import { SheetTable } from "@/components/sheet-table";
import { QueryPanel, type QueryResult } from "@/components/query-panel";
import { RangeSelector } from "@/components/range-selector";
import { ChatBot } from "@/components/chat-bot";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "./index.css";
import type { ParsedWorkbook } from "@/lib/excel";
import { applySelection, type ProcessedWorkbook, type WorkbookSelectionConfig } from "@/lib/selection";
import { dropTable, getDuckDB, registerCsvAsTable, runQuery } from "@/lib/duckdb";

interface SheetTableMapping {
  [sheetName: string]: string;
}

function normaliseTableName(fileName: string, sheetName: string, index: number) {
  const baseName = `${fileName.replace(/\.[^/.]+$/, "")}_${sheetName || `sheet_${index + 1}`}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return baseName.length > 0 ? baseName : `sheet_${index + 1}`;
}

function createDefaultSelectionConfig(parsed: ParsedWorkbook): WorkbookSelectionConfig {
  const sheetsConfig: NonNullable<WorkbookSelectionConfig["sheets"]> = {};
  parsed.sheets.forEach(sheet => {
    sheetsConfig[sheet.name] = {
      range: "",
      firstRowIsHeader: true,
    };
  });
  return { sheets: sheetsConfig };
}

export function App() {
  const [duckReady, setDuckReady] = useState(false);
  const [initialising, setInitialising] = useState(true);
  const [duckError, setDuckError] = useState<string | null>(null);
  const [rawWorkbook, setRawWorkbook] = useState<ParsedWorkbook | null>(null);
  const [processedWorkbook, setProcessedWorkbook] = useState<ProcessedWorkbook | null>(null);
  const [selectionConfig, setSelectionConfig] = useState<WorkbookSelectionConfig>({ sheets: {} });
  const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null);
  const [tableMap, setTableMap] = useState<SheetTableMapping>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const syncTablesWithProcessed = useCallback(
    async (processed: ProcessedWorkbook) => {
      // Get previous tables and drop them
      setTableMap(prevTableMap => {
        const previousTables = Object.values(prevTableMap);
        if (previousTables.length > 0) {
          Promise.all(previousTables.map(name => dropTable(name))).catch(err => {
            console.error("Failed to drop tables:", err);
          });
        }
        return prevTableMap;
      });

      const newMap: SheetTableMapping = {};
      for (const [index, sheet] of processed.sheets.entries()) {
        if (sheet.rows.length === 0 || sheet.columns.length === 0) {
          continue;
        }

        const tableName = normaliseTableName(processed.fileName, sheet.name, index);

        try {
          await registerCsvAsTable(tableName, sheet.csv);
          newMap[sheet.name] = tableName;
        } catch (err) {
          console.error(`Failed to register table ${tableName}:`, err);
          throw err;
        }
      }

      setTableMap(newMap);
      return newMap;
    },
    [],
  );

  useEffect(() => {
    (async () => {
      try {
        await getDuckDB();
        setDuckReady(true);
      } catch (error) {
        setDuckError(error instanceof Error ? error.message : "Failed to initialize DuckDB");
      } finally {
        setInitialising(false);
      }
    })();

    // Global error handler
    const handleError = (event: ErrorEvent) => {
      // Ignore benign ResizeObserver errors
      if (event.message.includes("ResizeObserver")) {
        return;
      }
      console.error("=== GLOBAL ERROR ===");
      console.error("Message:", event.message);
      console.error("Filename:", event.filename);
      console.error("Line:", event.lineno, "Column:", event.colno);
      console.error("Error object:", event.error);
      console.error("Stack:", event.error?.stack);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("=== UNHANDLED PROMISE REJECTION ===");
      console.error("Reason:", event.reason);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const handleWorkbookParsed = useCallback(async (parsed: ParsedWorkbook) => {
    setIsProcessing(true);
    setDuckError(null);
    try {
      const defaultConfig = createDefaultSelectionConfig(parsed);
      const processed = applySelection(parsed, defaultConfig);

      await syncTablesWithProcessed(processed);

      setRawWorkbook(parsed);
      setSelectionConfig(defaultConfig);
      setProcessedWorkbook(processed);

      const firstSheetWithData =
        processed.sheets.find(sheet => sheet.rows.length > 0 && sheet.columns.length > 0) ?? processed.sheets[0];
      setSelectedSheetName(firstSheetWithData?.name ?? null);
    } catch (error) {
      setDuckError(error instanceof Error ? error.message : "Failed to load Excel file");
    } finally {
      setIsProcessing(false);
    }
  }, [syncTablesWithProcessed]);

  const selectedSheet = useMemo(() => {
    if (!processedWorkbook || !selectedSheetName) {
      return null;
    }
    return processedWorkbook.sheets.find(sheet => sheet.name === selectedSheetName) ?? null;
  }, [processedWorkbook, selectedSheetName]);

  const selectedTableName = useMemo(() => {
    return selectedSheetName ? tableMap[selectedSheetName] ?? null : null;
  }, [selectedSheetName, tableMap]);

  const defaultQuery = useMemo(() => {
    return selectedTableName ? `SELECT * FROM "${selectedTableName}" LIMIT 100;` : "SELECT 1;";
  }, [selectedTableName]);

  const availableTables = useMemo(() => {
    return Object.values(tableMap);
  }, [tableMap]);

  const handleSelectionConfigChange = useCallback(async (config: WorkbookSelectionConfig) => {
    setSelectionConfig(config);
    if (!rawWorkbook) {
      return;
    }
    setIsProcessing(true);
    setDuckError(null);
    try {
      const processed = applySelection(rawWorkbook, config);
      await syncTablesWithProcessed(processed);
      setProcessedWorkbook(processed);

      if (selectedSheetName) {
        const current = processed.sheets.find(sheet => sheet.name === selectedSheetName);
        if (!current || current.rows.length === 0 || current.columns.length === 0) {
          const fallback =
            processed.sheets.find(sheet => sheet.rows.length > 0 && sheet.columns.length > 0) ?? processed.sheets[0];
          setSelectedSheetName(fallback?.name ?? null);
        }
      } else if (processed.sheets.length > 0) {
        const fallback =
          processed.sheets.find(sheet => sheet.rows.length > 0 && sheet.columns.length > 0) ?? processed.sheets[0];
        setSelectedSheetName(fallback?.name ?? null);
      }
    } catch (error) {
      console.error("Error in handleSelectionConfigChange:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to apply import settings";
      setDuckError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [rawWorkbook, selectedSheetName, syncTablesWithProcessed]);

  const executeQuery = useCallback(async (sql: string): Promise<QueryResult> => {
    const result = await runQuery(sql);
    const array = typeof result.toArray === "function" ? result.toArray() : [];
    const rows = array.map((row: any) => (typeof row.toJSON === "function" ? row.toJSON() : row));
    const columns =
      (result.schema?.fields?.map((field: { name: string }) => field.name) as string[] | undefined) ??
      (rows[0] ? Object.keys(rows[0]) : []);
    return {
      columns,
      rows,
    };
  }, []);

  // For ChatBot to execute queries
  const queryPanelRef = useRef<{ setQuery: (query: string) => void; executeQuery: () => void }>(null);

  const handleChatBotQuery = useCallback((query: string) => {
    if (queryPanelRef.current) {
      queryPanelRef.current.setQuery(query);
      setTimeout(() => {
        queryPanelRef.current?.executeQuery();
      }, 100);
    }
  }, []);

  // Prepare table schemas for ChatBot
  const tableSchemas = useMemo(() => {
    if (!processedWorkbook) return {};
    const schemas: Record<string, { columns: string[]; sampleRows: any[] }> = {};
    processedWorkbook.sheets.forEach(sheet => {
      const tableName = tableMap[sheet.name];
      if (tableName) {
        schemas[tableName] = {
          columns: sheet.columns,
          sampleRows: sheet.rows.slice(0, 3),
        };
      }
    });
    return schemas;
  }, [processedWorkbook, tableMap]);

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100">
      <header className="mb-6 px-4 py-6 sm:px-6">
        <h1 className="text-3xl font-bold">Excel Wizard</h1>
        <p className="text-sm text-slate-300">
          Drag & drop Excel files to visualize and analyze data with shadcn/ui and DuckDB Wasm.
        </p>
      </header>

      <div className="space-y-6 px-4 sm:px-6">
          {/* Upload Section */}
          <ExcelUploader onParsed={handleWorkbookParsed} disabled={!duckReady || isProcessing} />
          {initialising ? <p className="text-sm text-muted-foreground">Initializing DuckDB...</p> : null}
          {duckError ? <p className="text-sm text-destructive">{duckError}</p> : null}
          {isProcessing ? <p className="text-sm text-muted-foreground">Updating data...</p> : null}

          {/* Import Settings - Full Width */}
          {rawWorkbook ? (
            <RangeSelector
              workbook={rawWorkbook}
              config={selectionConfig}
              onConfigChange={handleSelectionConfigChange}
              disabled={isProcessing}
            />
          ) : null}

          {/* Data Display & Query Section - Side by Side */}
          {processedWorkbook && processedWorkbook.sheets.length > 0 ? (
            <div className="grid gap-6 xl:grid-cols-2">
              {/* Left Column - Sheet Data */}
              <div className="flex min-w-0 flex-col gap-6">
                <Card className="min-w-0">
                  <CardHeader className="space-y-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{processedWorkbook.fileName}</CardTitle>
                      <CardDescription>Switch sheets to view data</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground shrink-0">Sheet:</span>
                      <Select
                        value={selectedSheetName || processedWorkbook.sheets[0]?.name || ""}
                        onValueChange={setSelectedSheetName}
                      >
                        <SelectTrigger className="w-full max-w-[200px]">
                          <SelectValue placeholder="Select a sheet" />
                        </SelectTrigger>
                        <SelectContent>
                          {processedWorkbook.sheets.map(sheet => (
                            <SelectItem key={sheet.name} value={sheet.name}>
                              {sheet.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent className="min-w-0">
                    {selectedSheet ? (
                      <div className="overflow-auto">
                        <SheetTable columns={selectedSheet.columns} rows={selectedSheet.rows} />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No data in this sheet.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Chart below table */}
                {selectedSheet ? (
                  <div className="min-w-0">
                    <SheetChart sheetName={selectedSheet.name} columns={selectedSheet.columns} rows={selectedSheet.rows} />
                  </div>
                ) : null}
              </div>

              {/* Right Column - SQL Query */}
              <div className="min-w-0">
                <QueryPanel
                  ref={queryPanelRef}
                  key={processedWorkbook?.fileName ?? "no-file"}
                  availableTables={availableTables}
                  defaultQuery={defaultQuery}
                  onExecute={executeQuery}
                />
              </div>
            </div>
          ) : null}
      </div>

      {/* ChatBot - Only show when data is loaded */}
      {processedWorkbook && processedWorkbook.sheets.length > 0 && (
        <ChatBot
          availableTables={availableTables}
          tableSchemas={tableSchemas}
          onExecuteQuery={handleChatBotQuery}
        />
      )}
    </div>
  );
}

export default App;
