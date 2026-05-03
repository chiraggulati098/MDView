import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import "highlight.js/styles/atom-one-dark.css";
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
  Sparkles,
} from "lucide-react";

type ViewMode = "split" | "editor" | "preview";
type Theme = "light" | "dark";

const STORAGE_KEY = "md-editor:content";
const THEME_KEY = "md-editor:theme";

const DEFAULT_MD = `# Welcome to **NeonMark** ✨

A sleek, client-side Markdown editor — write on the left, preview on the right.

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

// Configure marked once with highlight.js
marked.setOptions({
  gfm: true,
  breaks: false,
});

// Custom renderer to apply highlight.js to code blocks
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
  const highlighted = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
};
marked.use({ renderer });

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

export function MarkdownEditor() {
  const [content, setContent] = useState<string>(DEFAULT_MD);
  const [theme, setTheme] = useState<Theme>("dark");
  const [view, setView] = useState<ViewMode>("split");
  const [hydrated, setHydrated] = useState(false);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const syncingFrom = useRef<"editor" | "preview" | null>(null);

  // Hydrate from localStorage on mount (avoid SSR mismatch)
  useEffect(() => {
    setContent(getInitialContent());
    setTheme(getInitialTheme());
    setHydrated(true);
  }, []);

  // Apply theme class to <html>
  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, hydrated]);

  // Persist content
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, content);
  }, [content, hydrated]);

  // Render markdown -> sanitized HTML
  const html = useMemo(() => {
    const raw = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [content]);

  // Sync scroll: percentage based
  const handleScroll = useCallback(
    (source: "editor" | "preview") => {
      if (view !== "split") return;
      if (syncingFrom.current && syncingFrom.current !== source) return;

      const src =
        source === "editor" ? editorRef.current : previewRef.current;
      const tgt =
        source === "editor" ? previewRef.current : editorRef.current;
      if (!src || !tgt) return;

      const srcMax = src.scrollHeight - src.clientHeight;
      const tgtMax = tgt.scrollHeight - tgt.clientHeight;
      if (srcMax <= 0 || tgtMax <= 0) return;

      const pct = src.scrollTop / srcMax;
      syncingFrom.current = source;
      tgt.scrollTop = pct * tgtMax;
      // release lock after current frame so the other pane's scroll event
      // (triggered by our programmatic scroll) doesn't bounce back
      requestAnimationFrame(() => {
        syncingFrom.current = null;
      });
    },
    [view],
  );

  const wordCount = useMemo(
    () => content.trim().split(/\s+/).filter(Boolean).length,
    [content],
  );

  const handleClear = () => {
    if (confirm("Clear all content? This can't be undone.")) {
      setContent("");
      editorRef.current?.focus();
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "document.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const showEditor = view === "split" || view === "editor";
  const showPreview = view === "split" || view === "preview";

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top bar — VSCode titlebar style */}
      <header
        className="flex items-center justify-between border-b border-border px-3 py-1.5"
        style={{ background: "var(--titlebar)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-sm"
            style={{ background: "var(--vs-blue)" }}
          >
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[13px] font-medium text-foreground">
            NeonMark
          </span>
          <span className="text-[11px] text-muted-foreground">— Markdown Editor</span>
        </div>

        <div className="flex items-center gap-2">
          <ViewToggle view={view} setView={setView} />
          <div className="mx-1 h-6 w-px bg-border" />
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

      {/* Panes */}
      <main className="flex flex-1 overflow-hidden">
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
              }
            />
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
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
          <span>{content.split("\n").length} lines</span>
          <span className="opacity-70">·</span>
          <span>{wordCount} words</span>
          <span className="opacity-70">·</span>
          <span>{content.length} chars</span>
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
      className={`flex h-7 cursor-pointer items-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition-all active:scale-95 ${
        active
          ? "text-white shadow-sm"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
      style={active ? { background: "var(--vs-blue)" } : undefined}
    >
      {icon}
      <span>{label}</span>
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