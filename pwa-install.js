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
    if (standalone()) return help("L’app è già aperta in modalità installata.");
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
          "Apri il menu di Chrome o Edge e scegli “Installa app” oppure “Installa pagina come app”.",
        );
      } finally {
        prompting = false;
        refresh();
      }
      return;
    }
    if (location.protocol === "file:") {
      return help(
        "Per installare l’app apri l’indirizzo HTTPS pubblicato su GitHub Pages. Il file aperto direttamente dal computer non può essere installato.",
      );
    }
    const ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    help(
      ios
        ? "Nel menu Condividi scegli “Aggiungi alla schermata Home”. Se la voce non compare, apri questo sito in Safari."
        : "Se la richiesta di installazione non compare, usa il menu di Chrome o Edge e scegli “Installa app” o “Installa pagina come app”. Se è già installata, aprila dall’elenco delle applicazioni. Su Safari per Mac usa File → Aggiungi al Dock. Nei browser senza installazione puoi utilizzare questa pagina.",
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
          console.warn("Preparazione PWA:", error);
          const status = document.getElementById("home-status");
          status.hidden = false;
          status.textContent =
            "La copia offline non è ancora pronta. Riapri questa pagina online per completare il caricamento.";
        });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else mount();
})();
