import { useState, useRef, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseExcel, type ParsedWorkbook } from "@/lib/excel";
import { cn } from "@/lib/utils";

interface ExcelUploaderProps {
  onParsed: (workbook: ParsedWorkbook) => Promise<void> | void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];

function isExcelFile(file: File) {
  return ACCEPTED_TYPES.includes(file.type) || file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
}

export function ExcelUploader({ onParsed, disabled }: ExcelUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetDrag = () => setIsDragging(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    const file = files[0];
    if (!isExcelFile(file)) {
      setStatus("Only .xlsx / .xls files are supported");
      return;
    }

    try {
      setStatus("Loading...");
      const workbook = await parseExcel(file);
      await onParsed(workbook);
      setStatus(`Loaded "${file.name}"`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load file");
    }
  };

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    resetDrag();
    if (disabled) {
      return;
    }
    await handleFiles(event.dataTransfer.files);
  };

  const triggerBrowse = () => {
    if (!disabled) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.click();
      }
    }
  };

  return (
    <Card className="border-dashed border-2 border-muted-foreground/40">
      <CardHeader>
        <CardTitle>Upload Excel</CardTitle>
        <CardDescription>Drag & drop or select a file to import data</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={event => {
            event.preventDefault();
            if (!disabled) {
              setIsDragging(true);
            }
          }}
          onDragLeave={resetDrag}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center transition-colors",
            isDragging && "border-primary bg-primary/10",
            disabled && "opacity-50",
          )}
        >
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept=".xlsx,.xls"
            onChange={event => handleFiles(event.target.files)}
            disabled={disabled}
          />
          <p className="text-sm text-muted-foreground">
            Drag files here or{" "}
            <button type="button" onClick={triggerBrowse} className="text-primary underline">
              click here
            </button>
            {" "}to select
          </p>
          <Button onClick={triggerBrowse} disabled={disabled} variant="secondary">
            Select File
          </Button>
          {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
