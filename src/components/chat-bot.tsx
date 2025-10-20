import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSQLQuerySuggestion } from "@/lib/azure-openai";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  query?: string;
}

interface ChatBotProps {
  availableTables: string[];
  tableSchemas?: Record<string, { columns: string[]; sampleRows: any[] }>;
  onExecuteQuery: (query: string) => void;
}

export function ChatBot({ availableTables, tableSchemas, onExecuteQuery }: ChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const suggestion = await getSQLQuerySuggestion(input, availableTables, tableSchemas);

      const assistantMessage: Message = {
        role: "assistant",
        content: suggestion.explanation,
        query: suggestion.query,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExecuteQuery = (query: string) => {
    onExecuteQuery(query);
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="h-14 w-14 rounded-full shadow-lg"
          title="Open SQL Assistant"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96">
      <Card className="flex h-[600px] flex-col shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">SQL Assistant</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
        </CardHeader>

        <CardContent className="flex-1 space-y-4 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Ask me to help you write SQL queries!</p>
                <p className="text-xs text-muted-foreground">
                  Try: "Show me the top 10 rows" or "Calculate the average"
                </p>
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-4 py-2",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.query && (
                    <div className="mt-2 space-y-2">
                      <div className="rounded bg-slate-900 p-2">
                        <code className="text-xs text-green-400">{message.query}</code>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={() => handleExecuteQuery(message.query!)}
                      >
                        Execute Query
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2">
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-500" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-500 animation-delay-200" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-slate-500 animation-delay-400" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <CardFooter className="border-t pt-4">
          <div className="flex w-full gap-2">
            <Input
              placeholder="Ask for SQL help..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
            <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
              Send
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
