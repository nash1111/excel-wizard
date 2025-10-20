import { utils } from "xlsx";
import type { ParsedSheet, ParsedWorkbook } from "./excel";

export interface SheetSelection {
  range?: string;
  firstRowIsHeader?: boolean;
}

export interface WorkbookSelectionConfig {
  sheets?: Record<string, SheetSelection>;
}

export interface ProcessedSheet {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  csv: string;
}

export interface ProcessedWorkbook {
  fileName: string;
  sheets: ProcessedSheet[];
}

const FALLBACK_COLUMN_PREFIX = "Column";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildColumnsFromHeaderRow(headerRow: unknown[], width: number) {
  return Array.from({ length: width }, (_, index) => {
    const raw = headerRow[index];
    const value = typeof raw === "string" ? raw.trim() : raw === null || raw === undefined ? "" : String(raw).trim();
    return value.length > 0 ? value : `${FALLBACK_COLUMN_PREFIX}_${index + 1}`;
  });
}

function buildGeneratedColumns(width: number) {
  return Array.from({ length: width }, (_, index) => `${FALLBACK_COLUMN_PREFIX}_${index + 1}`);
}

function extractRangeMatrix(matrix: unknown[][], range?: string): unknown[][] {
  if (!range) {
    return matrix;
  }
  try {
    const decoded = utils.decode_range(range);
    const maxRow = matrix.length > 0 ? matrix.length - 1 : 0;
    const maxCol = matrix.reduce((acc, row) => Math.max(acc, row.length - 1), 0);
    const startRow = clamp(decoded.s.r, 0, maxRow);
    const endRow = clamp(decoded.e.r, 0, maxRow);
    const startCol = clamp(decoded.s.c, 0, maxCol);
    const endCol = clamp(decoded.e.c, 0, maxCol);

    const result: unknown[][] = [];
    for (let r = startRow; r <= endRow; r += 1) {
      const sourceRow = matrix[r] ?? [];
      const newRow: unknown[] = [];
      for (let c = startCol; c <= endCol; c += 1) {
        newRow.push(sourceRow[c] ?? null);
      }
      result.push(newRow);
    }
    return result;
  } catch {
    return matrix;
  }
}

function matrixToRows(matrix: unknown[][], columns: string[], headerIncluded: boolean) {
  const dataRows = headerIncluded ? matrix.slice(1) : matrix;
  return dataRows.map(row => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, index) => {
      const value = row[index];
      record[col] = value ?? null;
    });
    return record;
  });
}

function rowsToCsv(columns: string[], rows: Record<string, unknown>[]) {
  if (columns.length === 0) {
    return "";
  }
  const header = columns.join(",");
  const lines = rows.map(row =>
    columns
      .map(column => {
        const value = row[column];
        if (value === null || value === undefined) {
          return "";
        }
        if (typeof value === "number" || typeof value === "bigint") {
          return String(value);
        }
        if (value instanceof Date) {
          return value.toISOString();
        }
        const text = String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(","),
  );
  return [header, ...lines].join("\n");
}

function processSheet(sheet: ParsedSheet, selection?: SheetSelection): ProcessedSheet {
  const trimmedRange = selection?.range?.trim();
  const targetMatrix = extractRangeMatrix(sheet.matrix, trimmedRange ? trimmedRange : undefined);

  if (targetMatrix.length === 0) {
    return {
      name: sheet.name,
      columns: [],
      rows: [],
      csv: "",
    };
  }

  const headerIncluded = selection?.firstRowIsHeader !== false;
  const width = targetMatrix.reduce((max, row) => Math.max(max, row.length), 0);

  if (width === 0) {
    return {
      name: sheet.name,
      columns: [],
      rows: [],
      csv: "",
    };
  }

  const headerRow = targetMatrix[0] ?? [];
  const columns = headerIncluded ? buildColumnsFromHeaderRow(headerRow, width) : buildGeneratedColumns(width);
  const rows = matrixToRows(targetMatrix, columns, headerIncluded);
  const csv = rowsToCsv(columns, rows);

  return {
    name: sheet.name,
    columns,
    rows,
    csv,
  };
}

export function applySelection(workbook: ParsedWorkbook, config: WorkbookSelectionConfig): ProcessedWorkbook {
  const sheets = workbook.sheets.map(sheet => {
    const selection = config.sheets?.[sheet.name];
    return processSheet(sheet, selection);
  });

  return {
    fileName: workbook.fileName,
    sheets,
  };
}
