# Clinica Aurora

Sito dimostrativo responsive per una clinica, realizzato con HTML, CSS e JavaScript. Non è necessario installare librerie o eseguire una build.

## Avvio rapido con Visual Studio Code

1. Installa [Node.js](https://nodejs.org/) 18 o successivo.
2. Apri questa cartella in Visual Studio Code.
3. Premi **F5**.

Visual Studio Code avvierà il server locale e aprirà automaticamente `http://127.0.0.1:4173` nel browser. La configurazione è già inclusa in `.vscode/launch.json`.

In alternativa, usa **Terminale → Esegui attività di compilazione** (`Ctrl+Shift+B`) e seleziona **Avvia il sito**.

## Avvio su Windows o Visual Studio

Su Windows puoi fare doppio clic su `avvia-sito.bat`. Se utilizzi Visual Studio, apri la cartella con **File → Apri → Cartella**, quindi apri un terminale integrato ed esegui:

```powershell
npm start
```

Visita quindi [http://127.0.0.1:4173](http://127.0.0.1:4173). Interrompi il server con `Ctrl+C`.

Il server è compatibile con i percorsi Windows e Unix. Se avevi già avviato una versione precedente e vedevi il messaggio `Accesso negato`, chiudi il terminale del vecchio server con `Ctrl+C` e riavvialo con `npm start`.

## Avvio da qualsiasi terminale

```bash
npm start
```

Per avviare il server e aprire anche il browser predefinito:

```bash
npm run start:open
```

La porta può essere modificata tramite la variabile d'ambiente `PORT`, per esempio:

```bash
PORT=8080 npm start
```

## Struttura

- `index.html`: contenuti e struttura della pagina;
- `styles.css`: grafica e layout responsive;
- `script.js`: menu, animazioni e modulo di prenotazione;
- `assets/doctor.svg`: illustrazione della hero;
- `server.mjs`: piccolo server locale basato esclusivamente su Node.js.

> Il progetto è una demo frontend: le richieste di prenotazione non vengono salvate né inviate a un servizio sanitario reale.
