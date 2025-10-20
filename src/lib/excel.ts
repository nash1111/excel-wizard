import type { WorkBook, WorkSheet } from "xlsx";
import { read, utils } from "xlsx";

export interface ParsedSheet {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  csv: string;
  matrix: unknown[][];
}

export interface ParsedWorkbook {
  fileName: string;
  sheets: ParsedSheet[];
}

const FALLBACK_COLUMN_PREFIX = "Column";

function normaliseHeaderRow(sheet: WorkSheet): string[] {
  const range = sheet["!ref"] ? utils.decode_range(sheet["!ref"]) : null;
  const width = range ? range.e.c - range.s.c + 1 : undefined;
  const headerRows = utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  const firstRow = headerRows[0] ?? [];
  const finalWidth = width ?? firstRow.length;

  return Array.from({ length: finalWidth }, (_, index) => {
    const raw = firstRow[index];
    const value = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    return value.length > 0 ? value : `${FALLBACK_COLUMN_PREFIX}_${index + 1}`;
  });
}

function serialiseValue(value: unknown): string {
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
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const header = columns.map(serialiseValue).join(",");
  const dataRows = rows.map(row => columns.map(column => serialiseValue(row[column])).join(","));
  return [header, ...dataRows].join("\n");
}

export async function parseExcel(file: File): Promise<ParsedWorkbook> {
  const data = await file.arrayBuffer();
  const workbook = read(data, { type: "array" });

  const sheets: ParsedSheet[] = workbook.SheetNames.map(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      return {
        name: sheetName,
        columns: [],
        rows: [],
        csv: "",
        matrix: [],
      };
    }
    const rawRows = utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      raw: true,
      defval: null,
    });
    const columns = normaliseHeaderRow(worksheet);
    const matrix = utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: null });

    const rows = rawRows.map(row => {
      const normalised: Record<string, unknown> = {};
      columns.forEach((column, index) => {
        if (Object.prototype.hasOwnProperty.call(row, column)) {
          normalised[column] = row[column];
          return;
        }
        const fallbackKey = Object.keys(row)[index];
        normalised[column] = fallbackKey !== undefined ? row[fallbackKey] : null;
      });
      return normalised;
    });

    const csv = buildCsv(columns, rows);

    return {
      name: sheetName,
      columns,
      rows,
      csv,
      matrix,
    };
  });

  return {
    fileName: file.name,
    sheets,
  };
}
