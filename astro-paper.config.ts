import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://diffumist.me/",
    title: "Diffumist",
    description: "The Diffumist's Site.",
    author: "Diffumist",
    profile: "https://diffumist.me/",
    ogImage: undefined,
    lang: "zh",
    timezone: "Asia/Shanghai",
    dir: "ltr",
  },
  posts: {
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: false,
    showArchives: false,
    showBackButton: true,
    editPost: {
      enabled: false,
      // url: "https://github.com/satnaing/astro-paper/edit/main/",
    },
    search: "minisearch",
  },
  socials: [
    { name: "mail", url: "mailto:pm@diffumist.me" },
    { name: "telegram", url: "https://t.me/Diffumist" },
    { name: "github", url: "https://github.com/Diffumist" },
    { name: "netease", url: "https://music.163.com/#/user?id=1732544203" },
  ],
  services: [
    { name: "DN42 Info", url: "https://t.me/AS4242420642" },
    { name: "Pastebin", url: "https://nixos.bond" },
    { name: "Node SLA", url: "https://sla.qzz.io" },
  ],
  projects: [
    { name: "nixos-config", url: "https://github.com/Diffumist/nixos-config" },
    { name: "tamago", url: "https://github.com/Diffumist/tamago" },
    { name: "blog", url: "https://github.com/Diffumist/diffumist.github.io" },
    { name: "sing-box-mcp", url: "https://github.com/Diffumist/sing-box-mcp" },
  ],
  privateServices: [
    { name: "Fediverse", url: "https://diffumist.me/fedi" },
  ],
  shareLinks: [
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "mail",     url: "mailto:?subject=See%20this%20post&body=" },
  ],
});