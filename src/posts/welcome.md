---
layout: layouts/post.vto
title: Markdown 渲染测试
type: post
permalink: /posts/welcome/
description: 用基于 deno 的 lume 重写了一遍 blog，设计风格灵感来源于 Terminal CSS
date: 2026-02-01
---
**以下为 Markdown 渲染测试**
## 标题 H1

**加粗文本**，*斜体文本*，***加粗斜体***。

1. 有序列表项一
2. 有序列表项二
   - 嵌套无序项 A
   - 嵌套无序项 B

- 无序列表一
- 无序列表二

## 标题 H2
> 这是一个引用块。
>
> - 引用内的列表项

这是一条提示{.terminal-alert .terminal-alert-primary}

内联代码示例：`const count = 10;`

代码块示例（缩进形式）：
```js
function greet(name) {
    return `Hello, ${name}!`;
}
console.log(greet('Markdown Tester'));
```
表格示例：

| 名称    | 类型    | 说明           |
| ------- | ------- | -------------- |
| alpha   | string  | 示例文本       |
| beta    | number  | 值为 123       |

任务清单（Task list）：
- [x] 已完成的任务
- [ ] 未完成的任务

## 标题 H3
链接示例：[OpenAI](https://openai.com)
引用式链接示例：[示例引用][1]


图片（仅示例 alt 文本，不保证能加载）：

![示例图片](https://picsum.photos/1000/600?random&imageWithCaption "图片标题")
