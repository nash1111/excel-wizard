import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ChartData, ChartDataset, ChartOptions } from "chart.js";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface SheetChartProps {
  sheetName: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

function detectNumericColumns(columns: string[], rows: Record<string, unknown>[]) {
  return columns.filter(column => rows.some(row => typeof row[column] === "number"));
}

function detectLabelColumns(columns: string[], rows: Record<string, unknown>[]) {
  return columns.filter(column => rows.some(row => {
    const value = row[column];
    return typeof value === "string" || value instanceof Date;
  }));
}

export function SheetChart({ sheetName, columns, rows }: SheetChartProps) {
  const numericColumns = useMemo(() => detectNumericColumns(columns, rows), [columns, rows]);
  const labelColumns = useMemo(() => detectLabelColumns(columns, rows), [columns, rows]);

  const [labelColumn, setLabelColumn] = useState<string>("");
  const [valueColumn, setValueColumn] = useState<string>("");

  useEffect(() => {
    setLabelColumn(prev => (prev && labelColumns.includes(prev) ? prev : labelColumns[0] ?? ""));
  }, [labelColumns]);

  useEffect(() => {
    setValueColumn(prev => (prev && numericColumns.includes(prev) ? prev : numericColumns[0] ?? ""));
  }, [numericColumns]);

  const chartData = useMemo<ChartData<"bar", number[], string> | null>(() => {
    if (!labelColumn || !valueColumn) {
      return null;
    }
    const limitedRows = rows.slice(0, 20);
    const labels: string[] = limitedRows.map(row => {
      const value = row[labelColumn];
      if (value instanceof Date) {
        return value.toISOString().split("T")[0];
      }
      return typeof value === "string" ? value : String(value ?? "");
    });
    const data: number[] = limitedRows.map(row => {
      const value = row[valueColumn];
      return typeof value === "number" ? value : Number(value ?? 0);
    });

    const validPairs = labels
      .map((label, index) => ({ label, value: data[index] }))
      .filter(item => Number.isFinite(item.value));

    if (validPairs.length === 0) {
      return null;
    }

    const dataset: ChartDataset<"bar", number[]> = {
      label: valueColumn,
      data: validPairs.map(item => item.value as number),
      backgroundColor: "rgba(59, 130, 246, 0.6)",
      borderColor: "rgba(37, 99, 235, 1)",
      borderWidth: 1,
    };

    const sanitizedLabels: string[] = validPairs.map(item => item.label);

    return {
      labels: sanitizedLabels,
      datasets: [dataset],
    };
  }, [labelColumn, rows, valueColumn]);

  const chartOptions: ChartOptions<"bar"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2,
      plugins: {
        legend: { position: "top" },
        tooltip: { mode: "index" },
      },
      scales: {
        x: { ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 } },
        y: { beginAtZero: true },
      },
    }),
    [],
  );

  if (labelColumns.length === 0 || numericColumns.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chart Visualization</CardTitle>
          <CardDescription>Both label and numeric columns are required</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Please ensure data contains both text and numeric columns.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="space-y-3">
        <div>
          <CardTitle>Chart Visualization</CardTitle>
          <CardDescription className="truncate">Display selected columns from {sheetName} as a bar chart</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={labelColumn || ""} onValueChange={value => setLabelColumn(value)}>
            <SelectTrigger className="w-full max-w-[180px]">
              <SelectValue placeholder="Label column" />
            </SelectTrigger>
            <SelectContent>
              {labelColumns.map(column => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={valueColumn || ""} onValueChange={value => setValueColumn(value)}>
            <SelectTrigger className="w-full max-w-[180px]">
              <SelectValue placeholder="Value column" />
            </SelectTrigger>
            <SelectContent>
              {numericColumns.map(column => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {!chartData || chartData.labels?.length === 0 ? (
          <p className="text-sm text-muted-foreground">Both numeric and label columns are required.</p>
        ) : (
          <div className="min-w-0">
            <Bar options={chartOptions} data={chartData} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
