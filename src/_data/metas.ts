const locales: Record<string, string> = {
  zh: "zh_CN",
  en: "en_US",
  ja: "ja_JP",
};

export default {
  site: "Diffumist",
  title: "=title",
  description: "=description",
  lang(data: { lang?: string }) {
    return locales[data.lang ?? "zh"] ?? locales.zh;
  },
  generator: true,
};
