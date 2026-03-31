import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { getPostSlug } from "@/utils/getPostPaths";

/** A single searchable document consumed by MiniSearch on the client. */
export interface SearchDoc {
  id: string;
  title: string;
  description: string;
  tags: string[];
  /** Slug relative to `posts/`, e.g. `my-post` — the client prepends the locale-aware base. */
  slug: string;
  content: string;
}

/**
 * Strip Markdown syntax down to readable plain text so the search index stays
 * small and excerpts render cleanly. Intentionally lightweight — no AST parse.
 */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → link text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // ATX headings
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^[\s]*[-*+]\s+/gm, "") // list bullets
    .replace(/[*_~]+/g, "") // emphasis markers
    .replace(/\s+/g, " ")
    .trim();
}

export const GET: APIRoute = async () => {
  const posts = getSortedPosts(await getCollection("posts"));

  const docs: SearchDoc[] = posts.map(post => ({
    id: post.id,
    title: post.data.title,
    description: post.data.description,
    tags: post.data.tags ?? [],
    slug: getPostSlug(post.id, post.filePath).replace(/^\/+/, ""),
    content: toPlainText(post.body ?? ""),
  }));

  return new Response(JSON.stringify(docs), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
