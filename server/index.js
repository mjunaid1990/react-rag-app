import "dotenv/config";
import express from "express";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { db, nowIso } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const sessionTtlMs = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const chatAttempts = new Map();
app.disable("x-powered-by");
app.use(express.json({ limit: "160kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

function cookieValue(req, key) {
  const raw = req.headers.cookie || "";
  const part = raw.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${key}=`));
  return part ? decodeURIComponent(part.slice(key.length + 1)) : "";
}

function safeEqual(left, right) {
  const a = createHash("sha256").update(String(left)).digest();
  const b = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  const parts = cookieValue(req, "rag_admin_session").split(".");
  const [token, expiresText, signature] = parts;
  const expires = Number(expiresText);
  const secret = process.env.SESSION_SECRET;
  const registeredExpiry = sessions.get(token);
  if (!token || !signature || !secret || secret.startsWith("replace-with-") || secret.length < 32 || !Number.isFinite(expires) || expires < Date.now() || registeredExpiry !== expires) {
    sessions.delete(token);
    return res.status(401).json({ error: "Please sign in to continue." });
  }
  const expected = createHmac("sha256", secret).update(`${token}.${expiresText}`).digest("hex");
  if (!safeEqual(signature, expected)) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}

function limitByIp(store, { limit, windowMs, message }) {
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || now - entry.startedAt > windowMs) store.set(key, { startedAt: now, count: 1 });
    else if (entry.count >= limit) return res.status(429).json({ error: message });
    else entry.count += 1;
    next();
  };
}

const loginLimit = limitByIp(loginAttempts, { limit: 8, windowMs: 15 * 60 * 1000, message: "Too many sign-in attempts. Wait a few minutes and try again." });
const chatLimit = limitByIp(chatAttempts, { limit: 30, windowMs: 60 * 1000, message: "Too many messages. Please wait a moment and try again." });

function cleanDocument(row) {
  return { ...row, active: Boolean(row.active), characterCount: row.content.length };
}

function tokenize(value) {
  return new Set((value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter((term) => !STOP_WORDS.has(term)));
}

const STOP_WORDS = new Set(["the", "and", "for", "are", "but", "not", "you", "your", "with", "from", "this", "that", "what", "when", "where", "how", "can", "does", "did", "have", "has", "will", "would", "could", "our", "about", "into", "then", "than", "use"]);

function retrieveDocuments(query, limit = 3) {
  const terms = tokenize(query);
  if (!terms.size) return [];
  return db.prepare("SELECT id, title, content, updated_at FROM knowledge_documents WHERE active = 1")
    .all()
    .map((document) => {
      const titleTerms = tokenize(document.title);
      const contentTerms = tokenize(document.content);
      const titleMatches = [...terms].filter((term) => titleTerms.has(term)).length;
      const contentMatches = [...terms].filter((term) => contentTerms.has(term)).length;
      const phraseBoost = document.content.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ? 2 : 0;
      return { ...document, score: titleMatches * 3 + contentMatches + phraseBoost };
    })
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || right.updated_at.localeCompare(left.updated_at))
    .slice(0, limit);
}

function sourceUrl(id) {
  const base = (process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  return `${base}/api/knowledge/${encodeURIComponent(id)}`;
}

function formatSources(documents) {
  return documents.map((document) => ({ title: document.title, url: sourceUrl(document.id) }));
}

async function generateAnswer(message, history, documents) {
  if (!documents.length) {
    return "I couldn’t find a relevant article in the knowledge base. Try rephrasing your question or ask an administrator to add the relevant information.";
  }

  const apiKey = process.env.RAG_API_KEY;
  if (!apiKey) {
    return `Here is the most relevant information from the knowledge base:\n\n${documents.map((doc) => `### ${doc.title}\n${doc.content.slice(0, 1800)}${doc.content.length > 1800 ? "…" : ""}`).join("\n\n")}`;
  }

  const endpoint = process.env.RAG_API_URL || "https://api.openai.com/v1/chat/completions";
  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(endpoint);
    if (parsedEndpoint.protocol !== "https:" && parsedEndpoint.protocol !== "http:") throw new Error("Unsupported protocol");
  } catch {
    throw new Error("The server-side RAG_API_URL is not a valid HTTP(S) URL.");
  }
  const context = documents.map((document, index) => `[${index + 1}] ${document.title}\n${document.content}`).join("\n\n");
  const chatHistory = history.slice(-12).map(({ role, content }) => ({ role, content }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(parsedEndpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.RAG_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: `You are a concise knowledge-base assistant. Answer only from the supplied context. If it does not contain the answer, say you could not find it. Do not invent facts or citations.\n\nContext:\n${context}` },
          ...chatHistory,
          { role: "user", content: message },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The configured model service returned HTTP ${response.status}.`);
    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) throw new Error("The configured model service returned an invalid answer.");
    return answer.trim();
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/health", (_req, res) => {
  const documents = db.prepare("SELECT COUNT(*) AS count FROM knowledge_documents WHERE active = 1").get().count;
  res.json({ status: "ok", providerConfigured: Boolean(process.env.RAG_API_KEY), activeDocuments: documents });
});

app.post("/api/admin/login", loginLimit, (req, res) => {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredPassword || configuredPassword.startsWith("replace-with-")) {
    return res.status(503).json({ error: "Admin sign-in is disabled. Set ADMIN_PASSWORD in the server environment first." });
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.startsWith("replace-with-") || process.env.SESSION_SECRET.length < 32) {
    return res.status(503).json({ error: "Admin sign-in is disabled. Set a unique SESSION_SECRET of at least 32 characters in the server environment first." });
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!safeEqual(password, configuredPassword)) return res.status(401).json({ error: "That password did not match. Try again." });
  const token = randomBytes(32).toString("hex");
  const expires = Date.now() + sessionTtlMs;
  for (const [sessionToken, expiry] of sessions) if (expiry < Date.now()) sessions.delete(sessionToken);
  sessions.set(token, expires);
  const payload = `${token}.${expires}`;
  const signature = createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("hex");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `rag_admin_session=${encodeURIComponent(`${payload}.${signature}`)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}${secure}`);
  res.json({ authenticated: true });
});

app.get("/api/admin/session", requireAdmin, (_req, res) => res.json({ authenticated: true }));

app.post("/api/admin/logout", (req, res) => {
  const [token] = cookieValue(req, "rag_admin_session").split(".");
  sessions.delete(token);
  res.setHeader("Set-Cookie", "rag_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  res.json({ authenticated: false });
});

app.get("/api/knowledge/:id", (req, res) => {
  const document = db.prepare("SELECT id, title, content, updated_at FROM knowledge_documents WHERE id = ? AND active = 1").get(req.params.id);
  if (!document) return res.status(404).json({ error: "This knowledge article is not available." });
  res.json(document);
});

app.post("/api/chat", chatLimit, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 6000) return res.status(400).json({ error: "Message is required and must be 6,000 characters or fewer." });
  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  if (history.length > 40 || history.some((item) => !item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string" || item.content.length > 6000)) {
    return res.status(400).json({ error: "Conversation history is invalid or too long." });
  }
  const retrieved = retrieveDocuments(message);
  const conversationId = typeof req.body?.conversationId === "string" && db.prepare("SELECT id FROM conversations WHERE id = ?").get(req.body.conversationId)
    ? req.body.conversationId
    : randomUUID();
  const existing = Boolean(db.prepare("SELECT id FROM conversations WHERE id = ?").get(conversationId));
  const startedAt = nowIso();
  const userMessageId = randomUUID();
  const title = message.replace(/\s+/g, " ").slice(0, 90);
  const saveUserMessage = db.transaction(() => {
    if (!existing) db.prepare("INSERT INTO conversations (id, title, started_at, last_message_at, message_count) VALUES (?, ?, ?, ?, 0)").run(conversationId, title, startedAt, startedAt);
    db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)").run(userMessageId, conversationId, message, startedAt);
    db.prepare("UPDATE conversations SET last_message_at = ?, message_count = message_count + 1 WHERE id = ?").run(startedAt, conversationId);
  });
  saveUserMessage();

  try {
    const answer = await generateAnswer(message, history, retrieved);
    const sources = formatSources(retrieved);
    const answerAt = nowIso();
    const saveAnswer = db.transaction(() => {
      db.prepare("INSERT INTO messages (id, conversation_id, role, content, sources_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)").run(randomUUID(), conversationId, answer, JSON.stringify(sources), answerAt);
      db.prepare("UPDATE conversations SET last_message_at = ?, message_count = message_count + 1 WHERE id = ?").run(answerAt, conversationId);
    });
    saveAnswer();
    res.json({ answer, sources, conversationId });
  } catch (error) {
    console.error("RAG response failed:", error.message);
    if (!existing) db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);
    res.status(502).json({ error: "The assistant could not complete this request. Check the server configuration and try again." });
  }
});

app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  const activeDocuments = db.prepare("SELECT COUNT(*) AS count FROM knowledge_documents WHERE active = 1").get().count;
  const totalDocuments = db.prepare("SELECT COUNT(*) AS count FROM knowledge_documents").get().count;
  const conversations = db.prepare("SELECT COUNT(*) AS count FROM conversations").get().count;
  const messages = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE role = 'user'").get().count;
  const recentConversations = db.prepare("SELECT id, title, started_at AS startedAt, last_message_at AS lastMessageAt, message_count AS messageCount FROM conversations ORDER BY last_message_at DESC LIMIT 6").all();
  const activity = db.prepare(`SELECT date(last_message_at) AS day, COUNT(*) AS count FROM conversations WHERE last_message_at >= date('now', '-6 days') GROUP BY date(last_message_at)`).all();
  const activityByDay = new Map(activity.map((row) => [row.day, row.count]));
  const chart = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return { day: key, label: date.toLocaleDateString("en", { weekday: "short" }), count: activityByDay.get(key) || 0 };
  });
  res.json({
    metrics: { activeDocuments, totalDocuments, conversations, userMessages: messages },
    recentConversations,
    activity: chart,
    service: { providerConfigured: Boolean(process.env.RAG_API_KEY), provider: process.env.RAG_PROVIDER_LABEL || "Extractive retrieval", model: process.env.RAG_API_KEY ? process.env.RAG_MODEL || "gpt-4o-mini" : "Local extractive mode" },
  });
});

app.get("/api/admin/knowledge", requireAdmin, (_req, res) => {
  const documents = db.prepare("SELECT id, title, content, active, created_at AS createdAt, updated_at AS updatedAt FROM knowledge_documents ORDER BY updated_at DESC").all();
  res.json({ documents: documents.map(cleanDocument) });
});

app.post("/api/admin/knowledge", requireAdmin, (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!title || title.length > 180) return res.status(400).json({ error: "Add a title between 1 and 180 characters." });
  if (!content || content.length > 30_000) return res.status(400).json({ error: "Add article content between 1 and 30,000 characters." });
  const timestamp = nowIso();
  const document = { id: randomUUID(), title, content, active: req.body?.active === false ? 0 : 1, created_at: timestamp, updated_at: timestamp };
  db.prepare("INSERT INTO knowledge_documents (id, title, content, active, created_at, updated_at) VALUES (@id, @title, @content, @active, @created_at, @updated_at)").run(document);
  res.status(201).json({ document: cleanDocument(document) });
});

app.put("/api/admin/knowledge/:id", requireAdmin, (req, res) => {
  const current = db.prepare("SELECT * FROM knowledge_documents WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Knowledge article not found." });
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : current.title;
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : current.content;
  if (!title || title.length > 180) return res.status(400).json({ error: "Add a title between 1 and 180 characters." });
  if (!content || content.length > 30_000) return res.status(400).json({ error: "Add article content between 1 and 30,000 characters." });
  const updatedAt = nowIso();
  const active = typeof req.body?.active === "boolean" ? Number(req.body.active) : current.active;
  db.prepare("UPDATE knowledge_documents SET title = ?, content = ?, active = ?, updated_at = ? WHERE id = ?").run(title, content, active, updatedAt, req.params.id);
  res.json({ document: cleanDocument({ ...current, title, content, active, updated_at: updatedAt }) });
});

app.delete("/api/admin/knowledge/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM knowledge_documents WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Knowledge article not found." });
  res.status(204).end();
});

app.get("/api/admin/conversations", requireAdmin, (req, res) => {
  const search = typeof req.query.search === "string" ? `%${req.query.search.trim().slice(0, 80)}%` : "%";
  const conversations = db.prepare(`SELECT id, title, started_at AS startedAt, last_message_at AS lastMessageAt, message_count AS messageCount FROM conversations WHERE title LIKE ? ORDER BY last_message_at DESC LIMIT 100`).all(search);
  res.json({ conversations });
});

app.get("/api/admin/conversations/:id", requireAdmin, (req, res) => {
  const conversation = db.prepare("SELECT id, title, started_at AS startedAt, last_message_at AS lastMessageAt, message_count AS messageCount FROM conversations WHERE id = ?").get(req.params.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  const messages = db.prepare("SELECT id, role, content, sources_json AS sourcesJson, created_at AS createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at").all(req.params.id)
    .map(({ sourcesJson, ...message }) => ({ ...message, sources: JSON.parse(sourcesJson || "[]") }));
  res.json({ conversation, messages });
});

app.get("/api/admin/settings", requireAdmin, (_req, res) => {
  const activeDocuments = db.prepare("SELECT COUNT(*) AS count FROM knowledge_documents WHERE active = 1").get().count;
  let apiUrl = process.env.RAG_API_URL || "https://api.openai.com/v1/chat/completions";
  try { const parsed = new URL(apiUrl); parsed.username = ""; parsed.password = ""; parsed.search = ""; parsed.hash = ""; apiUrl = parsed.toString(); }
  catch { apiUrl = "Configured server URL"; }
  res.json({
    adminConfigured: Boolean(process.env.ADMIN_PASSWORD),
    providerConfigured: Boolean(process.env.RAG_API_KEY),
    provider: process.env.RAG_API_KEY ? process.env.RAG_PROVIDER_LABEL || "OpenAI-compatible" : "Not configured",
    model: process.env.RAG_API_KEY ? process.env.RAG_MODEL || "gpt-4o-mini" : "Extractive fallback",
    apiUrl,
    activeDocuments,
  });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) return res.status(400).json({ error: "Request body must be valid JSON." });
  console.error("API error:", error.message);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(port, () => {
  console.log(`RAG chat backend listening on http://localhost:${port}`);
  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) console.warn("Set ADMIN_PASSWORD and SESSION_SECRET in .env to enable the admin panel.");
});
