# Ceramic – Summary form

PWA statica per la schedatura ceramica di scavo. Nessun account, API o server applicativo. Il pacchetto include già la versione pronta per il browser. Tutte le risorse sono incluse e servite dallo stesso sito.

## Pubblicazione su GitHub Pages

1. Estrai lo ZIP: `index.html` si trova direttamente nella cartella estratta.
2. Carica **tutti i file estratti** nella radice della repository GitHub: `index.html`, `styles.css`, `js`, `assets`, `vendor`, `manifest.webmanifest`, `sw.js` e gli altri file. Non caricare un’ulteriore sottocartella: `index.html` deve essere nella radice pubblicata.
3. Nella repository apri **Settings → Pages**. In **Build and deployment** scegli **Deploy from a branch**, branch `main`, cartella `/ (root)`, poi **Save**.
4. Al termine della pubblicazione apri `https://NOMEUTENTE.github.io/NOMEREPOSITORY/`. Per la repository attuale sarà `https://alessandromandelli.github.io/archeologia/`.
5. Apri il sito online e attendi il caricamento completo prima di usarlo senza connessione.

GitHub può spostare le voci delle impostazioni: la destinazione rimane la cartella radice pubblicata tramite Pages. Per pubblicare e utilizzare la copia inclusa non servono `npm install`, build o chiavi API. Il file `app.bundle.js` è già pronto.

## Installazione

- **Chrome / Edge compatibili:** premi **Installa app** nella home. Se il browser ha già reso disponibile la richiesta, si aprirà il suo pannello di installazione. Altrimenti l’app indica come usare il menu del browser.
- **iPhone / iPad:** menu **Condividi → Aggiungi alla schermata Home**; se la voce manca nel browser usato, apri il sito in Safari.
- **Safari su Mac compatibile:** **File → Aggiungi al Dock**.
- Nei browser senza installazione nativa l’app resta utilizzabile da una normale scheda.

La disponibilità della richiesta e l’aspetto dell’installazione dipendono da browser e sistema operativo. HTTPS è necessario; GitHub Pages lo fornisce.

## Uso

La home contiene **Nuova scheda**, **Importa JSON** e **Installa app**. La compilazione presenta `Excavation site`, `Area`, `Stratigraphic Unit`, `Room`, tabella **Fragments**, osservazioni e Sketch. Su desktop i quattro campi sono in colonna a sinistra e la tabella è subito sotto; a destra si trovano Fabric and remarks e Sketch. Su mobile le due colonne si dispongono in sequenza. Una nuova scheda presenta una sola riga vuota; **Aggiungi riga** aggiunge le successive. I conteggi richiedono interi non negativi: gli zeri inseriti sono valori effettivi e vengono stampati. Una riga viene esclusa dal PDF solo se tutte le sue celle sono vuote.

**Fabric and remarks** ha la stessa dimensione e lo stesso peso del titolo Fragments, cresce con il testo e mostra `type here` come guida. Tocca il box **Sketch**, con testo `tap to draw`, per aprire l’editor su tutto lo spazio disponibile della finestra. Il foglio bianco mantiene proporzioni 4:3 ed è separato dal contenitore con bordo, ombra e margine su tutti i lati.

Tutti i comandi sono sotto al foglio: **Penna**, **Gomma**, **Sposta foglio**, **Annulla tratto**, **Ripeti tratto**, **Pulisci sketch**, spessore penna, **Riduci**, **Ingrandisci**, **Adatta al contenitore** e **Salva sketch**. Il puntatore sul foglio è una matita in modalità Penna e una gomma in modalità Gomma, nei dispositivi che mostrano un cursore. I pulsanti restano solo testuali.

Lo zoom va da 100% (foglio adattato con margine) a 600%. Due dita permettono zoom e spostamento; su desktop puoi usare i pulsanti oppure Ctrl/Command e rotella per lo zoom, la rotella per spostare il foglio ingrandito, o **Sposta foglio** per trascinarlo. **Adatta al contenitore** ripristina la vista iniziale. Zoom e spostamento non cambiano dimensioni, proporzioni o coordinate del disegno esportato. Sono ignorati i contatti touch mentre la penna sta tracciando, per ridurre i segni del palmo; il comportamento dipende anche dal driver dello stilo.

**Salva sketch** torna alla scheda; riaprendo il box puoi continuare a disegnare. Anche Escape/Indietro sul dialogo salva lo sketch corrente. **Pulisci sketch** chiede conferma; la cancellazione completa non è annullabile. Il PDF include il disegno salvato, senza strumenti e con l’impaginazione della versione 1.1.

**Reset scheda**, in basso a sinistra, apre **Vuoi resettare la scheda?** con **Sì / No**. Sì cancella tutti i campi e lo sketch e torna alla home; No chiude il box.

**Salva PDF ed esporta JSON** è l’unico pulsante di esportazione: prepara entrambi i file dalla stessa copia dei dati e con lo stesso nome base. I due download vengono avviati automaticamente. Sotto al pulsante restano i collegamenti **PDF** e **JSON** per recuperarli individualmente, anche se il browser limita i download multipli. Non viene creato uno ZIP. Il JSON è la copia modificabile da conservare per riprendere il lavoro; il PDF è la copia per la stampa.

Non sono presenti salvataggi locali automatici o un archivio del browser. Esporta i file prima di chiudere: il browser può mostrare un avviso in caso di modifiche non esportate, ma sui dispositivi mobili l’avviso non è garantito.

## Nomi dei file

PDF e JSON usano lo stesso schema:

`excavation site_area_strat.unit_room_AAAA_MM_GG_HH_mm.estensione`

Esempio: `Dime_A12_1045_3_2026_10_26_15_08.pdf`.

La data e l’ora sono quelle locali del dispositivo al momento dell’esportazione, in formato 24 ore. I valori mancanti diventano `NA`; spazi e caratteri non ammessi nei nomi dei file diventano trattini. Mese, giorno, ore e minuti hanno due cifre. Se due esportazioni hanno lo stesso nome, il browser può aggiungere un suffisso al download.

## PDF provvisorio

Formato A4 verticale, bianco e nero. Intestazione e dati di scavo in alto; tabella con sole righe compilate a sinistra; testo multilinea e schizzo a destra. Se necessario il contenuto prosegue su altre pagine senza tagliare righe o testo. I font sono incorporati per mantenere accenti e caratteri internazionali supportati dal font Liberation Sans; i simboli fuori da questo font, come alcune emoji, non sono garantiti.

L’impaginazione è **provvisoria**, in attesa del template PDF definitivo. Il renderer è isolato in `js/pdf.js` per poterlo sostituire senza cambiare l’interfaccia o il formato dati.

## JSON e compatibilità

Lo schema attuale è `ceramic-summary-form-pwa-v3`. Il documento contiene intestazione, righe, osservazioni, schizzo con coordinate normalizzate e anteprima PNG. Importa anche i JSON della precedente app, con `header`, `rows`, `remarks`, `sketchPng`: il vecchio schizzo viene conservato come immagine di base, su cui si può continuare a disegnare. Non si possono annullare singolarmente i tratti della vecchia immagine.

L’importazione verifica i campi prima di sostituire la scheda: limite 30 MB, 5.000 righe e un milione di punti nello schizzo. Le immagini devono essere PNG incorporati; non vengono caricate immagini da URL esterni. Gli eventuali salvataggi interni della vecchia versione non vengono migrati: esportarli prima come JSON usando la vecchia app.

## Struttura del codice

- `index.html`: schermate e dialoghi accessibili.
- `styles.css`: layout responsive e palette.
- `js/app.js`: flusso dell’app e import/export.
- `app.bundle.js`: copia pronta per il browser, generata dai moduli sorgenti.
- `pwa-install.js`: installazione indipendente dall’editor, seguendo la struttura di SMV.
- `bootstrap.js`: allineamento del sottotitolo e segnalazione degli errori di avvio.
- `build.mjs`: generazione riproducibile del bundle.
- `js/data.js`: schema, validazione e nomi file.
- `js/sketch.js`: editor, interazione con penna/touch e rendering dei tratti.
- `js/sketch-view.js`: geometria indipendente per zoom e spostamento.
- `assets/cursor-pen.svg`, `assets/cursor-eraser.svg`: puntatori del foglio.
- `js/pdf.js`: generazione PDF.
- `sw.js`: cache offline, limitata allo scope dell’app.
- `manifest.webmanifest`: identità e icone PWA.
- `vendor/`: jsPDF locale e licenze dei componenti.

Per sviluppare in locale con Python 3: `python3 -m http.server 8080`, poi apri `http://localhost:8080`. Non aprire `index.html` direttamente come file: font e service worker richiedono HTTP/HTTPS.

Per modificare il codice: Node.js 20 o successivo, `npm install`, `npm run build`, quindi `npm test`. Il bundle non va modificato a mano: modificare i file in `js/` e rigenerarlo. Le dipendenze di sviluppo sono esbuild e jsdom; non sono necessarie sul sito pubblicato.

Per rilasciare aggiornamenti, cambia `VERSION` in `sw.js` e carica i file aggiornati. La nuova cache viene attivata dopo la chiusura di tutte le finestre dell’app precedente, evitando di mescolare file di due versioni. La prima sostituzione della vecchia app può richiedere la chiusura e riapertura di tutte le sue finestre, o un aggiornamento della pagina online.

## Componenti

jsPDF 3.0.3 (MIT) e font Liberation Sans (licenza in `vendor/`). Immagine di sfondo generata per questo progetto. Icona locale con profilo di recipiente. Nessun servizio di analisi o tracciamento.

## Aggiornamento dalla v1.0

Sostituisci i file pubblicati e includi anche i nuovi `app.bundle.js`, `pwa-install.js`, `bootstrap.js` e i font Liberation Sans in `assets/`. Il vecchio pulsante `reset` interferiva con il metodo del modulo: è stato rinominato e il reset usa esplicitamente il metodo nativo. L’installazione è ora indipendente da editor e libreria PDF. I pulsanti della home si attivano al completamento dell’avvio; in caso di errore compare un messaggio.

Dopo la pubblicazione apri il sito online, attendi qualche secondo per scaricare l’aggiornamento, poi chiudi **tutte** le schede e finestre dell’app, compresa quella installata, e riaprila. Questo permette alla nuova versione offline di attivarsi. Se compare ancora la grafica precedente, aggiorna la pagina con Ctrl+Shift+R su Windows/Linux o Cmd+Shift+R su Mac e ripeti la chiusura delle finestre. Non cancellare i dati del sito prima di aver esportato eventuali schede utili dalla vecchia versione.

## Novità v1.1

- Corretto l’avvio di Nuova scheda e il reset del modulo.
- Installazione autonoma con gestione del prompt e istruzioni alternative.
- Pulsanti con sole etichette di testo.
- Liberation Sans incluso nell’app e incorporato nei PDF.
- Summary form allineato alla larghezza di Ceramic anche dopo il caricamento del font e il ridimensionamento.
- Filigrana dietro ai pulsanti su desktop e mobile; su mobile il paesaggio è ingrandito e ritagliato.

## Novità v1.2

- Nuovo layout: dati di scavo e Fragments a sinistra; Fabric and remarks e Sketch a destra.
- Una sola riga iniziale, titoli uniformati, etichetta Stratigraphic Unit per esteso.
- Testi guida `type here` e `tap to draw`.
- Unico pulsante per esportare PDF e JSON con lo stesso nome base.
- Editor Sketch con comandi inferiori, modalità Penna/Gomma/Sposta foglio, cursori dedicati, margine intorno al foglio, zoom e gesto a due dita.
- Renderer PDF identico alla versione 1.1; lo schema JSON rimane compatibile.

## Verifiche di questa consegna

Test automatici del formato dati, flussi dei pulsanti in ambiente DOM simulato, installazione simulata, importazione precedente, reset Sì/No, esportazione con libreria PDF e font reali, conservazione dei tratti dopo annulla/ripeti, zoom e spostamento, margini del foglio e gesto a due dita senza segni accidentali. Verificata la cache offline comprese le nuove risorse dei puntatori. Il file del renderer PDF è stato confrontato con la versione precedente ed è invariato.

L’ambiente DOM di test non sostituisce il browser reale: restano da controllare sul dispositivo la resa grafica, la richiesta nativa di installazione, i gesti touch e il disegno con lo stilo.
