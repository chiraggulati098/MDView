import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { marked } from "marked";
import createDOMPurify from "dompurify";
import hljs from "highlight.js";
import "highlight.js/styles/atom-one-dark.css";
import logoLight from "../assets/light.png";
import logoDark from "../assets/dark.png";
import {
  Moon,
  Sun,
  Maximize2,
  Minimize2,
  Columns2,
  FileCode2,
  Eye,
  Trash2,
  Download,
  Plus,
  MoreHorizontal,
} from "lucide-react";

type ViewMode = "split" | "editor" | "preview";
type Theme = "light" | "dark";

type Doc = {
  id: string;
  name: string;
  content: string;
};

const STORAGE_KEY = "md-editor:content";
const DOCS_KEY = "md-editor:documents";
const ACTIVE_DOC_KEY = "md-editor:active-doc";
const THEME_KEY = "md-editor:theme";

const DEFAULT_MD = `# Welcome to **MD view** ✨

A sleek, client-side Markdown viewer — write on the left, preview on the right.

## Features

- ⚡ **Real-time** rendering with synced scrolling
- 🎨 Light & dark themes with neon blue/purple accents
- 🔒 Sanitized HTML output (DOMPurify)
- 💾 Auto-saves to your browser

## Code highlighting

\`\`\`typescript
function greet(name: string): string {
  // syntax highlighted via highlight.js
  return \`Hello, \${name}!\`;
}

const result = greet("developer");
console.log(result);
\`\`\`

## Lists & quotes

1. Toggle the theme with the sun/moon icon
2. Expand either pane fullscreen
3. Scroll — both panes stay aligned

> "The best writing tool is the one that gets out of your way."

Inline \`code\` works too. Visit [the docs](https://commonmark.org) to learn more.

| Feature | Status |
| --- | --- |
| Sync scroll | ✅ |
| XSS-safe | ✅ |
| Backend | ❌ (zero) |
`;

marked.setOptions({
  gfm: true,
  breaks: false,
});

const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
  const highlighted = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
};
marked.use({ renderer });

function sanitizeHtml(raw: string): string {
  if (typeof window === "undefined") return raw;
  const purifier = createDOMPurify(window);
  return purifier.sanitize(raw);
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(THEME_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

function getInitialContent(): string {
  if (typeof window === "undefined") return DEFAULT_MD;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ?? DEFAULT_MD;
}

function createDoc(name: string, content: string): Doc {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, name, content };
}

function getInitialDocuments(): { docs: Doc[]; activeId: string } {
  if (typeof window === "undefined") {
    const doc = createDoc("Untitled 1", DEFAULT_MD);
    return { docs: [doc], activeId: doc.id };
  }

  const storedDocs = localStorage.getItem(DOCS_KEY);
  if (storedDocs) {
    try {
      const parsed = JSON.parse(storedDocs) as Doc[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const activeId = localStorage.getItem(ACTIVE_DOC_KEY) ?? parsed[0].id;
        return { docs: parsed, activeId };
      }
    } catch {
      // Fall through to legacy content.
    }
  }

  const legacy = getInitialContent();
  const doc = createDoc("Untitled 1", legacy);
  return { docs: [doc], activeId: doc.id };
}

export function MarkdownEditor() {
  const [documents, setDocuments] = useState<Doc[]>([
    createDoc("Untitled 1", DEFAULT_MD),
  ]);
  const [activeDocId, setActiveDocId] = useState<string>("");
  const [theme, setTheme] = useState<Theme>("dark");
  const [view, setView] = useState<ViewMode>("split");
  const [hydrated, setHydrated] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [menuDocId, setMenuDocId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const syncingFrom = useRef<"editor" | "preview" | null>(null);

  useEffect(() => {
    const { docs, activeId } = getInitialDocuments();
    setDocuments(docs);
    setActiveDocId(activeId);
    setTheme(getInitialTheme());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(DOCS_KEY, JSON.stringify(documents));
  }, [documents, hydrated]);

  useEffect(() => {
    if (!hydrated || !activeDocId) return;
    localStorage.setItem(ACTIVE_DOC_KEY, activeDocId);
  }, [activeDocId, hydrated]);

  useEffect(() => {
    if (!documents.length) return;
    if (!activeDocId || !documents.some((doc) => doc.id === activeDocId)) {
      setActiveDocId(documents[0].id);
    }
  }, [documents, activeDocId]);

  const activeDoc = useMemo(() => {
    return documents.find((doc) => doc.id === activeDocId) ?? documents[0];
  }, [documents, activeDocId]);

  const activeContent = activeDoc?.content ?? "";

  const html = useMemo(() => {
    const raw = marked.parse(activeContent, { async: false }) as string;
    return sanitizeHtml(raw);
  }, [activeContent]);

  const handleScroll = useCallback(
    (source: "editor" | "preview") => {
      if (view !== "split") return;
      if (syncingFrom.current && syncingFrom.current !== source) return;

      const src = source === "editor" ? editorRef.current : previewRef.current;
      const tgt = source === "editor" ? previewRef.current : editorRef.current;
      if (!src || !tgt) return;

      const srcMax = src.scrollHeight - src.clientHeight;
      const tgtMax = tgt.scrollHeight - tgt.clientHeight;
      if (srcMax <= 0 || tgtMax <= 0) return;

      const pct = src.scrollTop / srcMax;
      syncingFrom.current = source;
      tgt.scrollTop = pct * tgtMax;
      requestAnimationFrame(() => {
        syncingFrom.current = null;
      });
    },
    [view],
  );

  const wordCount = useMemo(
    () => activeContent.trim().split(/\s+/).filter(Boolean).length,
    [activeContent],
  );

  const handleClear = () => {
    if (confirm("Clear all content? This can't be undone.")) {
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === activeDocId ? { ...doc, content: "" } : doc,
        ),
      );
      editorRef.current?.focus();
    }
  };

  const handleDownload = () => {
    const blob = new Blob([activeContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (activeDoc?.name ?? "document").trim() || "document";
    a.download = `${safeName}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const nextUntitledName = useCallback((docs: Doc[]) => {
    let i = 1;
    while (docs.some((doc) => doc.name === `Untitled ${i}`)) i += 1;
    return `Untitled ${i}`;
  }, []);

  const handleAddDoc = () => {
    setDocuments((prev) => {
      const name = nextUntitledName(prev);
      const doc = createDoc(name, DEFAULT_MD);
      setActiveDocId(doc.id);
      return [...prev, doc];
    });
  };

  const getDuplicateName = useCallback((docs: Doc[], name: string) => {
    const base = `${name} copy`;
    if (!docs.some((doc) => doc.name === base)) return base;
    let i = 2;
    while (docs.some((doc) => doc.name === `${base} ${i}`)) i += 1;
    return `${base} ${i}`;
  }, []);

  const handleDuplicateDoc = (doc: Doc) => {
    setDocuments((prev) => {
      const name = getDuplicateName(prev, doc.name);
      const next = createDoc(name, doc.content);
      setActiveDocId(next.id);
      return [...prev, next];
    });
  };

  const handleDeleteDoc = (docId: string) => {
    if (documents.length === 1) {
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === docId ? { ...doc, content: "" } : doc)),
      );
      setActiveDocId(docId);
      return;
    }

    const idx = documents.findIndex((doc) => doc.id === docId);
    const fallback =
      documents[idx - 1]?.id ?? documents[idx + 1]?.id ?? documents[0].id;

    setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
    if (docId === activeDocId) {
      setActiveDocId(fallback);
    }
  };

  const handleClearAllDocs = () => {
    if (!confirm("Close all tabs and clear all content?")) return;
    const doc = createDoc("Untitled 1", DEFAULT_MD);
    setDocuments([doc]);
    setActiveDocId(doc.id);
    setRenamingId(null);
    setNameDraft("");
    setMenuDocId(null);
    setMenuPos(null);
  };

  const closeMenu = () => {
    setMenuDocId(null);
    setMenuPos(null);
  };

  const openMenu = (docId: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const menuWidth = 160;
    const padding = 12;
    const left = Math.max(
      padding,
      Math.min(rect.right - menuWidth, window.innerWidth - padding - menuWidth),
    );
    const top = rect.bottom + 8;
    setMenuDocId(docId);
    setMenuPos({ top, left });
  };

  useEffect(() => {
    if (!menuDocId) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".doc-menu-list") || target.closest(".doc-tab-menu-btn")) {
        return;
      }
      closeMenu();
    };

    const handleScroll = () => closeMenu();

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [menuDocId]);

  const startRename = (doc: Doc) => {
    setRenamingId(doc.id);
    setNameDraft(doc.name);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const trimmed = nameDraft.trim();
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === renamingId
          ? { ...doc, name: trimmed || doc.name }
          : doc,
      ),
    );
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
  };

  const showEditor = view === "split" || view === "editor";
  const showPreview = view === "split" || view === "preview";

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top bar — VSCode titlebar style */}
      <header
        className="flex items-center justify-between border-b border-border px-2 py-0.5"
        style={{ background: "var(--titlebar)" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-sm">
            <img
              src={theme === "dark" ? logoDark : logoLight}
              alt="MD view"
              className="h-14 w-14"
            />
          </div>
          <span className="text-[13px] font-medium text-foreground">
            MD view
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ViewToggle view={view} setView={setView} />
          <div className="mx-1 h-5 w-px bg-border" />
          <IconButton onClick={handleDownload} title="Download .md">
            <Download className="h-4 w-4" />
          </IconButton>
          <IconButton onClick={handleClear} title="Clear content">
            <Trash2 className="h-4 w-4" />
          </IconButton>
          <IconButton
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </IconButton>
        </div>
      </header>

      <div
        className="doc-row relative z-10 flex items-center gap-2 border-b border-border px-2 py-0.5"
        style={{ background: "var(--panel)" }}
      >
        <div className="doc-tabs flex flex-1 items-center gap-1">
          {documents.map((doc) => {
            const isActive = doc.id === activeDocId;
            const isRenaming = renamingId === doc.id;

            return (
              <div
                key={doc.id}
                className={`doc-tab group ${isActive ? "doc-tab-active" : ""}`}
              >
                {isRenaming ? (
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                    className="doc-tab-input"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveDocId(doc.id)}
                    onDoubleClick={() => startRename(doc)}
                    className="doc-tab-button"
                    title={doc.name}
                  >
                    <span className="doc-tab-label">{doc.name}</span>
                  </button>
                )}
                {!isRenaming && (
                  <div className="doc-tab-menu">
                    <button
                      type="button"
                      className="doc-tab-menu-btn"
                      title="Tab actions"
                      onClick={(event) => {
                        event.stopPropagation();
                        const target = event.currentTarget as HTMLElement;
                        if (menuDocId === doc.id) {
                          closeMenu();
                        } else {
                          openMenu(doc.id, target);
                        }
                      }}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={handleAddDoc}
            className="doc-tab-add"
            title="New document"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="doc-actions">
          <button
            type="button"
            onClick={handleClearAllDocs}
            className="doc-clear-all"
            title="Close all tabs and clear"
          >
            <Trash2 className="h-4 w-4" />
            <span>Clear all</span>
          </button>
        </div>
      </div>

      {menuDocId && menuPos && (
        <div
          className="doc-menu-portal"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <div className="doc-menu-list" role="menu">
            <button
              type="button"
              className="doc-menu-item"
              onClick={() => {
                const doc = documents.find((item) => item.id === menuDocId);
                if (doc) startRename(doc);
                closeMenu();
              }}
              role="menuitem"
            >
              Rename
            </button>
            <button
              type="button"
              className="doc-menu-item"
              onClick={() => {
                const doc = documents.find((item) => item.id === menuDocId);
                if (doc) handleDuplicateDoc(doc);
                closeMenu();
              }}
              role="menuitem"
            >
              Duplicate
            </button>
            <button
              type="button"
              className="doc-menu-item doc-menu-danger"
              onClick={() => {
                handleDeleteDoc(menuDocId);
                closeMenu();
              }}
              role="menuitem"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Panes */}
      <main className="relative z-0 flex flex-1 overflow-hidden">
        {showEditor && (
          <section
            className={`relative flex flex-col border-border ${
              showPreview ? "w-1/2 border-r" : "w-full"
            }`}
          >
            <PaneHeader
              icon={<FileCode2 className="h-3.5 w-3.5" />}
              label="Editor"
              right={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setView(view === "editor" ? "split" : "editor")}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title={view === "editor" ? "Show preview" : "Fullscreen editor"}
                  >
                    {view === "editor" ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              }
            />
            <textarea
              ref={editorRef}
              value={activeContent}
              onChange={(e) =>
                setDocuments((prev) =>
                  prev.map((doc) =>
                    doc.id === activeDocId
                      ? { ...doc, content: e.target.value }
                      : doc,
                  ),
                )
              }
              onScroll={() => handleScroll("editor")}
              spellCheck={false}
              className="tech-scroll flex-1 resize-none bg-editor-bg p-6 text-[14px] leading-7 text-editor-fg outline-none placeholder:text-muted-foreground"
              style={{ fontFamily: "var(--font-mono)" }}
              placeholder="# Start typing..."
            />
          </section>
        )}

        {showPreview && (
          <section
            className={`relative flex flex-col ${showEditor ? "w-1/2" : "w-full"}`}
          >
            <PaneHeader
              icon={<Eye className="h-3.5 w-3.5" />}
              label="Preview"
              right={
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setView(view === "preview" ? "split" : "preview")}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title={view === "preview" ? "Show editor" : "Fullscreen preview"}
                  >
                    {view === "preview" ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              }
            />
            <div
              ref={previewRef}
              onScroll={() => handleScroll("preview")}
              className="tech-scroll md-preview flex-1 overflow-auto bg-panel px-8 py-6"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </section>
        )}
      </main>

      {/* VSCode-style status bar */}
      <footer
        className="flex items-center justify-between px-3 py-1 text-[11px]"
        style={{ background: "var(--statusbar)", color: "var(--statusbar-fg)" }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
            Saved locally
          </span>
          <span className="opacity-70">·</span>
          <span>Markdown</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{activeContent.split("\n").length} lines</span>
          <span className="opacity-70">·</span>
          <span>{wordCount} words</span>
          <span className="opacity-70">·</span>
          <span>{activeContent.length} chars</span>
          <span className="opacity-70">·</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function IconButton({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded transition-colors ${
        active
          ? "text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground active:scale-95"
      }`}
      style={active ? { background: "var(--vs-blue)", color: "white" } : undefined}
    >
      {children}
    </button>
  );
}

function ViewToggle({
  view,
  setView,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-border bg-background p-0.5 shadow-sm">
      <ToggleBtn
        active={view === "editor"}
        onClick={() => setView("editor")}
        icon={<FileCode2 className="h-3.5 w-3.5" />}
        label="Editor"
      />
      <ToggleBtn
        active={view === "split"}
        onClick={() => setView("split")}
        icon={<Columns2 className="h-3.5 w-3.5" />}
        label="Both"
      />
      <ToggleBtn
        active={view === "preview"}
        onClick={() => setView("preview")}
        icon={<Eye className="h-3.5 w-3.5" />}
        label="Viewer"
      />
    </div>
  );
}

function ToggleBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`flex h-7 w-8 cursor-pointer items-center justify-center rounded text-[12px] font-medium transition-all active:scale-95 ${
        active
          ? "text-white shadow-sm"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
      style={active ? { background: "var(--vs-blue)" } : undefined}
    >
      {icon}
    </button>
  );
}

function PaneHeader({
  icon,
  label,
  right,
}: {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between border-b border-border px-3 py-1"
      style={{ background: "var(--panel)" }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      {right}
    </div>
  );
}
