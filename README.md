# Ceramic – Summary form

PWA statica per la schedatura ceramica di scavo. Nessun account, API, server applicativo o processo di build. Tutte le risorse sono incluse e servite dallo stesso sito.

## Pubblicazione su GitHub Pages

1. Estrai lo ZIP e apri la cartella `archeologia`.
2. Carica **il contenuto** della cartella nella radice della repository GitHub: `index.html`, `styles.css`, `js`, `assets`, `vendor`, `manifest.webmanifest`, `sw.js` e gli altri file. Evita una cartella `archeologia` annidata nella repository.
3. Nella repository apri **Settings → Pages**. In **Build and deployment** scegli **Deploy from a branch**, branch `main`, cartella `/ (root)`, poi **Save**.
4. Al termine della pubblicazione apri `https://NOMEUTENTE.github.io/NOMEREPOSITORY/`. Per la repository attuale sarà `https://alessandromandelli.github.io/archeologia/`.
5. Apri il sito online e attendi il caricamento completo prima di usarlo senza connessione.

GitHub può spostare le voci delle impostazioni: la destinazione rimane la cartella radice pubblicata tramite Pages. Non servono `npm install` o chiavi API.

## Installazione

- **Chrome / Edge compatibili:** premi **Installa app** nella home. Se il browser ha già reso disponibile la richiesta, si aprirà il suo pannello di installazione. Altrimenti l’app indica come usare il menu del browser.
- **iPhone / iPad:** menu **Condividi → Aggiungi alla schermata Home**; se la voce manca nel browser usato, apri il sito in Safari.
- **Safari su Mac compatibile:** **File → Aggiungi al Dock**.
- Nei browser senza installazione nativa l’app resta utilizzabile da una normale scheda.

La disponibilità della richiesta e l’aspetto dell’installazione dipendono da browser e sistema operativo. HTTPS è necessario; GitHub Pages lo fornisce.

## Uso

La home contiene **Nuova scheda**, **Importa JSON** e **Installa app**. La compilazione presenta `Excavation site`, `Area`, `Strat. Unit`, `Room`, tabella **Fragments**, osservazioni e schizzo. I conteggi richiedono interi non negativi: gli zeri inseriti sono valori effettivi e vengono stampati. Una riga viene esclusa dal PDF solo se tutte le sue celle sono vuote.

**Fabric and remarks** cresce con il testo. Tocca il box **Schizzo** per aprire l’editor su tutto lo spazio disponibile della finestra. Il foglio mantiene proporzioni 4:3 e non si deforma ruotando il dispositivo. Supporta penna, dito e mouse, spessore, gomma, annulla/ripeti. **Salva schizzo** torna alla scheda; riaprendo il box puoi continuare a disegnare. Anche Escape/Indietro sul dialogo salva lo schizzo corrente. **Pulisci schizzo** chiede conferma; la cancellazione completa non è annullabile. Il PDF include lo schizzo salvato, senza strumenti.

**Reset scheda**, in basso a sinistra, apre il box **Vuoi resettare la scheda?** con **Sì / No**. Sì cancella dati e schizzo e torna alla home; No chiude il box.

**Esporta JSON** salva una copia modificabile: è il formato da conservare per riprendere il lavoro. Non sono presenti salvataggi locali automatici o un archivio del browser. Esporta il JSON prima di chiudere: il browser può mostrare un avviso in caso di modifiche non esportate, ma sui dispositivi mobili l’avviso non è garantito. Il PDF è una copia per la stampa e non sostituisce il JSON.

## Nomi dei file

PDF e JSON usano lo stesso schema:

`excavation site_area_strat.unit_room_AAAA_MM_GG_HH_mm.estensione`

Esempio: `Dime_A12_1045_3_2026_10_26_15_08.pdf`.

La data e l’ora sono quelle locali del dispositivo al momento dell’esportazione, in formato 24 ore. I valori mancanti diventano `NA`; spazi e caratteri non ammessi nei nomi dei file diventano trattini. Mese, giorno, ore e minuti hanno due cifre. Se due esportazioni hanno lo stesso nome, il browser può aggiungere un suffisso al download.

## PDF provvisorio

Formato A4 verticale, bianco e nero. Intestazione e dati di scavo in alto; tabella con sole righe compilate a sinistra; testo multilinea e schizzo a destra. Se necessario il contenuto prosegue su altre pagine senza tagliare righe o testo. I font sono incorporati per mantenere accenti e caratteri internazionali supportati dal font DejaVu; i simboli fuori da questo font, come alcune emoji, non sono garantiti.

L’impaginazione è **provvisoria**, in attesa del template PDF definitivo. Il renderer è isolato in `js/pdf.js` per poterlo sostituire senza cambiare l’interfaccia o il formato dati.

## JSON e compatibilità

Lo schema attuale è `ceramic-summary-form-pwa-v3`. Il documento contiene intestazione, righe, osservazioni, schizzo con coordinate normalizzate e anteprima PNG. Importa anche i JSON della precedente app, con `header`, `rows`, `remarks`, `sketchPng`: il vecchio schizzo viene conservato come immagine di base, su cui si può continuare a disegnare. Non si possono annullare singolarmente i tratti della vecchia immagine.

L’importazione verifica i campi prima di sostituire la scheda: limite 30 MB, 5.000 righe e un milione di punti nello schizzo. Le immagini devono essere PNG incorporati; non vengono caricate immagini da URL esterni. Gli eventuali salvataggi interni della vecchia versione non vengono migrati: esportarli prima come JSON usando la vecchia app.

## Struttura del codice

- `index.html`: schermate e dialoghi accessibili.
- `styles.css`: layout responsive e palette.
- `js/app.js`: flusso dell’app, import/export e installazione.
- `js/data.js`: schema, validazione e nomi file.
- `js/sketch.js`: editor e rendering dei tratti.
- `js/pdf.js`: generazione PDF.
- `sw.js`: cache offline, limitata allo scope dell’app.
- `manifest.webmanifest`: identità e icone PWA.
- `vendor/`: jsPDF locale e licenze dei componenti.

Per sviluppare in locale con Python 3: `python3 -m http.server 8080`, poi apri `http://localhost:8080`. Non aprire `index.html` direttamente come file: moduli, font e service worker richiedono HTTP/HTTPS.

Test del formato dati con Node.js 20 o successivo: `npm test`. I test non richiedono pacchetti aggiuntivi.

Per rilasciare aggiornamenti, cambia `VERSION` in `sw.js` e carica i file aggiornati. La nuova cache viene attivata dopo la chiusura di tutte le finestre dell’app precedente, evitando di mescolare file di due versioni. La prima sostituzione della vecchia app può richiedere la chiusura e riapertura di tutte le sue finestre, o un aggiornamento della pagina online.

## Componenti

jsPDF 3.0.3 (MIT) e font DejaVu (licenza in `vendor/`). Immagine di sfondo generata per questo progetto. Icona locale con profilo di recipiente. Nessun servizio di analisi o tracciamento.

## Verifiche di questa consegna

Eseguiti i sei test automatici dei dati e il controllo sintattico di tutti i moduli. Verificata la generazione PDF con font incorporati, righe vuote escluse e contenuto lungo su quattro pagine, controllando anche l’ultima riga e l’ultima osservazione e il rendering delle pagine.

Il collaudo grafico completo nel browser non è stato possibile nell’ambiente di preparazione. Dopo la pubblicazione vanno provati sul dispositivo reale: layout mobile/desktop, tastiera numerica, disegno con lo stilo, annulla/ripeti, rotazione dello schermo, import/export JSON, conferma reset, installazione e riapertura in modalità aereo dopo il primo caricamento online.
