# Prompt: Build an installable RAG AI assistant chatbox and admin workspace

Build a polished, reusable RAG AI assistant chatbox that can be installed as an npm package and easily embedded into React applications. Include a focused, professional Tailwind admin workspace for managing the assistant's knowledge and reviewing conversations.

## Goal

Create a production-ready chat UI package installable with:

```bash
npm install your-package-name
```

A developer should be able to add the chatbox to an existing React app with minimal setup. The package should provide the chat interface and a clear integration point for the application’s own RAG backend. Do not put model-provider API keys, vector database credentials, or other secrets in browser code.

## Before implementation

1. Inspect the existing repository and follow its framework, code style, package manager, and test conventions.
2. If this repository is already a React app, build the package in a way that fits the project and provide a working demo or example app.
3. Avoid replacing existing functionality or making unrelated changes.
4. If a backend or RAG implementation already exists, inspect and reuse it rather than duplicating it.
5. Use the selected Supabase architecture below for shared storage. Do not introduce a Node/Express server solely to store messages when Supabase can provide the managed database and Edge Function endpoint.

## Package requirements

- Use a clear package name, description, version, license, and README.
- Configure the package for npm installation and distribution.
- Provide TypeScript types and useful autocomplete.
- Support modern React applications. Declare React as a peer dependency rather than bundling a second React copy.
- Provide appropriate ESM and CommonJS outputs if supported by the project’s build tooling.
- Include a CSS entry point and document how consumers import it.
- Ensure the package can be built and packed for npm without including unnecessary development files.
- Do not claim the package is published. Include publishing steps and commands in the documentation.

## Developer experience

Provide a minimal integration that is easy to understand, such as:

```tsx
import { RagChatbox } from "your-package-name";
import "your-package-name/styles.css";

function App() {
  return (
    <RagChatbox
      endpoint="/api/chat"
      title="Ask our assistant"
    />
  );
}
```

The actual API may differ if the existing project has established conventions, but keep the default setup simple. Document every required prop, optional prop, callback, and backend response shape.

## Chatbox features

Implement a responsive, accessible chat interface with:

- Expandable or floating chatbox presentation, with a documented way to render it inline if practical.
- Welcome message and configurable title, subtitle, placeholder, and assistant identity.
- User and assistant message styling, timestamps where appropriate, and readable long responses.
- Message input with send button, Enter-to-send, Shift+Enter for a newline, and disabled/loading states.
- Loading or “thinking” feedback while a response is being generated.
- Clear error states with a retry option where retry is safe.
- Scroll management that keeps the latest conversation visible without disrupting users reading earlier messages.
- A way to clear or reset the conversation.
- Support for Markdown answers, with safe handling of untrusted content and no unsafe HTML rendering.
- Configurable colors, theme, class name, and other styling hooks that fit the existing codebase.
- Keyboard navigation, visible focus states, semantic labels, and appropriate ARIA attributes.
- Mobile-friendly layout and reduced-motion support.

Keep the UI focused and lightweight. Do not add unrelated product features.

## Admin workspace

Build a responsive admin application styled with Tailwind CSS. Keep it focused on assistant operations:

- Overview metrics for active knowledge articles and conversations.
- Create, edit, activate/deactivate, search, and delete knowledge articles.
- Review conversation history and sources attached to assistant replies.
- A chat preview connected to the same RAG endpoint as the embedded widget.
- Configuration status that reports whether server-side provider settings exist without returning secret values.
- Supabase Auth sign-in and administrator authorization. Do not use a shared hard-coded password for production access.

Do not add unrelated billing, generic analytics, or broad user-management features.

## RAG and backend integration

The chatbox is a client-side UI, not a place to expose private model or database credentials. It should send the user’s message and conversation context to a configurable application endpoint or supplied request function.

### API endpoint configuration with environment variables

- Let the consuming application configure its own RAG API URL through its environment file, rather than hard-coding a project-specific URL into the reusable npm package.
- Add a safe example environment file (such as `.env.example`) to the demo/application, and document the appropriate local environment filename (for example, `.env.local`). Ensure real environment files containing credentials are ignored by git.
- Show how the consuming app reads its public API URL and passes it to the chatbox’s `endpoint` prop. Use the correct public-variable convention for the app’s framework, such as `VITE_RAG_API_URL` for Vite or `NEXT_PUBLIC_RAG_API_URL` for Next.js. Explain that browser-exposed variables are public and must never contain secrets.
- The package should not assume it can read arbitrary consumer `.env` files at runtime. Keep endpoint configuration explicit through props or the documented request-handler API; allow the prop to override a sensible app-level default.
- Validate that an endpoint is present and usable before sending a request, and show a clear configuration error rather than silently failing.

Example consumer configuration:

```dotenv
# .env.local (do not commit real credentials)
VITE_RAG_API_URL=https://your-project.example/api/chat
```

```tsx
<RagChatbox
  endpoint={import.meta.env.VITE_RAG_API_URL}
  title="Ask our assistant"
/>
```

Adapt the environment-variable syntax to the demo framework. Include only placeholder URLs in committed examples.

### Backend and Supabase guidance

- Use Supabase Postgres as the shared system of record for knowledge articles, conversations, and messages. Do not use JSON files or browser storage as shared storage: a browser store is private to one browser, while JSON files are unsuitable for concurrent writes from visitors.
- Use Supabase Auth for administrator identity and authorization. Enable Row Level Security on all exposed tables and write least-privilege policies. Public chat writes must go through a validated, rate-limited endpoint rather than broad anonymous table permissions.
- Use a Supabase Edge Function as the chat endpoint. It runs server-side on Deno, so a separately hosted Node/Express server is not required for this architecture. Keep retrieval, model-provider calls, and privileged database operations in the function or another trusted server-side service.
- Keep retrieval, model-provider calls, and privileged database operations on the server side. Store provider secrets and Supabase service-role keys only in server-side/Edge Function secrets, never in the React bundle or public `.env` variables.
- A Supabase anon/publishable key may be used in the browser only where required by Supabase’s client setup, with Row Level Security configured correctly. Never treat that key as authorization to bypass RLS.
- Keep the chatbox's `endpoint` and custom `onRequest` API backend-agnostic, so consumers can connect Supabase or another API without changing the UI package.
- Document browser configuration (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and the function URL), Edge Function secrets, authentication, schema, and RLS policies. Include only placeholders, never real credentials.
- Node.js may still be needed for local React/Vite development and npm tooling. Do not require a Node server in production solely for database storage. A local Node/SQLite adapter may remain as a clearly labeled development fallback, but do not present it as the shared production store.

Define and document a stable request/response contract. For example:

**Request**

```json
{
  "message": "How do I reset my password?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "conversationId": "optional-id"
}
```

**Response**

```json
{
  "answer": "Follow these steps...",
  "sources": [
    {
      "title": "Password reset guide",
      "url": "https://example.com/help/reset"
    }
  ],
  "conversationId": "optional-id"
}
```

Adapt this contract to existing backend conventions if present. Make the endpoint configurable, and allow a custom request handler so consumers can connect their own authentication, API client, or data format.

Support streaming responses if the existing stack can implement them reliably. If streaming is not included, clearly document that and keep the integration designed so it can be added later without breaking the public API.

When showing RAG citations or sources:

- Display sources returned by the backend in a clear, optional section below the answer.
- Treat source titles and URLs as untrusted input.
- Validate links and render them safely; do not allow unsafe URL schemes.
- Do not invent citations or imply that a response is grounded when no sources were returned.

Do not implement document ingestion, vector storage, retrieval, or model-provider logic inside the browser package. The Edge Function owns chat orchestration and retrieval. Use pgvector only if semantic embeddings are actually implemented; do not imply vector search when retrieval is keyword-based.

## Public API and quality

- Use explicit TypeScript types for component props, messages, sources, and backend results.
- Keep the public API small and consistent.
- Validate unexpected or malformed backend responses and show a useful error rather than silently rendering invalid data.
- Avoid unnecessary dependencies; explain any dependency that is added.
- Keep styling isolated enough to avoid unintentionally changing the host application’s styles.
- Follow the repository’s linting, formatting, accessibility, and testing patterns.

## Documentation

Write a README that includes:

1. What the package does and what it does not do.
2. Installation command.
3. A minimal React usage example.
4. A complete props and customization reference.
5. The expected backend request and response format.
6. The selected Supabase architecture, schema, RLS and admin access model, plus an Edge Function outline that keeps credentials out of the browser.
7. How to display sources and handle errors.
8. The CSS import and theming instructions.
9. Development, test, build, and npm pack commands.
10. Steps for publishing a new version to npm.

Include a working example app or demo showing the package connected to a mock RAG endpoint. Clearly label mock responses as examples and do not include real credentials. If Supabase credentials are not available in development, clearly separate mock/local mode from the shared production architecture.

## Tests and verification

Add or update tests for the important behavior, including:

- Rendering and basic configuration.
- Sending a message and displaying a successful answer.
- Loading and error states.
- Displaying valid sources safely.
- Resetting the conversation.
- Keyboard and accessibility behavior where supported.

Run the relevant tests, lint, type-check, build, and npm pack checks available in the repository. Fix failures caused by this implementation, and report any unrelated pre-existing failures separately.

## Completion report

When finished, summarize:

- What was implemented.
- How to install and use it.
- The expected backend contract.
- Which validation commands passed or failed.
- Any remaining limitations.

Do not stop after providing a plan; implement and verify the working package.
