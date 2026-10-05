export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatSource {
  title: string;
  url: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  conversationId?: string;
}

export interface ChatResponse {
  answer: string;
  sources?: ChatSource[];
  conversationId?: string;
}

export type ChatRequestHandler = (request: ChatRequest) => Promise<ChatResponse>;

export interface RagChatboxProps {
  /** API URL receiving the documented JSON request. Use either endpoint or onRequest. */
  endpoint?: string;
  /** Custom transport for auth, custom API formats, or server actions. */
  onRequest?: ChatRequestHandler;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  assistantName?: string;
  welcomeMessage?: string;
  mode?: "floating" | "inline";
  initialOpen?: boolean;
  className?: string;
  theme?: "light" | "dark" | "system";
  primaryColor?: string;
  onMessage?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
  onReset?: () => void;
}

