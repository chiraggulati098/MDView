import { createFileRoute } from "@tanstack/react-router";
import { MarkdownEditor } from "@/components/MarkdownEditor";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "NeonMark — Sleek Markdown Editor" },
      {
        name: "description",
        content:
          "A fast, client-side Markdown editor with live preview, synced scrolling, and a techy neon dark theme. Zero backend.",
      },
    ],
  }),
});

function Index() {
  return <MarkdownEditor />;
}
