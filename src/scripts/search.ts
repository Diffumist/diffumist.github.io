import MiniSearch from "minisearch";

interface SearchDoc {
  id: string;
  title: string;
  description: string;
  tags: string[];
  slug: string;
  content: string;
}

type ResultDoc = SearchDoc & { terms: string[] };

// Intl.Segmenter gives us word-level segmentation that works for CJK (no
// whitespace) as well as Latin scripts — falls back to whitespace splitting.
const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

function tokenize(text: string): string[] {
  if (!segmenter) return text.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (const seg of segmenter.segment(text)) {
    if (seg.isWordLike) tokens.push(seg.segment);
  }
  return tokens;
}

let enginePromise: Promise<MiniSearch> | null = null;

function getEngine(indexPath: string): Promise<MiniSearch> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const res = await fetch(indexPath);
    if (!res.ok) throw new Error(`Failed to load search index: ${res.status}`);
    const docs: SearchDoc[] = await res.json();
    const engine = new MiniSearch<SearchDoc>({
      idField: "id",
      fields: ["title", "description", "tags", "content"],
      storeFields: ["title", "description", "slug", "content"],
      tokenize,
      processTerm: term => term.toLowerCase(),
      extractField: (doc, field) =>
        field === "tags"
          ? (doc.tags ?? []).join(" ")
          : (doc[field as keyof SearchDoc] as string),
      searchOptions: {
        boost: { title: 4, description: 2, tags: 2 },
        prefix: true,
        fuzzy: 0.2,
        tokenize,
        processTerm: term => term.toLowerCase(),
      },
    });
    engine.addAll(docs);
    return engine;
  })();
  // Don't cache a rejected promise — otherwise a single transient fetch
  // failure would permanently break search until a full reload.
  enginePromise.catch(() => {
    enginePromise = null;
  });
  return enginePromise;
}

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, c => ESCAPE[c]);
}

function highlight(text: string, terms: string[]): string {
  const html = escapeHtml(text);
  const safe = terms
    .filter(Boolean)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (safe.length === 0) return html;
  return html.replace(new RegExp(`(${safe.join("|")})`, "gi"), "<mark>$1</mark>");
}

function buildExcerpt(content: string, terms: string[], len = 180): string {
  if (!content) return "";
  const lower = content.toLowerCase();
  let idx = -1;
  for (const term of terms) {
    const pos = lower.indexOf(term.toLowerCase());
    if (pos !== -1 && (idx === -1 || pos < idx)) idx = pos;
  }
  if (idx === -1) {
    return content.slice(0, len) + (content.length > len ? "…" : "");
  }
  const start = Math.max(0, idx - Math.floor(len / 3));
  const end = Math.min(content.length, start + len);
  return (
    (start > 0 ? "…" : "") +
    content.slice(start, end) +
    (end < content.length ? "…" : "")
  );
}

/**
 * Initialise the search page. Idempotent: the `data-initialized` flag guards
 * against double-binding when called repeatedly (e.g. on every
 * `astro:page-load`). Bundled module scripts only execute once across view
 * transitions, so this is driven from the layout — see Layout.astro.
 */
export function initSearch() {
  const root = document.querySelector<HTMLElement>("#search-page");
  if (!root || root.dataset.initialized === "true") return;
  root.dataset.initialized = "true";

  const input = root.querySelector<HTMLInputElement>("#search-input");
  const status = root.querySelector<HTMLElement>("#search-status");
  const list = root.querySelector<HTMLUListElement>("#search-results");
  if (!input || !status || !list) return;

  const indexPath = root.dataset.index ?? "/search-index.json";
  const postsBase = root.dataset.postsBase ?? "/posts/";
  const noResults = root.dataset.noResults ?? "No results found";

  function setQueryParam(value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set("q", value);
      history.replaceState(history.state, "", `?${params.toString()}`);
      const backUrl = root!.dataset.backurl ?? window.location.pathname;
      sessionStorage.setItem("backUrl", `${backUrl}?${params.toString()}`);
    } else {
      history.replaceState(history.state, "", window.location.pathname);
    }
  }

  function render(results: ResultDoc[], query: string) {
    list!.innerHTML = "";
    if (!query) {
      status!.textContent = "";
      return;
    }
    if (results.length === 0) {
      status!.textContent = noResults;
      return;
    }
    status!.textContent = "";
    for (const r of results) {
      const li = document.createElement("li");
      li.className = "my-6";
      li.innerHTML = `
        <a
          href="${postsBase}${r.slug}"
          class="text-accent inline-block text-lg font-medium underline-offset-4 hover:underline focus-visible:no-underline"
        >${highlight(r.title, r.terms)}</a>
        <p class="text-sm opacity-80">${highlight(r.description, r.terms)}</p>
        <p class="mt-1 text-sm">${highlight(buildExcerpt(r.content, r.terms), r.terms)}</p>`;
      list!.appendChild(li);
    }
  }

  let timer: number | undefined;
  async function runSearch(query: string) {
    const trimmed = query.trim();
    setQueryParam(trimmed);
    if (!trimmed) {
      render([], "");
      return;
    }
    const engine = await getEngine(indexPath);
    const results = engine.search(trimmed) as unknown as ResultDoc[];
    render(results, trimmed);
  }

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    const value = input.value;
    timer = window.setTimeout(() => runSearch(value), 120);
  });

  // Run an initial query when arriving via `?q=…`
  const initialQuery = new URLSearchParams(window.location.search).get("q");
  if (initialQuery) {
    input.value = initialQuery;
    runSearch(initialQuery);
  }

  // Warm the index in the background so the first keystroke feels instant.
  const onIdle = window.requestIdleCallback || (cb => setTimeout(cb, 200));
  onIdle(() => getEngine(indexPath));
}
