---
title: 从 Pagefind 换到 MiniSearch 踩的坑
pubDatetime: 2026-03-31
description: Astro fulltext 搜索依赖从 Pagefind 迁移到 MiniSearch，记录下 Astro ClientRouter 下的脚本执行陷阱
tags: [astro]
---

把 Astro fulltext 搜索从 Pagefind 换成 MiniSearch：构建期生成 `search-index.json`，页面侧用 MiniSearch 建索引、查询。功能跑通了，但有个问题——只有在 `/search` 刷新后才能搜，从内部点链接跳过去没反应，这里了遇到两层坑。

## Cloudflare Speed Brain 污染预取缓存

Speed Brain 会推测式预渲染 `/search`，请求带 `Sec-Purpose: prefetch;prerender` 头，被 CF 回了 503，这个 503 会在浏览器预取缓存里反复复用，但直接打开 URL 是 200。

这里关掉 Speed Brain，再 Purge 一次缓存即可解决。

## ClientRouter 下 bundled 脚本不重跑

内部跳转，脚本被下载但没执行，`data-initialized` 始终为 `unset`。[Astro 文档](https://docs.astro.build/en/guides/view-transitions/#script-re-execution)：

> Bundled module scripts, which are the default scripts in Astro, are only ever executed once. After initial execution they will be ignored, even if the script exists on the new page after a transition.

启用 `<ClientRouter />` 后，带 `import` 的打包脚本在 SPA 导航时只执行一次、之后被忽略。注册 `astro:page-load` 的代码写在这个不执行的模块里，于是模块不跑 → 监听不注册 → 初始化永不触发，只有整页刷新能救。`data-astro-rerun` 无效，因为它只作用于 `is:inline` 脚本。

## 解法

把初始化逻辑从页面模块移到 Layout，监听挂在 `document` 上跨导航持久，命中搜索页时再动态 `import()`，保留懒加载。

```js
document.addEventListener("astro:page-load", () => {
  if (document.querySelector("#search-page")) {
    import("@/scripts/search").then(m => m.initSearch());
  }
});
```

> 用了 view transitions 之后，依赖页面脚本「再次运行」的逻辑都要重新 review 一遍。
