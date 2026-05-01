(() => {
  const elements = [
    ...new Set(
      document.querySelectorAll<HTMLElement>(
        "[data-scramble], .terminal-prompt",
      ),
    ),
  ].filter((el) =>
    el.hasAttribute("data-scramble") || el.children.length === 0
  );

  if (!elements.length) {
    return;
  }

  const prefersReducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wideCharPattern =
    /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u;

  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  type QueueItem = {
    from: string;
    to: string;
    start: number;
    end: number;
    fromIsDud: boolean;
    wideDud: boolean;
    char?: string;
  };

  class TextScramble {
    private chars =
      "█▓▒░#*xX_-=~////\\\\____████▓▓▒▒░░######";
    private frame = 0;
    private frameRequest = 0;
    private queue: QueueItem[] = [];
    private resolve: () => void = () => {};

    constructor(private el: HTMLElement) {
      this.el = el;
      this.update = this.update.bind(this);
    }

    setText(newText: string, fromText?: string | string[]) {
      const oldChars = Array.isArray(fromText)
        ? [...fromText]
        : Array.from(fromText ?? this.el.textContent ?? "");
      const newChars = Array.from(newText);
      const length = Math.max(oldChars.length, newChars.length);
      const promise = new Promise<void>((resolve) => {
        this.resolve = resolve;
      });
      const fromIsDud = Array.isArray(fromText) || typeof fromText === "string";

      this.queue = [];
      for (let i = 0; i < length; i++) {
        const from = oldChars[i] || "";
        const to = newChars[i] || "";
        const start = Math.floor(Math.random() * 40);
        const end = start + Math.floor(Math.random() * 40);
        this.queue.push({
          from,
          to,
          start,
          end,
          fromIsDud,
          wideDud: this.isWideChar(to || from),
        });
      }

      cancelAnimationFrame(this.frameRequest);
      this.frame = 0;
      this.update();
      return promise;
    }

    update() {
      let output = "";
      let complete = 0;

      for (let i = 0, n = this.queue.length; i < n; i++) {
        const item = this.queue[i];
        const { from, to, start, end } = item;

        if (this.frame >= end) {
          complete++;
          output += escapeHtml(to);
        } else if (this.frame >= start) {
          if (!item.char || Math.random() < 0.28) {
            item.char = this.randomDud(item.wideDud);
          }

          output += this.dudHtml(item.char, to || from);
        } else {
          output += item.fromIsDud
            ? this.dudHtml(from, to || from)
            : escapeHtml(from);
        }
      }

      this.el.innerHTML = output;
      if (complete === this.queue.length) {
        this.resolve();
      } else {
        this.frameRequest = requestAnimationFrame(this.update);
        this.frame++;
      }
    }

    randomChar() {
      return this.chars[Math.floor(Math.random() * this.chars.length)];
    }

    randomDud(wide: boolean) {
      return wide
        ? `${this.randomChar()}${this.randomChar()}`
        : this.randomChar();
    }

    randomTextLike(text: string) {
      return Array.from(text)
        .map((char) =>
          char === " " ? " " : this.randomDud(this.isWideChar(char))
        );
    }

    isWideChar(char: string) {
      return wideCharPattern.test(char);
    }

    dudHtml(char: string, referenceChar: string) {
      const widthClass = this.isWideChar(referenceChar) ? " dud-wide" : "";
      return `<span class="dud${widthClass}">${escapeHtml(char)}</span>`;
    }
  }

  elements.forEach((el) => {
    const finalText = el.dataset.scramble || el.textContent || "";
    const onceKey = el.dataset.scrambleOnce;
    const storageKey = onceKey ? `scramble:${onceKey}` : "";

    if (storageKey && sessionStorage.getItem(storageKey)) {
      el.textContent = finalText;
      return;
    }

    if (!finalText.trim() || prefersReducedMotion) {
      el.textContent = finalText;
      if (storageKey) {
        sessionStorage.setItem(storageKey, "1");
      }
      return;
    }

    const fx = new TextScramble(el);
    fx.setText(finalText, fx.randomTextLike(finalText)).then(() => {
      if (storageKey) {
        sessionStorage.setItem(storageKey, "1");
      }
    });
  });
})();
