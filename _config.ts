import lume from "lume/mod.ts";
import vento from "lume/plugins/vento.ts";
import markdown from "lume/plugins/markdown.ts";
import feed from "lume/plugins/feed.ts";
import codeHighlight from "lume/plugins/code_highlight.ts";
import metas from "lume/plugins/metas.ts";

const site = lume({
  src: "src",
  server: {
    port: 8000,
  },
});

site.use(vento());
site.use(markdown());
site.use(metas());
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

site.copy("public", ".");

export default site;
