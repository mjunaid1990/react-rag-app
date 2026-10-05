import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowLeft, ArrowUpRight, BookOpenText,
  Bot, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Database, FilePlus2,
  FileText, Filter, Gauge, Layers3, LayoutDashboard, LoaderCircle, LogOut, Menu,
  MessageSquareText, MoreHorizontal, Pencil, Plus, Search, Settings2, ShieldCheck,
  Sparkles, Trash2, X,
} from "lucide-react";
import { RagChatbox } from "../../src";

type Page = "overview" | "knowledge" | "conversations" | "playground" | "settings";
type Article = { id: string; title: string; content: string; active: boolean; characterCount: number; createdAt: string; updatedAt: string };
type Conversation = { id: string; title: string; startedAt: string; lastMessageAt: string; messageCount: number };
type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string; sources: { title: string; url: string }[] };
type Overview = {
  metrics: { activeDocuments: number; totalDocuments: number; conversations: number; userMessages: number };
  recentConversations: Conversation[];
  activity: { day: string; label: string; count: number }[];
  service: { providerConfigured: boolean; provider: string; model: string };
};
type Settings = { adminConfigured: boolean; providerConfigured: boolean; provider: string; model: string; apiUrl: string; activeDocuments: number };

const navigation: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "knowledge", label: "Knowledge base", icon: BookOpenText },
  { id: "conversations", label: "Conversations", icon: MessageSquareText },
  { id: "playground", label: "Assistant preview", icon: Bot },
  { id: "settings", label: "Configuration", icon: Settings2 },
];

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body as T;
}

const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
const relativeDate = (value: string) => {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
};

function Brand() {
  return <div className="flex items-center gap-3 px-2">
    <div className="grid size-10 place-items-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-200"><Sparkles size={19} /></div>
    <div><div className="text-[15px] font-bold tracking-tight text-slate-900">Context</div><div className="text-[11px] font-medium text-slate-400">AI knowledge studio</div></div>
  </div>;
}

function SignIn({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) });
      onSuccess();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign in."); }
    finally { setBusy(false); }
  };

  return <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#f5f6fb] px-5 py-12">
    <div className="pointer-events-none absolute -left-36 -top-40 size-[460px] rounded-full bg-violet-200/50 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-48 -right-28 size-[520px] rounded-full bg-blue-100/80 blur-3xl" />
    <div className="relative w-full max-w-[440px]">
      <div className="mb-9 flex justify-center"><Brand /></div>
      <form onSubmit={submit} className="rounded-[26px] border border-slate-200/80 bg-white p-8 shadow-[0_24px_80px_-36px_rgba(30,41,59,.28)] sm:p-10">
        <div className="mb-7 grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet-600"><ShieldCheck size={23} /></div>
        <h1 className="text-[27px] font-semibold tracking-tight text-slate-900">Welcome back</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to manage your assistant’s knowledge and conversations.</p>
        <label htmlFor="admin-password" className="mb-2 mt-7 block text-xs font-semibold text-slate-700">Admin password</label>
        <input autoFocus id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your admin password" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100" />
        {error && <p role="alert" className="mt-3 flex gap-2 text-xs leading-5 text-rose-600"><AlertCircle size={15} className="mt-0.5 shrink-0" />{error}</p>}
        <button disabled={!password || busy} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-55">
          {busy ? <LoaderCircle size={17} className="animate-spin" /> : <>Continue <ArrowUpRight size={16} /></>}
        </button>
        <p className="mt-6 text-center text-[11px] leading-5 text-slate-400">Admin access is protected by your server environment password.</p>
      </form>
      <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-slate-400"><ShieldCheck size={14} /> Secure workspace · Session expires after 8 hours</div>
    </div>
  </main>;
}

function StatCard({ label, value, note, icon: Icon, tint }: { label: string; value: number; note: string; icon: typeof Database; tint: string }) {
  return <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,.025)] sm:p-6">
    <div className="flex items-start justify-between"><div><p className="text-[13px] font-medium text-slate-500">{label}</p><p className="mt-3 text-[32px] font-semibold leading-none tracking-tight text-slate-900">{value.toLocaleString()}</p></div><div className={`grid size-10 place-items-center rounded-xl ${tint}`}><Icon size={19} /></div></div>
    <p className="mt-5 text-xs text-slate-400">{note}</p>
  </div>;
}

function EmptyState({ icon: Icon, title, body, action }: { icon: typeof FileText; title: string; body: string; action?: React.ReactNode }) {
  return <div className="flex min-h-[290px] flex-col items-center justify-center px-6 py-12 text-center"><div className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Icon size={22} /></div><h3 className="mt-4 text-sm font-semibold text-slate-800">{title}</h3><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{body}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

function ArticleDialog({ article, onClose, onSave }: { article?: Article; onClose: () => void; onSave: (value: { title: string; content: string; active: boolean }, id?: string) => Promise<void> }) {
  const [title, setTitle] = useState(article?.title || "");
  const [content, setContent] = useState(article?.content || "");
  const [active, setActive] = useState(article?.active ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await onSave({ title, content, active }, article?.id); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this article."); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="article-dialog-title" onSubmit={submit} className="max-h-[94vh] w-full max-w-[680px] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl">
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5 sm:px-8"><div><div className="text-[11px] font-semibold uppercase tracking-[.12em] text-violet-600">Knowledge base</div><h2 id="article-dialog-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-900">{article ? "Edit article" : "Add an article"}</h2><p className="mt-1 text-xs text-slate-500">Keep content clear and focused so retrieval can find the right answer.</p></div><button type="button" onClick={onClose} aria-label="Close dialog" className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button></div>
      <div className="space-y-5 px-6 py-6 sm:px-8">
        <div><label htmlFor="article-title" className="mb-2 block text-xs font-semibold text-slate-700">Article title</label><input id="article-title" autoFocus required maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. How to reset your password" className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100" /></div>
        <div><div className="mb-2 flex items-center justify-between"><label htmlFor="article-content" className="text-xs font-semibold text-slate-700">Article content</label><span className="text-[11px] text-slate-400">{content.length.toLocaleString()} / 30,000</span></div><textarea id="article-content" required maxLength={30000} value={content} onChange={(event) => setContent(event.target.value)} rows={10} placeholder="Write the answer, steps, policy, or product information that the assistant should use…" className="w-full resize-y rounded-xl border border-slate-200 p-3.5 text-sm leading-6 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100" /></div>
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-4 py-3"><span><span className="block text-xs font-semibold text-slate-700">Available to assistant</span><span className="mt-0.5 block text-[11px] text-slate-500">Inactive articles are saved but excluded from retrieval.</span></span><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="size-4 accent-violet-600" /></label>
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4 sm:px-8"><button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button disabled={busy || !title.trim() || !content.trim()} className="flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{busy && <LoaderCircle size={14} className="animate-spin" />}{article ? "Save changes" : "Add to knowledge base"}</button></div>
    </form>
  </div>;
}

function ConversationDialog({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { api<{ messages: Message[] }>(`/api/admin/conversations/${conversation.id}`).then((data) => setMessages(data.messages)).catch((cause) => setError(cause.message)); }, [conversation.id]);
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="conversation-title" className="flex h-full w-full max-w-[600px] flex-col border-l border-slate-200 bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><div className="text-[11px] font-semibold uppercase tracking-[.12em] text-violet-600">Conversation</div><h2 id="conversation-title" className="mt-1 max-w-[450px] truncate text-base font-semibold text-slate-900">{conversation.title}</h2><p className="mt-1 text-xs text-slate-500">Started {dateLabel(conversation.startedAt)} · {conversation.messageCount} messages</p></div><button onClick={onClose} aria-label="Close conversation" className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button></header>
      <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/80 p-5 sm:p-7">{error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : messages.length ? messages.map((message) => <article key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 ${message.role === "user" ? "rounded-br-md bg-violet-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-700 shadow-sm"}`}><div className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wide ${message.role === "user" ? "text-violet-100" : "text-slate-400"}`}>{message.role === "user" ? "Visitor" : "Assistant"}</div><p className="whitespace-pre-wrap text-xs leading-6">{message.content}</p>{!!message.sources?.length && <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">Sources: {message.sources.map((source) => source.title).join(", ")}</div>}</div></article>) : <div className="grid h-full place-items-center"><LoaderCircle size={22} className="animate-spin text-violet-500" /></div>}</div>
      <footer className="border-t border-slate-100 px-6 py-3 text-[11px] text-slate-400">Messages are stored locally in the configured SQLite database.</footer>
    </section>
  </div>;
}

export default function AdminApp() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [overview, setOverview] = useState<Overview>();
  const [documents, setDocuments] = useState<Article[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [settings, setSettings] = useState<Settings>();
  const [selectedConversation, setSelectedConversation] = useState<Conversation>();
  const [editingArticle, setEditingArticle] = useState<Article | null | undefined>();
  const [search, setSearch] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [knowledgeFilter, setKnowledgeFilter] = useState<"all" | "active" | "inactive">("all");
  const [toast, setToast] = useState("");
  const [pageError, setPageError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api("/api/admin/session").then(() => setAuthenticated(true)).catch(() => setAuthenticated(false)).finally(() => setChecking(false));
  }, []);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2800); };
  const refreshPage = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true); setPageError("");
    try {
      if (page === "overview") setOverview(await api<Overview>("/api/admin/overview"));
      if (page === "knowledge") setDocuments((await api<{ documents: Article[] }>("/api/admin/knowledge")).documents);
      if (page === "conversations") setConversations((await api<{ conversations: Conversation[] }>(`/api/admin/conversations?search=${encodeURIComponent(conversationSearch)}`)).conversations);
      if (page === "settings") setSettings(await api<Settings>("/api/admin/settings"));
    } catch (cause) { setPageError(cause instanceof Error ? cause.message : "Could not load this view."); }
    finally { setLoading(false); }
  }, [authenticated, page, conversationSearch]);
  useEffect(() => { void refreshPage(); }, [refreshPage]);

  const saveArticle = async (value: { title: string; content: string; active: boolean }, id?: string) => {
    await api(id ? `/api/admin/knowledge/${id}` : "/api/admin/knowledge", { method: id ? "PUT" : "POST", body: JSON.stringify(value) });
    await refreshPage();
    notify(id ? "Article updated" : "Article added to your knowledge base");
  };
  const toggleArticle = async (article: Article) => {
    try { await api(`/api/admin/knowledge/${article.id}`, { method: "PUT", body: JSON.stringify({ active: !article.active }) }); await refreshPage(); notify(article.active ? "Article paused" : "Article is active"); }
    catch (cause) { setPageError(cause instanceof Error ? cause.message : "Could not update article."); }
  };
  const deleteArticle = async (article: Article) => {
    if (!window.confirm(`Delete “${article.title}”? This article will no longer be available to the assistant.`)) return;
    try { await api(`/api/admin/knowledge/${article.id}`, { method: "DELETE" }); await refreshPage(); notify("Article deleted"); }
    catch (cause) { setPageError(cause instanceof Error ? cause.message : "Could not delete article."); }
  };
  const signOut = async () => { await api("/api/admin/logout", { method: "POST" }).catch(() => undefined); setAuthenticated(false); setPage("overview"); };

  const filteredDocuments = useMemo(() => documents.filter((document) => {
    const matchesSearch = `${document.title} ${document.content}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    return matchesSearch && (knowledgeFilter === "all" || (knowledgeFilter === "active" ? document.active : !document.active));
  }), [documents, search, knowledgeFilter]);

  if (checking) return <div className="grid min-h-screen place-items-center bg-[#f7f8fc]"><LoaderCircle size={24} className="animate-spin text-violet-600" /></div>;
  if (!authenticated) return <SignIn onSuccess={() => setAuthenticated(true)} />;

  const pageDetails: Record<Page, { title: string; subtitle: string }> = {
    overview: { title: "Overview", subtitle: "A clear view of your assistant’s knowledge and activity." },
    knowledge: { title: "Knowledge base", subtitle: "Curate the information your assistant can use to answer questions." },
    conversations: { title: "Conversations", subtitle: "Review recent questions and the answers your assistant gave." },
    playground: { title: "Assistant preview", subtitle: "Test retrieval against your current active knowledge articles." },
    settings: { title: "Configuration", subtitle: "Check service health and manage server-side connection settings." },
  };

  return <div className="min-h-screen bg-[#f7f8fc] text-slate-800">
    {mobileNav && <button aria-label="Close navigation overlay" onClick={() => setMobileNav(false)} className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col border-r border-slate-200/80 bg-white px-4 py-6 transition-transform lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="px-1"><Brand /></div>
      <div className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Workspace</div>
      <nav aria-label="Admin navigation" className="mt-3 space-y-1">
        {navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setPage(id); setMobileNav(false); }} className={`group flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[12px] font-semibold transition ${page === id ? "bg-violet-50 text-violet-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"}`}><Icon size={17} className={page === id ? "text-violet-600" : "text-slate-400 group-hover:text-slate-600"} />{label}{page === id && <span className="ml-auto h-5 w-1 rounded-full bg-violet-500" />}</button>)}
      </nav>
      <div className="mt-auto">
        <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50 p-4"><div className="flex items-center gap-2 text-violet-700"><CircleHelp size={15} /><span className="text-[11px] font-semibold">Need a hand?</span></div><p className="mt-2 text-[11px] leading-5 text-slate-500">Add focused articles to improve the answers your assistant can find.</p><button onClick={() => setPage("knowledge")} className="mt-3 text-[11px] font-semibold text-violet-700 hover:text-violet-900">Manage knowledge <ArrowUpRight size={13} className="ml-1 inline" /></button></div>
        <div className="mt-5 flex items-center gap-3 border-t border-slate-100 px-2 pt-5"><div className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-600"><ShieldCheck size={16} /></div><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-800">Workspace admin</div><div className="text-[10px] text-slate-400">Administrator</div></div><button onClick={signOut} aria-label="Sign out" title="Sign out" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><LogOut size={16} /></button></div>
      </div>
    </aside>

    <div className="min-h-screen lg:pl-[252px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} aria-label="Open navigation" className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"><Menu size={19} /></button><div><div className="flex items-center gap-2 text-[11px] text-slate-400"><span>Workspace</span><ChevronRight size={12} /><span className="font-medium text-slate-600">{pageDetails[page].title}</span></div></div></div>
        <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-medium text-slate-500 sm:flex"><span className="size-1.5 rounded-full bg-emerald-500" />Admin session active</div><div className="grid size-8 place-items-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">AD</div></div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 pb-12 pt-7 sm:px-8 lg:px-10 lg:pt-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[25px] font-semibold tracking-tight text-slate-900">{pageDetails[page].title}</h1><p className="mt-1.5 text-[12px] text-slate-500 sm:text-[13px]">{pageDetails[page].subtitle}</p></div>{page === "knowledge" && <button onClick={() => setEditingArticle(null)} className="flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white shadow-md shadow-violet-200 transition hover:bg-violet-700"><Plus size={16} />Add article</button>}{page === "playground" && <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" />Connected to local chat API</div>}</div>

        {pageError && <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700"><span className="flex gap-2"><AlertCircle size={15} className="mt-0.5 shrink-0" />{pageError}</span><button onClick={() => setPageError("")} aria-label="Dismiss error"><X size={15} /></button></div>}

        {loading && !overview && page !== "playground" && <div className="mb-4 flex items-center gap-2 text-xs text-slate-400"><LoaderCircle size={14} className="animate-spin" />Loading workspace data…</div>}

        {page === "overview" && <OverviewPage data={overview} openPage={setPage} onConversation={setSelectedConversation} />}
        {page === "knowledge" && <KnowledgePage documents={filteredDocuments} total={documents.length} search={search} setSearch={setSearch} filter={knowledgeFilter} setFilter={setKnowledgeFilter} edit={setEditingArticle} toggle={toggleArticle} remove={deleteArticle} loading={loading} onAdd={() => setEditingArticle(null)} />}
        {page === "conversations" && <ConversationsPage conversations={conversations} search={conversationSearch} setSearch={setConversationSearch} onOpen={setSelectedConversation} loading={loading} />}
        {page === "playground" && <div className="mx-auto max-w-[820px]"><div className="mb-4 flex items-center gap-2 text-xs text-slate-500"><span className="grid size-7 place-items-center rounded-lg bg-violet-100 text-violet-600"><Bot size={15} /></span>Messages are processed by the same retrieval endpoint used by your embedded chat.</div><RagChatbox mode="inline" initialOpen endpoint={import.meta.env.VITE_RAG_API_URL || "/api/chat"} title="Knowledge assistant" subtitle="Preview · connected to your active knowledge articles" welcomeMessage="Try a question from your knowledge base. Add articles in the Knowledge base section to get started." primaryColor="#6d5ce8" /></div>}
        {page === "settings" && <SettingsPage settings={settings} />}
      </main>
      <footer className="border-t border-slate-200/70 px-5 py-4 text-center text-[10px] text-slate-400 sm:px-8 lg:px-10">Context AI workspace <span className="mx-1.5">·</span> Knowledge and conversations stay in your configured database.</footer>
    </div>

    {editingArticle !== undefined && <ArticleDialog article={editingArticle || undefined} onClose={() => setEditingArticle(undefined)} onSave={saveArticle} />}
    {selectedConversation && <ConversationDialog conversation={selectedConversation} onClose={() => setSelectedConversation(undefined)} />}
    {toast && <div role="status" className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-xl"><Check size={15} className="text-emerald-400" />{toast}</div>}
  </div>;
}

function OverviewPage({ data, openPage, onConversation }: { data?: Overview; openPage: (page: Page) => void; onConversation: (conversation: Conversation) => void }) {
  if (!data) return <div className="grid min-h-[420px] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-violet-500" size={22} /><p className="mt-3 text-xs text-slate-400">Preparing your overview…</p></div></div>;
  const maxCount = Math.max(1, ...data.activity.map((item) => item.count));
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"><StatCard label="Active articles" value={data.metrics.activeDocuments} note={`${data.metrics.totalDocuments} total in your library`} icon={BookOpenText} tint="bg-violet-50 text-violet-600" /><StatCard label="Conversations" value={data.metrics.conversations} note="All-time conversations started" icon={MessageSquareText} tint="bg-blue-50 text-blue-600" /><StatCard label="Visitor messages" value={data.metrics.userMessages} note="Questions sent to your assistant" icon={Activity} tint="bg-emerald-50 text-emerald-600" /><div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,.025)] sm:p-6"><div className="flex items-start justify-between"><div><p className="text-[13px] font-medium text-slate-500">Retrieval service</p><p className="mt-3 text-base font-semibold tracking-tight text-slate-900">{data.service.providerConfigured ? data.service.provider : "Knowledge mode"}</p></div><div className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-600"><Gauge size={19} /></div></div><div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500"><span className="size-1.5 rounded-full bg-emerald-500" />{data.service.model}</div></div></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.95fr)]">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6"><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Conversation activity</h2><p className="mt-1 text-[11px] text-slate-400">New conversations · last 7 days</p></div><div className="grid size-9 place-items-center rounded-xl bg-violet-50 text-violet-600"><Activity size={17} /></div></div><div role="img" aria-label="Conversation activity over the past seven days" className="mt-7 flex h-[190px] items-end justify-between gap-2 border-b border-slate-100 px-1 sm:gap-4">{data.activity.map((item) => <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-medium text-slate-500">{item.count || ""}</span><div className="w-full max-w-[36px] rounded-t-md bg-gradient-to-t from-violet-600 to-violet-400 transition-all" style={{ height: `${Math.max(5, item.count / maxCount * 118)}px` }} /><span className="pb-2 text-[10px] text-slate-400">{item.label}</span></div>)}</div><div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400"><span className="size-2 rounded-sm bg-violet-500" />Conversations created</div></section>
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white"><div className="flex items-start justify-between border-b border-slate-100 px-5 py-5"><div><h2 className="text-sm font-semibold text-slate-900">Recent conversations</h2><p className="mt-1 text-[11px] text-slate-400">Latest visitor activity</p></div><button onClick={() => openPage("conversations")} className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-800">View all <ArrowUpRight size={13} /></button></div>{data.recentConversations.length ? <div className="divide-y divide-slate-100">{data.recentConversations.slice(0, 5).map((conversation) => <button key={conversation.id} onClick={() => onConversation(conversation)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><MessageSquareText size={16} /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-800">{conversation.title}</div><div className="mt-1 text-[10px] text-slate-400">{conversation.messageCount} messages · {relativeDate(conversation.lastMessageAt)}</div></div><ChevronRight size={15} className="shrink-0 text-slate-300" /></button>)}</div> : <EmptyState icon={MessageSquareText} title="No conversations yet" body="When visitors start chatting with your assistant, their conversations will show up here." />}</section>
    </div>
    <section className="flex flex-col gap-4 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/90 via-white to-blue-50/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-violet-600 shadow-sm"><Layers3 size={19} /></div><div><h2 className="text-sm font-semibold text-slate-900">Make answers more useful</h2><p className="mt-1 max-w-xl text-[11px] leading-5 text-slate-500">Add policies, product guides, and support answers. Active articles are matched against each question before the assistant responds.</p></div></div><button onClick={() => openPage("knowledge")} className="flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-violet-200 bg-white px-3 text-[11px] font-semibold text-violet-700 shadow-sm hover:bg-violet-50 sm:self-auto"><FilePlus2 size={14} />Manage articles <ArrowUpRight size={13} /></button></section>
  </div>;
}

function KnowledgePage({ documents, total, search, setSearch, filter, setFilter, edit, toggle, remove, loading, onAdd }: { documents: Article[]; total: number; search: string; setSearch: (value: string) => void; filter: "all" | "active" | "inactive"; setFilter: (value: "all" | "active" | "inactive") => void; edit: (article: Article) => void; toggle: (article: Article) => void; remove: (article: Article) => void; loading: boolean; onAdd: () => void }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,.025)]"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="relative w-full max-w-[360px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles and content" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-violet-400 focus:ring-3 focus:ring-violet-100" /></div><div className="flex items-center gap-2"><div className="relative"><Filter size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter articles" className="h-10 appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-xs font-medium text-slate-600 outline-none focus:border-violet-400"><option value="all">All articles</option><option value="active">Active</option><option value="inactive">Inactive</option></select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" /></div><span className="px-1 text-[11px] text-slate-400">{documents.length} of {total}</span></div></div>
    {loading && <div className="flex items-center gap-2 px-5 py-3 text-[11px] text-slate-400"><LoaderCircle size={13} className="animate-spin" />Refreshing articles…</div>}
    {documents.length ? <><div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(140px,.7fr)_minmax(110px,.55fr)_130px] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:grid"><span>Article</span><span>Availability</span><span>Updated</span><span className="text-right">Actions</span></div><div className="divide-y divide-slate-100">{documents.map((article) => <div key={article.id} className="grid gap-3 px-4 py-4 transition hover:bg-slate-50/50 sm:px-5 md:grid-cols-[minmax(220px,1.4fr)_minmax(140px,.7fr)_minmax(110px,.55fr)_130px] md:items-center md:gap-4"><div className="flex min-w-0 items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><FileText size={16} /></div><div className="min-w-0"><div className="truncate text-xs font-semibold text-slate-800">{article.title}</div><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{article.content}</p><div className="mt-1.5 text-[10px] text-slate-400">{article.characterCount.toLocaleString()} characters</div></div></div><div className="flex items-center justify-between md:justify-start"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${article.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><span className={`size-1.5 rounded-full ${article.active ? "bg-emerald-500" : "bg-slate-400"}`} />{article.active ? "Active" : "Paused"}</span><button onClick={() => toggle(article)} className="text-[10px] font-semibold text-violet-600 hover:text-violet-800 md:hidden">{article.active ? "Pause" : "Activate"}</button></div><div className="text-[10px] text-slate-500">{dateLabel(article.updatedAt)}</div><div className="flex items-center justify-end gap-1"><button onClick={() => toggle(article)} title={article.active ? "Pause article" : "Activate article"} aria-label={article.active ? `Pause ${article.title}` : `Activate ${article.title}`} className="hidden size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 md:grid"><Activity size={15} /></button><button onClick={() => edit(article)} title="Edit article" aria-label={`Edit ${article.title}`} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-violet-50 hover:text-violet-700"><Pencil size={14} /></button><button onClick={() => remove(article)} title="Delete article" aria-label={`Delete ${article.title}`} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button></div></div>)}</div></> : <EmptyState icon={BookOpenText} title={total ? "No articles match this view" : "Start your knowledge base"} body={total ? "Try another search or filter to find an article." : "Add a focused help article, policy, or product guide. The assistant will retrieve relevant text when visitors ask questions."} action={!total && <button onClick={onAdd} className="flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-3 text-[11px] font-semibold text-white hover:bg-violet-700"><Plus size={14} />Add your first article</button>} />}</section>;
}

function ConversationsPage({ conversations, search, setSearch, onOpen, loading }: { conversations: Conversation[]; search: string; setSearch: (value: string) => void; onOpen: (conversation: Conversation) => void; loading: boolean }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 className="text-xs font-semibold text-slate-800">Visitor conversations</h2><p className="mt-1 text-[10px] text-slate-400">Conversation content is visible to admins only.</p></div><div className="relative w-full max-w-[300px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversation titles" className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-violet-400 focus:ring-3 focus:ring-violet-100" /></div></div>{loading && <div className="flex items-center gap-2 px-5 py-4 text-[11px] text-slate-400"><LoaderCircle size={13} className="animate-spin" />Loading conversations…</div>}{conversations.length ? <div className="divide-y divide-slate-100">{conversations.map((conversation) => <button key={conversation.id} onClick={() => onOpen(conversation)} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 sm:px-5"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><MessageSquareText size={17} /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-800">{conversation.title}</div><div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400"><span className="flex items-center gap-1"><Clock3 size={12} />{dateLabel(conversation.startedAt)}</span><span>{conversation.messageCount} messages</span><span>Last activity {relativeDate(conversation.lastMessageAt)}</span></div></div><ArrowUpRight size={16} className="shrink-0 text-slate-300" /></button>)}</div> : !loading && <EmptyState icon={MessageSquareText} title="No conversations found" body={search ? "Try a different title search." : "Conversation history will appear here after someone uses the assistant."} />}</section>;
}

function SettingsPage({ settings }: { settings?: Settings }) {
  if (!settings) return <div className="grid min-h-[360px] place-items-center"><LoaderCircle size={21} className="animate-spin text-violet-500" /></div>;
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white"><div className="border-b border-slate-100 px-5 py-5"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-violet-50 text-violet-600"><Settings2 size={18} /></div><div><h2 className="text-sm font-semibold text-slate-900">Server configuration</h2><p className="mt-1 text-[11px] text-slate-400">Credentials are read from the backend environment and never returned to this page.</p></div></div></div><div className="divide-y divide-slate-100">
      <SettingRow label="Retrieval mode" value={settings.providerConfigured ? "Model assisted" : "Extractive fallback"} detail={settings.providerConfigured ? "Retrieved articles are sent to your configured model." : "Matching article content is returned directly. Add a server key to enable model generated answers."} status={settings.providerConfigured ? "Ready" : "Available"} />
      <SettingRow label="Provider" value={settings.provider} detail="OpenAI compatible chat completions" />
      <SettingRow label="Model" value={settings.model} detail="Configured with the RAG_MODEL environment variable" />
      <SettingRow label="Completion URL" value={settings.apiUrl} detail="Configured with the RAG_API_URL environment variable" />
      <SettingRow label="Knowledge articles" value={`${settings.activeDocuments} active`} detail="Inactive articles are not used during retrieval." />
    </div></section>
    <div className="space-y-5"><section className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-5"><div className="flex items-center gap-2 text-emerald-700"><span className="grid size-8 place-items-center rounded-lg bg-white"><ShieldCheck size={16} /></span><h2 className="text-xs font-semibold">Security boundary</h2></div><ul className="mt-4 space-y-3 text-[11px] leading-5 text-slate-600"><li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />Model provider keys stay in the server environment.</li><li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />Admin routes require an HTTP-only session cookie.</li><li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />Only active articles are considered for retrieval.</li></ul></section><section className="rounded-2xl border border-slate-200/80 bg-white p-5"><h2 className="text-xs font-semibold text-slate-900">Server environment</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">Edit the server environment <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">.env</code> file and restart the backend to change these values.</p><div className="mt-4 space-y-2">{["ADMIN_PASSWORD", "SESSION_SECRET", "RAG_API_KEY", "RAG_MODEL"].map((variable) => <div key={variable} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><code className="text-[10px] font-medium text-slate-600">{variable}</code><span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-semibold text-violet-700">Server only</span></div>)}</div><p className="mt-4 text-[10px] leading-5 text-slate-400">See the local backend setup section in README.md for setup steps.</p></section></div>
  </div>;
}

function SettingRow({ label, value, detail, status }: { label: string; value: string; detail: string; status?: string }) {
  return <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[11px] font-semibold text-slate-700">{label}</div><div className="mt-1 text-[10px] text-slate-400">{detail}</div></div><div className="flex items-center gap-2 sm:max-w-[48%] sm:justify-end"><span className="break-all text-[11px] font-medium text-slate-700">{value}</span>{status && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">{status}</span>}</div></div>;
}
