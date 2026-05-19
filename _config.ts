import lume from "lume/mod.ts";
import vento from "lume/plugins/vento.ts";
import markdown from "lume/plugins/markdown.ts";
import feed from "lume/plugins/feed.ts";
import codeHighlight from "lume/plugins/code_highlight.ts";
import metas from "lume/plugins/metas.ts";
import seo from "lume/plugins/seo.ts";
import sitemap from "lume/plugins/sitemap.ts";
import purgecss from "lume/plugins/purgecss.ts";
import lightningCss from "lume/plugins/lightningcss.ts";
import esbuild from "lume/plugins/esbuild.ts";
import attrs from "npm:markdown-it-attrs@4.3.1";

const site = lume({
  src: "src",
  location: new URL("https://diffumist.me"),
  server: {
    port: 8000,
  },
});

site.use(vento());
site.use(markdown());
site.hooks.markdownIt((md) => {
  md.use(attrs);

  md.core.ruler.after("inline", "standalone_image_figure", (state) => {
    for (let i = 0; i < state.tokens.length - 2; i++) {
      const openToken = state.tokens[i];
      const inlineToken = state.tokens[i + 1];
      const closeToken = state.tokens[i + 2];
      const imageToken = inlineToken.children?.[0];

      if (
        openToken.type !== "paragraph_open" ||
        inlineToken.type !== "inline" ||
        closeToken.type !== "paragraph_close" ||
        inlineToken.children?.length !== 1 ||
        imageToken?.type !== "image"
      ) {
        continue;
      }

      const caption = imageToken.attrGet("title")?.trim();
      if (caption) {
        imageToken.attrSet("data-figure-caption", caption);
      }

      openToken.tag = "figure";
      openToken.attrSet("class", "image-figure");
      closeToken.tag = "figure";
    }
  });

  const defaultImageRule = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const caption = token.attrGet("data-figure-caption");

    if (!caption) {
      return defaultImageRule
        ? defaultImageRule(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);
    }

    const attrs = token.attrs;
    token.attrs = attrs?.filter(([name]) => name !== "data-figure-caption") ??
      null;
    const image = defaultImageRule
      ? defaultImageRule(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    token.attrs = attrs;

    return `${image}<figcaption>${escapeHtml(caption)}</figcaption>`;
  };

  md.core.ruler.push("collect_heading_toc", (state) => {
    const data = state.env?.data;
    if (!data || data.type !== "post") {
      return;
    }

    const usedIds = new Map<string, number>();
    const toc: Array<{ id: string; title: string; level: number }> = [];

    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      const inlineToken = state.tokens[i + 1];
      if (
        token.type !== "heading_open" ||
        inlineToken?.type !== "inline" ||
        !/^h[2-4]$/.test(token.tag)
      ) {
        continue;
      }

      const title = inlineToken.content.trim();
      if (!title) {
        continue;
      }

      const level = Number(token.tag.slice(1));
      const baseId = slugifyHeading(title);
      const count = usedIds.get(baseId) ?? 0;
      usedIds.set(baseId, count + 1);
      const id = count === 0 ? baseId : `${baseId}-${count + 1}`;

      token.attrSet("id", id);
      toc.push({ id, title, level });
    }

    data.toc = toc;
  });
});
site.use(metas());
site.use(seo({
  options: {
    body: false,
  },
}));
site.use(sitemap());
site.use(feed({
  output: ["/feeds.xml", "/feeds.json"],
  query: "type=post",
  info: {
    title: "=site.title",
    description: "=site.description",
  },
  items: {
    title: "=title",
    description: "=excerpt",
  },
}));
site.use(codeHighlight());
site.use(esbuild());
site.process([".css"], function processTextCSS(pages) {
  pages.forEach((page) => {
    page.text = page.text;
  });
});
site.use(purgecss({
  contentExtensions: [".html"],
  options: {
    content: [
      "src/**/*.{md,vto,ts,js}",
    ],
    safelist: {
      standard: [
        /^hljs/,
        /^post-toc-level-/,
        /^terminal-alert/,
      ],
      greedy: [
        /^hljs-/,
        /^(blockquote|code|figcaption|figure|img|pre|table|tbody|td|th|thead|tr)/,
      ],
    },
  },
}));
site.use(lightningCss({
  includes: false,
  options: {
    minify: true,
  },
}));
site.add("/public/css/site.css", "/css/site.css");
site.add("/public/vendor/terminal.css", "/vendor/terminal.css");
site.add("/public/js/site.ts", "/js/site.js");

site.copy(
  "public/vendor/MapleMono-NF-CN-Light",
  "vendor/MapleMono-NF-CN-Light",
);
site.copy("public/site.webmanifest", "site.webmanifest");
site.copy("public/favicon.svg", "favicon.svg");
site.copy("public/favicon.ico", "favicon.ico");
site.copy("public/favicon-96x96.png", "favicon-96x96.png");
site.copy("public/apple-touch-icon.png", "apple-touch-icon.png");
site.copy(
  "public/web-app-manifest-192x192.png",
  "web-app-manifest-192x192.png",
);
site.copy(
  "public/web-app-manifest-512x512.png",
  "web-app-manifest-512x512.png",
);

export default site;

function slugifyHeading(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s_-]+/gu, "")
    .replace(/\s+/g, "-");

  return slug || "section";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
