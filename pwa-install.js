/** Installazione autonoma: funziona anche se l'editor non completa l'avvio. */
(() => {
  let promptEvent = null;
  let installedThisSession = false;
  let prompting = false;
  const standalone = () =>
    installedThisSession ||
    window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;

  function refresh() {
    const button = document.getElementById("install");
    if (!button) return;
    button.hidden = standalone();
    button.disabled = prompting;
  }

  function help(message) {
    const dialog = document.getElementById("install-dialog");
    document.getElementById("install-help").textContent = message;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else window.alert(message);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    promptEvent = event;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    installedThisSession = true;
    promptEvent = null;
    refresh();
  });

  async function install() {
    if (prompting) return;
    if (standalone())
      return help("The app is already running in installed mode.");
    if (promptEvent) {
      const event = promptEvent;
      promptEvent = null;
      prompting = true;
      refresh();
      try {
        await event.prompt();
        await event.userChoice;
      } catch {
        help(
          "Open the Chrome or Edge menu and choose “Install app” or “Install page as app”.",
        );
      } finally {
        prompting = false;
        refresh();
      }
      return;
    }
    if (location.protocol === "file:") {
      return help(
        "To install the app, open its HTTPS address on GitHub Pages. A file opened directly from your computer cannot be installed.",
      );
    }
    const ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    help(
      ios
        ? "In the Share menu, choose “Add to Home Screen”. If this option is missing, open this site in Safari."
        : "If the installation prompt does not appear, use the Chrome or Edge menu and choose “Install app” or “Install page as app”. If already installed, open it from your applications. In Safari for Mac, use File → Add to Dock. Browsers without installation support can still use this page.",
    );
  }

  function mount() {
    document.getElementById("install").addEventListener("click", install);
    document
      .getElementById("install-close")
      .addEventListener("click", () =>
        document.getElementById("install-dialog").close(),
      );
    refresh();
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker
        .register("./sw.js", { scope: "./", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch((error) => {
          console.warn("PWA preparation:", error);
          const status = document.getElementById("home-status");
          status.hidden = false;
          status.textContent =
            "The offline copy is not ready yet. Reopen this page online to finish loading.";
        });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else mount();
})();
