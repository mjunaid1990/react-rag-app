import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, ChatRequest, ChatResponse, ChatSource, RagChatboxProps } from "./types";

interface ViewMessage extends ChatMessage {
  id: number;
  createdAt: Date;
  sources?: ChatSource[];
  error?: boolean;
}

const makeId = () => Math.random();

function isChatResponse(value: unknown): value is ChatResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.answer === "string" &&
    (candidate.conversationId === undefined || typeof candidate.conversationId === "string") &&
    (candidate.sources === undefined || (Array.isArray(candidate.sources) && candidate.sources.every((source) =>
      !!source && typeof source === "object" && typeof (source as ChatSource).title === "string" && typeof (source as ChatSource).url === "string")));
}

function safeUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw, typeof window === "undefined" ? "https://local.invalid" : window.location.origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

async function sendToEndpoint(endpoint: string, request: ChatRequest): Promise<ChatResponse> {
  let url: URL;
  try {
    url = new URL(endpoint, typeof window === "undefined" ? undefined : window.location.href);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use an HTTP or HTTPS API URL.");
  } catch {
    throw new Error("The chat endpoint is missing or invalid. Set a valid HTTP(S) endpoint URL.");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`The assistant could not respond (HTTP ${response.status}).`);
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error("The chat service returned invalid JSON."); }
  if (!isChatResponse(data)) throw new Error("The chat service response is invalid. Expected an answer string and optional sources.");
  return data;
}

export function RagChatbox({
  endpoint,
  onRequest,
  title = "Ask our assistant",
  subtitle = "Answers grounded in your knowledge base",
  placeholder = "Ask a question…",
  assistantName = "Assistant",
  welcomeMessage = "Hi! What can I help you find?",
  mode = "floating",
  initialOpen = false,
  className,
  theme = "light",
  primaryColor,
  onMessage,
  onError,
  onReset,
}: RagChatboxProps) {
  const [open, setOpen] = useState(mode === "inline" || initialOpen);
  const [messages, setMessages] = useState<ViewMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [lastFailed, setLastFailed] = useState<ChatMessage>();
  const [configError, setConfigError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const scrollAtBottom = useRef(true);
  const idRef = useRef(0);
  const requestGeneration = useRef(0);

  useEffect(() => {
    if (scrollAtBottom.current && listRef.current && typeof listRef.current.scrollTo === "function") {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading, open]);

  const submitMessage = useCallback(async (message: ChatMessage, retry = false) => {
    const trimmedEndpoint = endpoint?.trim();
    const handler = onRequest ?? (trimmedEndpoint ? (request: ChatRequest) => sendToEndpoint(trimmedEndpoint, request) : undefined);
    if (!handler) {
      const error = new Error("Chat is not configured. Set the endpoint prop or provide an onRequest handler.");
      setConfigError(error.message);
      onError?.(error);
      return;
    }
    setConfigError("");
    setLastFailed(undefined);
    setLoading(true);
    const generation = requestGeneration.current;
    if (!retry) {
      setMessages((current) => [...current, { ...message, id: ++idRef.current, createdAt: new Date() }]);
      onMessage?.(message);
    }
    const history = messages.filter((item) => !item.error).map(({ role, content }) => ({ role, content }));
    // The failed user turn is already in local state when retry is clicked.
    if (retry && history.at(-1)?.role === "user" && history.at(-1)?.content === message.content) history.pop();
    try {
      const result = await handler({ message: message.content, history, ...(conversationId ? { conversationId } : {}) });
      if (generation !== requestGeneration.current) return;
      if (!isChatResponse(result)) throw new Error("The chat handler returned an invalid response. Expected an answer string and optional sources.");
      setConversationId(result.conversationId ?? conversationId);
      setMessages((current) => [...current, {
        role: "assistant", content: result.answer, sources: result.sources, id: ++idRef.current, createdAt: new Date(),
      }]);
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      const error = cause instanceof Error ? cause : new Error("The assistant could not respond. Please try again.");
      setLastFailed(message);
      setMessages((current) => [...current, { role: "assistant", content: error.message, error: true, id: ++idRef.current, createdAt: new Date() }]);
      onError?.(error);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [endpoint, onError, onMessage, onRequest, messages, conversationId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || loading) return;
    setDraft("");
    void submitMessage({ role: "user", content });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const reset = () => {
    requestGeneration.current += 1;
    setMessages([]);
    setConversationId(undefined);
    setLastFailed(undefined);
    setConfigError("");
    setLoading(false);
    onReset?.();
  };

  return (
    <section
      className={["rag-chatbox", `rag-chatbox--${mode}`, className].filter(Boolean).join(" ")}
      data-theme={theme}
      style={primaryColor ? ({ "--rag-primary": primaryColor } as React.CSSProperties) : undefined}
      aria-label={title}
    >
      {mode === "floating" && !open ? (
        <button className="rag-chatbox__launcher" type="button" onClick={() => setOpen(true)} aria-label={`Open ${title}`}>
          <span aria-hidden="true">✦</span>
        </button>
      ) : (
        <div className="rag-chatbox__panel" role="region" aria-label={title}>
          <header className="rag-chatbox__header">
            <div className="rag-chatbox__avatar" aria-hidden="true">✦</div>
            <div className="rag-chatbox__heading">
              <h2>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <button className="rag-chatbox__icon-button" type="button" onClick={reset} aria-label="Clear conversation" title="Clear conversation">↻</button>
            {mode === "floating" && <button className="rag-chatbox__icon-button" type="button" onClick={() => setOpen(false)} aria-label="Minimize chat">−</button>}
          </header>

          <div className="rag-chatbox__messages" ref={listRef} onScroll={(event) => {
            const el = event.currentTarget;
            scrollAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
          }} aria-live="polite" aria-relevant="additions text">
            {!messages.length && <div className="rag-chatbox__welcome"><div className="rag-chatbox__welcome-icon" aria-hidden="true">✦</div><p>{welcomeMessage}</p></div>}
            {messages.map((message) => (
              <article key={message.id} className={`rag-chatbox__message rag-chatbox__message--${message.role}`}>
                {message.role === "assistant" && <span className="rag-chatbox__message-name">{assistantName}</span>}
                <div className={`rag-chatbox__bubble${message.error ? " rag-chatbox__bubble--error" : ""}`}>
                  {message.role === "assistant" && !message.error
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(url) => safeUrl(url) ?? ""} components={{ img: () => null }}>{message.content}</ReactMarkdown>
                    : <p>{message.content}</p>}
                </div>
                <time className="rag-chatbox__time" dateTime={message.createdAt.toISOString()}>{message.createdAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                {!!message.sources?.length && <div className="rag-chatbox__sources"><span>Sources</span>{message.sources.map((source, index) => {
                  const href = safeUrl(source.url);
                  return href ? <a key={`${source.url}-${index}`} href={href} target="_blank" rel="noopener noreferrer">{source.title || source.url}<span aria-hidden="true"> ↗</span></a> : <span className="rag-chatbox__source-invalid" key={`${source.url}-${index}`}>{source.title || "Unavailable source"}</span>;
                })}</div>}
                {message.error && lastFailed && <button className="rag-chatbox__retry" type="button" disabled={loading} onClick={() => void submitMessage(lastFailed, true)}>Try again</button>}
              </article>
            ))}
            {loading && <div className="rag-chatbox__thinking" role="status"><span></span><span></span><span></span><span className="rag-chatbox__sr-only">Assistant is thinking</span></div>}
          </div>

          {(configError || (!onRequest && !endpoint?.trim())) && <p className="rag-chatbox__config-error" role="alert">{configError || "Chat is not configured. Set the endpoint prop or provide an onRequest handler."}</p>}
          <form className="rag-chatbox__composer" onSubmit={submit}>
            <label className="rag-chatbox__sr-only" htmlFor="rag-chatbox-input">Message {assistantName}</label>
            <textarea id="rag-chatbox-input" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} rows={1} disabled={loading} />
            <button type="submit" disabled={loading || !draft.trim()} aria-label="Send message" title="Send message"><span aria-hidden="true">↑</span></button>
          </form>
          <footer className="rag-chatbox__footer">AI can make mistakes. Check important information.</footer>
        </div>
      )}
    </section>
  );
}
