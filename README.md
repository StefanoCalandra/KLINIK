# Clinica Aurora

Clinica Aurora è un sito dimostrativo responsive per una clinica: presenta i servizi, permette di cercare una disponibilità, mostra alcuni specialisti e simula una richiesta di appuntamento. Il progetto è pronto per **Visual Studio 2026**, usa **ASP.NET Core e .NET 10** come server principale e mantiene un piccolo server Node.js come alternativa.

> **Importante:** è una demo didattica. Non salva prenotazioni, non vende farmaci, non gestisce cartelle cliniche e non deve essere usata con dati sanitari reali senza un backend, autenticazione, consenso, cifratura e adeguamento normativo.

## Indice

1. [Cosa fa il programma](#cosa-fa-il-programma)
2. [Avvio con Visual Studio 2026](#avvio-con-visual-studio-2026)
3. [Come funziona una richiesta](#come-funziona-una-richiesta)
4. [Architettura e responsabilità dei file](#architettura-e-responsabilità-dei-file)
5. [Funzionamento del frontend](#funzionamento-del-frontend)
6. [Funzionamento del server ASP.NET Core](#funzionamento-del-server-aspnet-core)
7. [Server Node.js alternativo](#server-nodejs-alternativo)
8. [Personalizzazione](#personalizzazione)
9. [Limiti della demo e passaggio alla produzione](#limiti-della-demo-e-passaggio-alla-produzione)
10. [Risoluzione dei problemi](#risoluzione-dei-problemi)

## Cosa fa il programma

La pagina è organizzata come un sito “one page”: i collegamenti del menu scorrono verso sezioni della stessa pagina.

- **Hero:** presenta la clinica, la prossima disponibilità e i pulsanti principali.
- **Ricerca rapida:** raccoglie specialità, sede e data. Nella demo apre il modulo di contatto; non interroga un calendario reale.
- **Servizi:** descrive visite specialistiche, telemedicina e farmacia.
- **Specialisti:** mostra profili e disponibilità di esempio.
- **Farmacia:** è una vetrina grafica. Il pulsante informa che il negozio sarà disponibile in futuro.
- **Prenotazione:** apre un elemento HTML `<dialog>`, valida nel browser i campi obbligatori e mostra una conferma locale.
- **Responsive design:** il layout passa da più colonne a una colonna e il menu diventa compatto su tablet e telefoni.
- **Accessibilità di base:** sono presenti testi alternativi, etichette, attributi ARIA e rispetto di `prefers-reduced-motion`.

## Avvio con Visual Studio 2026

### Requisiti

Apri **Visual Studio Installer** e verifica che sia installato il carico di lavoro **Sviluppo ASP.NET e Web**, comprensivo del supporto a .NET 10.

### Procedura consigliata

1. Scarica o estrai l'intera cartella del progetto, senza spostare singolarmente i file.
2. Apri `ClinicaAurora.sln` con Visual Studio 2026.
3. In **Esplora soluzioni**, verifica che `ClinicaAurora` sia il progetto di avvio. Se non lo è, fai clic destro sul progetto e scegli **Imposta come progetto di avvio**.
4. Premi **F5** per eseguire con il debugger oppure **Ctrl+F5** per eseguire senza debugger.
5. Visual Studio compila l'applicazione, avvia Kestrel e apre automaticamente il browser.

Il profilo usa questi indirizzi:

- `https://localhost:7043`
- `http://localhost:5043`

Al primo avvio HTTPS, Visual Studio può chiedere di autorizzare il certificato locale di sviluppo. Non servono `npm install`, Live Server o altri pacchetti.

### Avvio rapido su Windows

Facendo doppio clic su `avvia-sito.bat`, lo script:

1. si posiziona nella cartella corretta;
2. cerca il comando `dotnet`;
3. se lo trova, esegue il progetto ASP.NET Core;
4. altrimenti cerca Node.js ed esegue il server alternativo;
5. se non trova nessuno dei due, mostra cosa installare.

### Avvio da terminale

Con .NET SDK 10:

```powershell
dotnet run --project ClinicaAurora.csproj
```

Con Node.js 18 o successivo:

```powershell
npm start
```

Per avviare Node.js e aprire anche il browser predefinito:

```powershell
npm run start:open
```

## Come funziona una richiesta

Quando il browser apre, per esempio, `https://localhost:7043/`, avviene questa sequenza:

1. **Kestrel** riceve la richiesta HTTP.
2. `Program.cs` esegue `UseDefaultFiles()`, che traduce la richiesta `/` nella ricerca di `index.html`.
3. `UseStaticFiles()` cerca il file dentro `wwwroot` e lo restituisce con il tipo di contenuto corretto.
4. Il browser legge `index.html` e richiede separatamente `styles.css`, `script.js` e `assets/doctor.svg`.
5. Il CSS costruisce il layout e applica le media query in base alla larghezza dello schermo.
6. JavaScript collega i gestori degli eventi ai pulsanti, al menu e al modulo.
7. Se nessun file o endpoint corrisponde al percorso, `MapFallbackToFile("index.html")` riporta alla pagina principale.

Il server non genera dinamicamente l'HTML e non usa un database: consegna al browser file statici, mentre l'interattività dimostrativa avviene nel browser.

## Architettura e responsabilità dei file

```text
KLINIK/
├── ClinicaAurora.sln              # Soluzione aperta da Visual Studio
├── ClinicaAurora.csproj           # Tipo di progetto e versione .NET
├── Program.cs                     # Pipeline HTTP ASP.NET Core
├── Properties/
│   └── launchSettings.json        # URL, browser e ambiente Development
├── wwwroot/                       # Unica cartella pubblicamente accessibile
│   ├── index.html                 # Contenuto e struttura semantica
│   ├── styles.css                 # Tema, componenti e responsive design
│   ├── script.js                  # Interazioni eseguite nel browser
│   └── assets/
│       └── doctor.svg             # Illustrazione vettoriale della hero
├── server.mjs                     # Server locale Node.js alternativo
├── package.json                   # Comandi npm, senza dipendenze
├── avvia-sito.bat                 # Avvio facilitato su Windows
└── .vscode/                       # Avvio e attività per Visual Studio Code
```

### `ClinicaAurora.csproj`

Usa l'SDK `Microsoft.NET.Sdk.Web`, quindi Visual Studio riconosce un'applicazione ASP.NET Core. `TargetFramework` è `net10.0`; `Nullable` abilita i controlli sui valori null e `ImplicitUsings` rende disponibili automaticamente gli spazi dei nomi più comuni. Non sono presenti pacchetti NuGet esterni.

### `ClinicaAurora.sln`

Raggruppa il progetto e le configurazioni Debug/Release. È il file da aprire in Visual Studio: non contiene logica applicativa.

### `Properties/launchSettings.json`

Il profilo `ClinicaAurora` dice a Visual Studio di avviare il progetto, aprire il browser, mostrare i messaggi di avvio e impostare l'ambiente `Development`. Gli URL definiti qui valgono per l'esecuzione locale, non per la pubblicazione su un server reale.

### `wwwroot`

ASP.NET Core considera `wwwroot` la radice web. Un file fuori da questa cartella non viene pubblicato da `UseStaticFiles()`. Questa separazione evita, per esempio, che il browser possa scaricare il file di soluzione o il codice del server.

## Funzionamento del frontend

### Struttura HTML

`index.html` contiene elementi semantici (`header`, `nav`, `main`, `section`, `article`, `footer`) e assegna un `id` alle sezioni raggiungibili dal menu. Le classi sono usate dal CSS, mentre gli attributi `data-book` permettono a più pulsanti di condividere la stessa logica JavaScript senza duplicare identificatori.

Il modulo usa `required` e `type="tel"` per la validazione HTML di base. Il componente `<dialog>` fornisce nativamente focus, modalità modale e sfondo. Il simbolo di ricerca è definito una volta dentro uno `<symbol>` SVG e riutilizzato con `<use>`.

### Stili CSS

Il foglio di stile è diviso logicamente in quattro livelli:

1. le variabili in `:root` definiscono la palette (`--green`, `--orange`, `--cream` e così via);
2. le regole base costruiscono header, pulsanti, schede, dialog e sezioni desktop;
3. la media query a `850px` trasforma griglie e navigazione per tablet;
4. la media query a `560px` adatta tipografia e contenuti ai telefoni;
5. `prefers-reduced-motion` disabilita le animazioni per chi lo ha richiesto nel sistema operativo.

### JavaScript, passo per passo

- `dialog` e `form` memorizzano riferimenti agli elementi usati più volte.
- `querySelectorAll('[data-book]')` collega tutti i pulsanti di prenotazione a `showModal()`.
- Il pulsante X e il clic sullo sfondo chiamano `dialog.close()`.
- L'evento `submit` usa `preventDefault()`: non ricarica la pagina, nasconde il form e mostra la conferma. È qui che un'applicazione reale dovrebbe inviare i dati a un'API.
- Il pulsante menu alterna la classe `open` e aggiorna `aria-expanded`.
- `IntersectionObserver` aggiunge la classe `visible` agli elementi che entrano nello schermo, attivando la transizione CSS senza un listener continuo sullo scroll.
- La ricerca rapida apre lo stesso dialog; l'icona di ricerca porta il focus al selettore della specialità; il pulsante farmacia mostra un avviso dimostrativo.

## Funzionamento del server ASP.NET Core

`Program.cs` usa il modello minimale di ASP.NET Core:

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
```

Il builder legge impostazioni, profilo e variabili d'ambiente. La pipeline viene poi costruita nell'ordine seguente:

```csharp
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");
```

L'ordine è importante: prima viene individuato il documento predefinito, poi si tenta di restituire un file reale, infine si applica il fallback. `app.Run()` mette il server in ascolto fino all'arresto da Visual Studio o tramite `Ctrl+C`.

## Server Node.js alternativo

`server.mjs` esiste per chi non dispone di .NET. Usa esclusivamente moduli inclusi in Node.js:

- `node:http` crea il server;
- `node:fs` legge e invia i file come stream;
- `node:path` risolve percorsi Windows e Unix e blocca l'uscita da `wwwroot`;
- `node:child_process` apre il browser con `--open`;
- la mappa `contentTypes` assegna i MIME type corretti;
- le risorse mancanti restituiscono HTTP 404 e gli URL non validi HTTP 400;
- `SIGINT` e `SIGTERM` consentono un arresto pulito.

Il server ascolta per impostazione predefinita su `127.0.0.1:4173`. È possibile cambiare la porta:

```powershell
$env:PORT=8080; npm start
```

## Personalizzazione

### Cambiare testi e sezioni

Modifica `wwwroot/index.html`. Mantieni gli `id` (`servizi`, `specialisti`, `farmacia`, `contatti`) se vuoi conservare il funzionamento dei link del menu.

### Cambiare colori

Modifica le variabili all'inizio di `wwwroot/styles.css`. Per esempio, `--green` controlla gran parte del colore istituzionale e `--orange` gli elementi in evidenza.

### Aggiungere uno specialista

Duplica un elemento `<article>` dentro `.doctor-list`, modifica iniziali, nome, specialità e disponibilità. Se vengono aggiunti molti medici è consigliabile passare a dati provenienti da un database e generare le schede dinamicamente.

### Collegare una vera prenotazione

Occorre almeno:

1. creare un modello C# per i dati del paziente;
2. esporre un endpoint POST ASP.NET Core;
3. validare i dati anche sul server;
4. inviare il form con `fetch()`;
5. salvare i dati in un database;
6. aggiungere autenticazione, autorizzazione, audit, cifratura e gestione del consenso.

La validazione nel browser non sostituisce mai quella sul server.

## Limiti della demo e passaggio alla produzione

Attualmente:

- le disponibilità e i medici sono testi statici;
- il form non invia né conserva informazioni;
- la farmacia non contiene catalogo, carrello o pagamenti;
- non esistono login, area paziente o area amministrativa;
- non sono configurati database, email, logging applicativo o monitoraggio;
- i font vengono richiesti a Google Fonts e richiedono accesso a Internet.

Prima di usare il progetto in produzione servono analisi di sicurezza, informativa privacy, gestione dei cookie, conformità GDPR, protezione dei dati sanitari, backup, test automatici, HTTPS valido e servizi backend adeguati.

## Risoluzione dei problemi

### Visual Studio non avvia il progetto

Verifica di aver aperto `ClinicaAurora.sln`, di avere il workload **Sviluppo ASP.NET e Web** e che `dotnet --list-sdks` mostri una versione 10.x.

### Il browser segnala un certificato non attendibile

È normale con un certificato locale non ancora autorizzato. Dal terminale per sviluppatori puoi eseguire:

```powershell
dotnet dev-certs https --trust
```

### La porta è già occupata

Chiudi la precedente istanza con **Arresta debug** oppure cambia `applicationUrl` in `Properties/launchSettings.json`. Per il server Node, imposta la variabile `PORT`.

### Vedo ancora “Accesso negato”

Arresta eventuali vecchie istanze con `Ctrl+C` e riavvia. Il server attuale usa percorsi multipiattaforma; il messaggio 403 deve comparire solo quando una richiesta tenta di leggere un file esterno a `wwwroot`.

### La grafica appare senza font

Il sito continua a funzionare con i font di fallback, ma Google Fonts potrebbe essere bloccato da una rete offline o aziendale. Per un'installazione completamente offline, scarica font con licenza adeguata, inseriscili in `wwwroot/assets` e dichiarali con `@font-face`.

## Controlli disponibili

Il comando seguente verifica la sintassi dei file JavaScript senza avviare il sito:

```powershell
npm run check
```

Per verificare la parte .NET da terminale:

```powershell
dotnet build ClinicaAurora.sln
```
