import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ParsedWorkbook } from "@/lib/excel";
import type { WorkbookSelectionConfig } from "@/lib/selection";
import { cn } from "@/lib/utils";

interface RangeSelectorProps {
  workbook: ParsedWorkbook;
  config: WorkbookSelectionConfig;
  onConfigChange: (config: WorkbookSelectionConfig) => void;
  disabled?: boolean;
}

interface CellPosition {
  row: number;
  col: number;
}

interface SelectionState {
  start: CellPosition | null;
  end: CellPosition | null;
}

function cellToExcelNotation(row: number, col: number): string {
  let colName = "";
  let c = col;
  while (c >= 0) {
    colName = String.fromCharCode(65 + (c % 26)) + colName;
    c = Math.floor(c / 26) - 1;
  }
  return `${colName}${row + 1}`;
}

function selectionToRange(selection: SelectionState): string {
  if (!selection.start || !selection.end) {
    return "";
  }
  const startCell = cellToExcelNotation(
    Math.min(selection.start.row, selection.end.row),
    Math.min(selection.start.col, selection.end.col),
  );
  const endCell = cellToExcelNotation(
    Math.max(selection.start.row, selection.end.row),
    Math.max(selection.start.col, selection.end.col),
  );
  return `${startCell}:${endCell}`;
}

function isCellInSelection(row: number, col: number, selection: SelectionState): boolean {
  if (!selection.start || !selection.end) {
    return false;
  }
  const minRow = Math.min(selection.start.row, selection.end.row);
  const maxRow = Math.max(selection.start.row, selection.end.row);
  const minCol = Math.min(selection.start.col, selection.end.col);
  const maxCol = Math.max(selection.start.col, selection.end.col);
  return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
}

export function RangeSelector({ workbook, config, onConfigChange, disabled }: RangeSelectorProps) {
  const [selectedSheet, setSelectedSheet] = useState<string>(() => workbook.sheets[0]?.name ?? "");
  const [selection, setSelection] = useState<SelectionState>({ start: null, end: null });
  const [isSelecting, setIsSelecting] = useState(false);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!workbook.sheets.find(s => s.name === selectedSheet)) {
      setSelectedSheet(workbook.sheets[0]?.name ?? "");
    }
  }, [workbook, selectedSheet]);

  const currentSheet = useMemo(() => {
    return workbook.sheets.find(sheet => sheet.name === selectedSheet) ?? workbook.sheets[0];
  }, [workbook.sheets, selectedSheet]);

  const currentConfig = useMemo(() => {
    return config.sheets?.[selectedSheet] ?? { range: "", firstRowIsHeader: true };
  }, [config.sheets, selectedSheet]);

  useEffect(() => {
    if (currentConfig.range) {
      // Parse existing range if available (optional enhancement)
    }
    setFirstRowIsHeader(currentConfig.firstRowIsHeader ?? true);
  }, [currentConfig]);

  const handleMouseDown = useCallback(
    (row: number, col: number) => {
      if (disabled) {
        return;
      }
      setIsSelecting(true);
      setSelection({ start: { row, col }, end: { row, col } });
    },
    [disabled],
  );

  const handleMouseEnter = useCallback(
    (row: number, col: number) => {
      if (isSelecting && selection.start) {
        setSelection(prev => ({ ...prev, end: { row, col } }));
      }
    },
    [isSelecting, selection.start],
  );

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsSelecting(false);
    };
    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, []);

  useEffect(() => {
    // Only trigger if we have a valid selection and we just finished selecting
    if (!selection.start || !selection.end || isSelecting) {
      return;
    }

    const range = selectionToRange(selection);
    const currentRange = config.sheets?.[selectedSheet]?.range ?? "";
    const currentFirstRowIsHeader = config.sheets?.[selectedSheet]?.firstRowIsHeader ?? true;

    // Only update if something actually changed
    if (range !== currentRange || firstRowIsHeader !== currentFirstRowIsHeader) {
      const newSheetConfig = {
        range,
        firstRowIsHeader,
      };
      const newConfig: WorkbookSelectionConfig = {
        sheets: {
          ...config.sheets,
          [selectedSheet]: newSheetConfig,
        },
      };
      onConfigChange(newConfig);
    }
  }, [selection, isSelecting, config.sheets, firstRowIsHeader, onConfigChange, selectedSheet]);


  const handleFirstRowHeaderChange = useCallback(
    (value: string) => {
      const isHeader = value === "true";
      setFirstRowIsHeader(isHeader);
      const currentRange = config.sheets?.[selectedSheet]?.range ?? "";
      const newConfig: WorkbookSelectionConfig = {
        sheets: {
          ...config.sheets,
          [selectedSheet]: {
            range: currentRange,
            firstRowIsHeader: isHeader,
          },
        },
      };
      onConfigChange(newConfig);
    },
    [config.sheets, onConfigChange, selectedSheet],
  );

  const previewRows = useMemo(() => {
    return currentSheet?.matrix.slice(0, 20) ?? [];
  }, [currentSheet]);

  const maxCols = useMemo(() => {
    return previewRows.reduce((max, row) => Math.max(max, row.length), 0);
  }, [previewRows]);

  const rangeText = useMemo(() => {
    return selectionToRange(selection);
  }, [selection]);

  if (!currentSheet) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import Settings</CardTitle>
          <CardDescription>No sheets available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Settings</CardTitle>
        <CardDescription>Drag to select a range in the table below</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label>Sheet:</Label>
            <Select value={selectedSheet} onValueChange={setSelectedSheet} disabled={disabled}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workbook.sheets.map(sheet => (
                  <SelectItem key={sheet.name} value={sheet.name}>
                    {sheet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label>First row is header:</Label>
            <Select value={String(firstRowIsHeader)} onValueChange={handleFirstRowHeaderChange} disabled={disabled}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rangeText ? (
            <div className="flex items-center gap-2">
              <Label>Range:</Label>
              <span className="text-sm font-mono text-muted-foreground">{rangeText}</span>
            </div>
          ) : null}
        </div>

        <div className="overflow-auto max-h-[400px] border rounded-md" ref={tableRef}>
          <table className="w-full text-xs border-collapse">
            <tbody>
              {previewRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {Array.from({ length: maxCols }, (_, colIndex) => {
                    const value = row[colIndex];
                    const isSelected = isCellInSelection(rowIndex, colIndex, selection);
                    const displayValue =
                      value === null || value === undefined || value === ""
                        ? ""
                        : value instanceof Date
                          ? value.toISOString().split("T")[0]
                          : String(value);

                    return (
                      <td
                        key={colIndex}
                        className={cn(
                          "border border-slate-700 px-2 py-1 cursor-cell select-none min-w-[60px] max-w-[200px] truncate",
                          isSelected && "bg-blue-500/30 border-blue-400",
                          disabled && "cursor-not-allowed opacity-50",
                        )}
                        onMouseDown={() => handleMouseDown(rowIndex, colIndex)}
                        onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
                        onMouseUp={handleMouseUp}
                      >
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Drag across cells to select a range. The selection will be applied automatically. To reset, simply select a new range.
        </p>
      </CardContent>
    </Card>
  );
}
