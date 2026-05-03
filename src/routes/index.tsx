import { createFileRoute } from "@tanstack/react-router";
import { MarkdownEditor } from "@/components/MarkdownEditor";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "MD view — Markdown Viewer" },
      {
        name: "description",
        content:
          "A fast, client-side Markdown viewer with live preview, synced scrolling, and a techy neon dark theme. Zero backend.",
      },
    ],
  }),
});

function Index() {
  return <MarkdownEditor />;
}
