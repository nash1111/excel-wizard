interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
}

// Config will be loaded from server or build-time injection
let config: AzureOpenAIConfig | null = null;

// Load config from server API
async function loadConfig(): Promise<AzureOpenAIConfig> {
  if (config) return config;

  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.status}`);
    }
    const data = await response.json();
    config = data.azureOpenAI;

    // Validate required fields
    if (!config?.endpoint || !config?.apiKey || !config?.deployment || !config?.apiVersion) {
      throw new Error(
        "Missing required Azure OpenAI configuration.\n" +
        "Please copy .env.example to .env and fill in your Azure OpenAI credentials."
      );
    }

    return config;
  } catch (error) {
    console.error("Failed to load Azure OpenAI config:", error);
    throw new Error(
      "Missing required environment variables for Azure OpenAI.\n" +
      "Please copy .env.example to .env and fill in your Azure OpenAI credentials."
    );
  }
}

export async function chatWithAzureOpenAI(
  messages: ChatMessage[],
  systemPrompt?: string,
): Promise<string> {
  const cfg = await loadConfig();

  const allMessages: ChatMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  // Remove trailing slash from endpoint if present
  const endpoint = cfg.endpoint.endsWith('/') ? cfg.endpoint.slice(0, -1) : cfg.endpoint;
  const url = `${endpoint}/openai/deployments/${cfg.deployment}/chat/completions?api-version=${cfg.apiVersion}`;

  console.log("Making request to:", url);
  console.log("Using deployment:", cfg.deployment);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": cfg.apiKey,
    },
    body: JSON.stringify({
      messages: allMessages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("API Error Response:", errorText);
    throw new Error(`Azure OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data: ChatCompletionResponse = await response.json();
  return data.choices[0]?.message?.content || "No response from AI";
}

export interface QuerySuggestion {
  query: string;
  explanation: string;
}

export async function getSQLQuerySuggestion(
  userQuestion: string,
  availableTables: string[],
  tableSchemas?: Record<string, { columns: string[]; sampleRows: any[] }>,
): Promise<QuerySuggestion> {
  const schemaInfo = tableSchemas
    ? Object.entries(tableSchemas)
        .map(
          ([tableName, schema]) =>
            `Table: ${tableName}\nColumns: ${schema.columns.join(", ")}\nSample data: ${JSON.stringify(schema.sampleRows.slice(0, 2))}`,
        )
        .join("\n\n")
    : `Available tables: ${availableTables.join(", ")}`;

  const systemPrompt = `You are a SQL query assistant for DuckDB. You help users write SQL queries based on their Excel data.

${schemaInfo}

Your task:
1. Understand the user's question
2. Generate a valid DuckDB SQL query
3. Provide a brief explanation

Respond in JSON format:
{
  "query": "SELECT ...",
  "explanation": "This query will..."
}

Important:
- Use double quotes for table names: "table_name"
- DuckDB supports standard SQL and many PostgreSQL features
- Keep queries simple and efficient
- Always LIMIT results to avoid overwhelming the UI`;

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: userQuestion,
    },
  ];

  const response = await chatWithAzureOpenAI(messages, systemPrompt);

  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        query: parsed.query || "",
        explanation: parsed.explanation || "",
      };
    }
  } catch (error) {
    console.error("Failed to parse AI response:", error);
  }

  // Fallback: try to extract SQL query
  const sqlMatch = response.match(/SELECT[\s\S]*?;/i);
  return {
    query: sqlMatch ? sqlMatch[0] : "",
    explanation: response,
  };
}
