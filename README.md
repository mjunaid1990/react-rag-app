# @xcodesol/rag-chatbox

A reusable, accessible React chat interface for applications that already have (or are building) a retrieval augmented generation (RAG) API. The package renders the chat experience and sends requests to your endpoint or custom request function.

It does not ingest documents, store embeddings, retrieve data, call model providers, or contain provider credentials. Those operations belong in a trusted backend.

## Install

```bash
npm install @xcodesol/rag-chatbox react react-dom
```

React and React DOM 18 or later are peer dependencies. Import the stylesheet once in your app:

```tsx
import { RagChatbox } from "@xcodesol/rag-chatbox";
import "@xcodesol/rag-chatbox/styles.css";

export function App() {
  return <RagChatbox endpoint="/api/chat" title="Ask our assistant" />;
}
```

The default presentation is a floating launcher. Use `mode="inline"` to render the panel in the page layout.

## Configure the endpoint

Pass the endpoint explicitly from your app. For a Vite consumer, put only the public API URL in `.env.local`:

```dotenv
VITE_RAG_API_URL=https://your-project.example/api/chat
```

```tsx
<RagChatbox endpoint={import.meta.env.VITE_RAG_API_URL} />
```

For Next.js, use `NEXT_PUBLIC_RAG_API_URL` and pass `process.env.NEXT_PUBLIC_RAG_API_URL`. Public environment variables are shipped to the browser. They may contain an API URL, but never provider keys, database passwords, service role keys, or other secrets. Keep `.env.local` out of version control. The demo includes a safe placeholder `.env.example`; copy it to `.env.local` to configure it.

The package does not read consumer environment files. An explicit `endpoint` is required unless you provide `onRequest`. When neither is provided, the UI shows a configuration error before sending.

## Backend contract

The endpoint receives a JSON `POST` request:

```json
{
  "message": "How do I reset my password?",
  "history": [
    { "role": "user", "content": "I cannot sign in." },
    { "role": "assistant", "content": "What happens when you try?" }
  ],
  "conversationId": "optional-existing-id"
}
```

`history` contains messages from before the current message. The optional `conversationId` is omitted until the backend returns one. Return JSON in this shape:

```json
{
  "answer": "Use the password reset page and follow the link sent to your email.",
  "sources": [
    { "title": "Password reset guide", "url": "https://example.com/help/reset" }
  ],
  "conversationId": "conversation-123"
}
```

`answer` is required. `sources` and `conversationId` are optional. Each source needs string `title` and `url` fields. Source titles render as text; only HTTP(S) links are clickable. Answers support Markdown, with raw HTML disabled. Streaming is not currently included; the endpoint returns one JSON response.

Use `onRequest` if your app has its own auth, API client, server action, or request/response format:

```tsx
import type { ChatRequestHandler } from "@xcodesol/rag-chatbox";

const request: ChatRequestHandler = async ({ message, history, conversationId }) => {
  const result = await myApi.ask({ question: message, context: history, conversationId });
  return { answer: result.text, sources: result.references };
};

<RagChatbox onRequest={request} />
```

When both are supplied, `onRequest` takes precedence over `endpoint`.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `endpoint` | `string` | — | HTTP(S) URL that accepts the request contract above. |
| `onRequest` | `ChatRequestHandler` | — | Custom async request function returning a `ChatResponse`. |
| `title` | `string` | `Ask our assistant` | Panel title and accessible name. |
| `subtitle` | `string` | `Answers grounded in your knowledge base` | Supporting text in the header. |
| `placeholder` | `string` | `Ask a question…` | Input placeholder. |
| `assistantName` | `string` | `Assistant` | Label shown above assistant replies and input label. |
| `welcomeMessage` | `string` | `Hi! What can I help you find?` | Empty conversation greeting. |
| `mode` | `floating` | `inline` | `floating` | Floating launcher or inline panel. |
| `initialOpen` | `boolean` | `false` | Start open in floating mode. Inline mode is always visible. |
| `theme` | `light` | `dark` | `system` | `light` | Color scheme. |
| `primaryColor` | `string` | `#635bff` | CSS color used for the accent. |
| `className` | `string` | — | Class added to the outer section for layout customization. |
| `onMessage` | `(message: ChatMessage) => void` | — | Called when a user message is submitted. |
| `onError` | `(error: Error) => void` | — | Called on configuration, network, or response errors. |
| `onReset` | `() => void` | — | Called after the conversation is cleared. |

Exported types: `ChatRole`, `ChatMessage`, `ChatSource`, `ChatRequest`, `ChatResponse`, `ChatRequestHandler`, and `RagChatboxProps`.

## Errors, retries, and sources

Network errors, non-success HTTP responses, invalid JSON, and malformed response data appear as readable error messages, with a retry action. Retry resends only the failed turn, so use it only when repeating that operation is safe. A reset button clears messages and the conversation ID. Reset also starts the next request without previous context.

The component displays source links under an answer when the server returns them. It does not invent citations. URLs with unsafe schemes are shown as non-clickable labels. Markdown links are filtered to HTTP(S) URLs.

## Server-side integration outline

The chat endpoint should authenticate and authorize the current user, validate input, perform retrieval, call the model provider, and return the response contract. Keep retrieval, model calls, and privileged database access server-side.

### Recommended shared storage: Supabase

For this chatbox and its admin panel, use Supabase Postgres as the shared store for knowledge articles, conversations, and messages, with Supabase Auth for admin access. Enable Row Level Security on every exposed table and restrict management and conversation review to authenticated administrators. A browser publishable key is safe to include only when policies are correct; it does not bypass RLS. Never place a Supabase secret/service-role key in browser code. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

Use a Supabase Edge Function as the chat endpoint when retrieval or model calls are needed. It runs server-side on Deno, so a separate Node API server does not have to be deployed. Keep the model-provider key in [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets). Node is still used for this repository's local Vite/npm development tools.

The intended Supabase setup uses `knowledge_documents`, `conversations`, and `messages` tables. Protect administrator operations with Supabase Auth plus RLS policies; have the `chat` Edge Function validate the request, retrieve active knowledge, write the conversation, call the model when configured, and return the documented response shape. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the browser app, and `OPENAI_API_KEY` (or the selected provider key) as an Edge Function secret. The public chat function URL may be passed through `VITE_RAG_API_URL`. Do not use a secret/service-role key in the browser.

JSON files are useful for fixtures or exports, but not as the shared conversation database for concurrent visitors. Browser `localStorage` is scoped to the website origin and the visitor's browser; it cannot provide shared admin history across devices. Use it only for optional local convenience such as a visitor's draft. [MDN localStorage reference](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

Typical separation:

| Variable | Configure in | Public? |
| --- | --- | --- |
| `VITE_RAG_API_URL` | React app `.env.local` | Yes; URL only |
| `VITE_SUPABASE_URL` | React app `.env.local` | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | React app `.env.local` | Yes; RLS still required |
| Model provider API key (`OPENAI_API_KEY`, etc.) | Edge Function secret store | No |
| Supabase secret/service-role key (if used) | Server or Edge Function secret store | No |

Never put model-provider keys or database credentials in the React bundle or a `VITE_` / `NEXT_PUBLIC_` variable.

## Current local backend and admin panel

The current code in this repository uses a small Express backend with SQLite and a Tailwind admin workspace. This is the local starter implementation; it has not yet been migrated to Supabase. As a result, running the current local backend still requires Node.js. The npm package remains the embeddable React UI only.

The admin workspace focuses on the assistant: overview, knowledge article management, conversation review, a chat preview, and server configuration status. In the current local mode, article text and conversation history are stored in SQLite under `server/data/`. Add or edit concise help content in **Knowledge base**. Active articles are ranked with local keyword overlap and the best three are used for each question. This starter does not include file/PDF ingestion or vector embeddings.

By default, the server returns relevant article excerpts directly. To use generated answers, set `RAG_API_URL`, `RAG_API_KEY`, and `RAG_MODEL` in the server environment. The backend calls an OpenAI-compatible chat completions endpoint and sends only the retrieved article context and recent conversation. Provider secrets stay server-side. With no matching articles, the chat endpoint says it could not find an answer and does not call the model.

### Run locally

```bash
npm install
# macOS / Linux:
cp .env.example .env
# PowerShell:
Copy-Item .env.example .env
```

Edit `.env` before starting the app. Replace `ADMIN_PASSWORD` with a strong, unique password and `SESSION_SECRET` with a random value of at least 32 characters. Leave `RAG_API_KEY` empty for extractive mode, or add a real provider key to this ignored local file. Never put that key in a `VITE_` variable. `.env` and the SQLite data directory are ignored by git.

Then start both services:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and sign in with `ADMIN_PASSWORD`. The Vite server proxies `/api` to Express on port 8787. The separate commands are `npm run dev:admin` and `npm run dev:server`; `npm start` runs only the backend.

### Current local backend behavior and migration notes

- `POST /api/chat` implements the documented chat contract and persists user and assistant turns.
- `/api/admin/*` requires the password login and a signed, HTTP-only, SameSite strict cookie. Sessions expire after eight hours and are cleared if the server restarts. Sign-in and chat requests have basic per-IP rate limits.
- `GET /api/knowledge/:id` exposes only active articles so returned source links can open the cited content.
- SQLite is used by the current local implementation. The recommended shared deployment described above uses Supabase Postgres instead; migrating the current endpoints, admin authentication, and schema to Supabase is separate work and is not included yet.
- This starter has one administrator password, no user accounts or roles, and no document ingestion. Before exposing it publicly, use HTTPS, a durable database and session store, stronger abuse controls, and your application’s user authentication and tenant-level authorization.
- Set `PUBLIC_API_URL` if source links need an absolute API origin. Keep it URL-only.

The admin configuration view reports whether a provider key is configured but never returns the key. The UI package does not read `.env`; the consuming app passes the API URL through `endpoint` or supplies an `onRequest` function. Supabase projects can use the Supabase Edge Function URL for `endpoint` without changing the chat UI package.

## Development and distribution

```bash
npm install
npm run dev          # admin workspace + backend
npm run typecheck
npm test
npm run build        # chatbox package + admin app builds
npm run pack:check   # inspect the npm tarball contents without publishing
```

The npm tarball contains the UI package and its documentation, not the private backend workspace. The package builds ESM and CommonJS JavaScript, declaration types, and `dist/styles.css`.

To publish a release, update the version, run the checks above, review `npm pack --dry-run`, authenticate with npm, then run:

```bash
npm login
npm publish --access public
```

Publishing requires the package name to be available and an authorized npm account. This repository does not imply that any release has been published.
