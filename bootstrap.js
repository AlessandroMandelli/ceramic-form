/** Segnala un avvio incompleto e allinea il sottotitolo al titolo della home. */
(() => {
  function reportFailure() {
    if (window.CeramicAppReady) return;
    const status = document.getElementById("home-status");
    if (!status) return;
    status.hidden = false;
    status.textContent =
      "Startup incomplete. Reload the page. If the problem persists, check that all ZIP files have been uploaded, including app.bundle.js.";
  }
  window.addEventListener("error", reportFailure);
  window.addEventListener("unhandledrejection", reportFailure);

  function mount() {
    const title = document.getElementById("home-title");
    const subtitle = document.getElementById("home-subtitle");
    function fitTitle() {
      if (document.getElementById("home").hidden) return;
      const width = title.getBoundingClientRect().width;
      if (!width) return;
      subtitle.style.letterSpacing = "0px";
      subtitle.style.transform = "none";
      const naturalWidth = subtitle.getBoundingClientRect().width;
      const spaces = [...subtitle.textContent.trim()].length - 1;
      subtitle.style.letterSpacing = `${Math.max(0, (width - naturalWidth) / spaces)}px`;
      // Trailing letter-spacing is included in the inline box; compensate via a tiny scale.
      const measured = subtitle.getBoundingClientRect().width;
      subtitle.style.transform = measured ? `scaleX(${width / measured})` : "";
    }
    fitTitle();
    window.addEventListener("resize", fitTitle, { passive: true });
    if (typeof ResizeObserver !== "undefined")
      new ResizeObserver(fitTitle).observe(title);
    if (document.fonts) {
      document.fonts.ready.then(fitTitle).catch(() => {});
      document.fonts.addEventListener?.("loadingdone", fitTitle);
    }
    document.addEventListener("ceramic:home", fitTitle);
    setTimeout(reportFailure, 8000);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
