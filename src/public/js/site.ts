(() => {
  const toc = document.querySelector<HTMLElement>(".post-toc");
  const button = document.querySelector<HTMLAnchorElement>(".back-to-top");

  if (!toc || !button) {
    return;
  }

  const setVisible = (visible: boolean) => {
    button.classList.toggle("is-visible", visible);
    button.setAttribute("aria-hidden", visible ? "false" : "true");
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    }, {
      threshold: 0,
    });

    observer.observe(toc);
    return;
  }

  const updateVisibility = () => {
    setVisible(toc.getBoundingClientRect().bottom < 0);
  };

  updateVisibility();
  window.addEventListener("scroll", updateVisibility, { passive: true });
  window.addEventListener("resize", updateVisibility);
})();
