import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkbookSelectionConfig } from "@/lib/selection";

interface ImportConfigEditorProps {
  config: WorkbookSelectionConfig;
  onConfigChange: (config: WorkbookSelectionConfig) => void;
  disabled?: boolean;
}

function stringifyConfig(config: WorkbookSelectionConfig) {
  return JSON.stringify(config, null, 2);
}

export function ImportConfigEditor({ config, onConfigChange, disabled }: ImportConfigEditorProps) {
  const [editorValue, setEditorValue] = useState(() => stringifyConfig(config));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditorValue(stringifyConfig(config));
  }, [config]);

  const monacoOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      fontSize: 14,
      readOnly: disabled,
      automaticLayout: true,
      wordWrap: "on" as const,
    }),
    [disabled],
  );

  const handleChange = (value?: string) => {
    const nextValue = value ?? "";
    setEditorValue(nextValue);
    try {
      const parsed = JSON.parse(nextValue);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Root must be an object");
      }
      if (parsed.sheets && typeof parsed.sheets !== "object") {
        throw new Error("sheets field must be an object");
      }
      setError(null);
      onConfigChange(parsed as WorkbookSelectionConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse configuration");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Settings</CardTitle>
        <CardDescription>
          Specify cell range (e.g., "A1:D20") and header settings per sheet in JSON format. Remove fields to use defaults.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="border rounded-md overflow-hidden">
          <Editor
            height="240px"
            defaultLanguage="json"
            theme="vs-dark"
            value={editorValue}
            onChange={handleChange}
            options={monacoOptions}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Example:
          <code className="ml-1 rounded bg-muted px-1 py-0.5">
            {"{\"sheets\":{\"Sheet1\":{\"range\":\"B2:E20\",\"firstRowIsHeader\":false}}}"}
          </code>
        </p>
        {error ? <p className="text-sm text-destructive">Configuration error: {error}</p> : null}
      </CardContent>
    </Card>
  );
}
