# Clinica Aurora

Clinica Aurora è un sito dimostrativo responsive per una clinica: presenta i servizi, permette di cercare una disponibilità, mostra alcuni specialisti e simula una richiesta di appuntamento. Il progetto è pronto per **Visual Studio 2026**, usa **ASP.NET Core e .NET 10** come server principale e mantiene un piccolo server Node.js come alternativa.

> **Importante:** è una demo didattica. Salva richieste di appuntamento e dati di contatto nel database locale, ma non vende farmaci e non gestisce cartelle cliniche. Non deve essere esposta su Internet o usata con dati sanitari reali senza autenticazione, consenso, cifratura e adeguamento normativo.

## Indice

1. [Cosa fa il programma](#cosa-fa-il-programma)
2. [Avvio con Visual Studio 2026](#avvio-con-visual-studio-2026)
3. [Come funziona una richiesta](#come-funziona-una-richiesta)
4. [Architettura e responsabilità dei file](#architettura-e-responsabilità-dei-file)
5. [Funzionamento del frontend](#funzionamento-del-frontend)
6. [Funzionamento del server ASP.NET Core](#funzionamento-del-server-aspnet-core)
7. [Server Node.js alternativo](#server-nodejs-alternativo)
8. [Personalizzazione](#personalizzazione)
9. [Database SQL Server e SSMS 21](#database-sql-server-e-ssms-21)
10. [API CRUD](#api-crud)
11. [Ottimizzazioni delle prestazioni](#ottimizzazioni-delle-prestazioni)
12. [Limiti della demo e passaggio alla produzione](#limiti-della-demo-e-passaggio-alla-produzione)
13. [Risoluzione dei problemi](#risoluzione-dei-problemi)

## Cosa fa il programma

La pagina è organizzata come un sito “one page”: i collegamenti del menu scorrono verso sezioni della stessa pagina. Specialità, sedi, medici, appuntamenti e prodotti sono conservati in SQL Server.

- **Hero:** presenta la clinica, la prossima disponibilità e i pulsanti principali.
- **Ricerca rapida:** carica specialità, sede e medici dal database e prepara il modulo di prenotazione.
- **Servizi:** descrive visite specialistiche, telemedicina e farmacia.
- **Specialisti:** mostra profili e disponibilità di esempio.
- **Farmacia:** è una vetrina grafica. Il pulsante informa che il negozio sarà disponibile in futuro.
- **Prenotazione:** apre un elemento HTML `<dialog>`, valida i campi e salva la richiesta nella tabella `Appointments`.
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

La pagina HTML rimane statica, ma JavaScript interroga le API ASP.NET Core. Le API usano Entity Framework Core per leggere e scrivere SQL Server, quindi gli aggiornamenti diventano disponibili senza modificare manualmente l'HTML.

## Architettura e responsabilità dei file

```text
KLINIK/
├── ClinicaAurora.sln              # Soluzione aperta da Visual Studio
├── ClinicaAurora.csproj           # Tipo di progetto e versione .NET
├── Program.cs                     # Pipeline HTTP ASP.NET Core
├── appsettings.json               # Connessione a SQL Server e logging
├── Data/                          # DbContext e inizializzazione dei dati
├── Models/                        # Tabelle rappresentate come classi C#
├── Dtos/                          # Contratti JSON accettati dalle API
├── Endpoints/                     # Operazioni CRUD HTTP
├── database/
│   └── schema.sql                 # Creazione manuale alternativa da SSMS
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
- L'evento `submit` usa `preventDefault()`, costruisce il JSON e invia la prenotazione a `/api/appointments`; il codice restituito dal database viene mostrato nella conferma.
- Il pulsante menu alterna la classe `open` e aggiorna `aria-expanded`.
- `IntersectionObserver` aggiunge la classe `visible` agli elementi che entrano nello schermo, attivando la transizione CSS senza un listener continuo sullo scroll.
- `loadReferenceData()` carica in parallelo specialità, sedi e medici; la ricerca filtra i medici e apre lo stesso dialog.

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

Il server Node pubblica soltanto la parte grafica e non si collega a SQL Server. Per caricare o modificare i dati e registrare prenotazioni bisogna avviare il progetto ASP.NET Core da Visual Studio o con `dotnet run`.

## Personalizzazione

### Cambiare testi e sezioni

Modifica `wwwroot/index.html`. Mantieni gli `id` (`servizi`, `specialisti`, `farmacia`, `contatti`) se vuoi conservare il funzionamento dei link del menu.

### Cambiare colori

Modifica le variabili all'inizio di `wwwroot/styles.css`. Per esempio, `--green` controlla gran parte del colore istituzionale e `--orange` gli elementi in evidenza.

### Aggiungere uno specialista

Aggiungi il medico tramite `/api/doctors` oppure nella tabella `Doctors` da SSMS, indicando una specialità e una sede esistenti. La pagina genera automaticamente le schede leggendo il database.

### Estendere la prenotazione

Il salvataggio di base è già collegato a SQL Server. Per un impiego reale occorre inoltre:

1. aggiungere un calendario con slot e durata delle prestazioni;
2. autenticare pazienti e personale;
3. inviare email di conferma e promemoria;
4. registrare audit e modifiche di stato;
5. cifrare i dati sensibili e gestire il consenso;
6. definire conservazione, backup e cancellazione dei dati.

La validazione nel browser non sostituisce mai quella sul server.

## Database SQL Server e SSMS 21

### Collegamento configurato

L'applicazione usa Entity Framework Core con il provider SQL Server. La stringa di connessione in `appsettings.json` è già configurata per:

```text
Server:   STEFANO-PC\SQLEXPRESS
Database: KlinikDb
Accesso:  Autenticazione di Windows
```

La stringa completa è:

```text
Server=STEFANO-PC\SQLEXPRESS;Database=KlinikDb;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True
```

`Trusted_Connection=True` significa che SQL Server usa l'account Windows con cui viene avviato Visual Studio. Non vengono salvate password nel repository.

### Preparazione di SQL Server Express

1. Apri **SQL Server Configuration Manager**.
2. Verifica che il servizio **SQL Server (SQLEXPRESS)** sia in esecuzione.
3. Apri **SQL Server Management Studio 21**.
4. In **Nome server** inserisci `STEFANO-PC\SQLEXPRESS`.
5. Seleziona **Autenticazione di Windows** e premi **Connetti**.
6. Avvia il sito da Visual Studio. Al primo avvio Entity Framework crea automaticamente `KlinikDb`, tabelle, relazioni, indici e dati iniziali.
7. In SSMS fai clic destro su **Database** e scegli **Aggiorna** per vedere `KlinikDb`.

L'account Windows che esegue il progetto deve avere il permesso di creare il database. Se non lo possiede, un amministratore può eseguire `database/schema.sql` in SSMS. Lo script è alternativo alla creazione automatica: non va eseguito dopo che Entity Framework ha già creato il database.

### Tabelle

| Tabella | Contenuto | Relazioni principali |
|---|---|---|
| `Specialties` | Specialità della clinica | Uno-a-molti con `Doctors` |
| `Locations` | Sedi fisiche e telemedicina | Uno-a-molti con `Doctors` |
| `Doctors` | Medici, biografia e disponibilità | Collegata a specialità e sede |
| `Appointments` | Paziente, recapiti, data, stato e note | Collegata a un medico |
| `PharmacyProducts` | Catalogo, prezzo, giacenza e stato | Indipendente |

La coppia `DoctorId` + `AppointmentDate` è univoca: SQL Server impedisce che lo stesso medico riceva due prenotazioni nello stesso istante. Le eliminazioni di specialità, sedi o medici già utilizzati vengono bloccate per non lasciare dati orfani.

### Modificare i dati da SSMS

In SSMS espandi **KlinikDb → Tabelle**, fai clic destro su una tabella e usa:

- **Seleziona le prime 1000 righe** per consultare i dati;
- **Modifica le prime 200 righe** per aggiungere o aggiornare manualmente;
- **Nuova query** per eseguire istruzioni SQL controllate.

Esempi:

```sql
USE KlinikDb;

-- Aggiunta di una specialità
INSERT dbo.Specialties (Name, Description)
VALUES (N'Oculistica', N'Prevenzione e cura della vista');

-- Aggiornamento della disponibilità di un medico
UPDATE dbo.Doctors
SET IsAvailable = 0
WHERE Id = 1;

-- Eliminazione di un prodotto non più venduto
DELETE dbo.PharmacyProducts
WHERE Id = 3;
```

Prima di cancellare record direttamente da SSMS, controlla sempre le relazioni. Per le normali operazioni applicative è preferibile usare le API, che applicano validazione e restituiscono errori comprensibili.

### Cambiare server o istanza

Modifica soltanto `ConnectionStrings:KlinikDatabase` in `appsettings.json`. Per esempio, per un'istanza locale predefinita:

```json
"KlinikDatabase": "Server=localhost;Database=KlinikDb;Trusted_Connection=True;TrustServerCertificate=True"
```

Dopo una modifica chiudi e riavvia Visual Studio. Non pubblicare mai una stringa contenente nome utente o password: in produzione usa Secret Manager, variabili d'ambiente o un archivio di segreti.

## API CRUD

Il backend espone API JSON complete per leggere, aggiungere, aggiornare ed eliminare i dati:

| Risorsa | Indirizzo | GET | POST | PUT | DELETE |
|---|---|:---:|:---:|:---:|:---:|
| Specialità | `/api/specialties` | ✓ | ✓ | `/{id}` | `/{id}` |
| Sedi | `/api/locations` | ✓ | ✓ | `/{id}` | `/{id}` |
| Medici | `/api/doctors` | ✓ | ✓ | `/{id}` | `/{id}` |
| Appuntamenti | `/api/appointments` | ✓ | ✓ | `/{id}` | `/{id}` |
| Prodotti | `/api/products` | ✓ | ✓ | `/{id}` | `/{id}` |

Le chiamate `GET` non modificano i dati. `POST` crea un record, `PUT` sostituisce i dati modificabili e `DELETE` elimina il record. Le risposte usano codici HTTP standard: `201` per la creazione, `204` per modifica/eliminazione, `400` per dati non validi, `404` per record inesistenti e `409` per conflitti.

Esempio PowerShell per leggere i medici:

```powershell
Invoke-RestMethod https://localhost:7043/api/doctors
```

Esempio per aggiungere un prodotto:

```powershell
$prodotto = @{
  name = "Crema viso"
  category = "Dermocosmesi"
  price = 22.90
  stockQuantity = 15
  isActive = $true
  description = "Crema idratante quotidiana"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri https://localhost:7043/api/products `
  -ContentType "application/json" `
  -Body $prodotto
```

Il sito usa già queste API per caricare specialità, sedi e medici e per registrare una prenotazione. Per ragioni di sicurezza, prima di esporre il sito su Internet bisogna proteggere POST, PUT, DELETE e la lettura degli appuntamenti con autenticazione e ruoli amministrativi.

## Ottimizzazioni delle prestazioni

Il progetto applica le ottimizzazioni adatte alle sue dimensioni senza introdurre un processo di build o dipendenze aggiuntive:

- **Compressione HTTP:** ASP.NET Core negozia Brotli/Gzip tramite `AddResponseCompression`; il server Node alternativo supporta Gzip per HTML, CSS, JavaScript, JSON e SVG.
- **Cache differenziata:** `index.html` viene rivalidato, mentre CSS, JavaScript e SVG con parametro `?v=` ricevono `max-age=31536000, immutable`. Quando un asset cambia, bisogna aggiornare il valore versione in `index.html`.
- **Nessun font remoto:** la grafica usa lo stack tipografico del sistema, eliminando richieste a Google Fonts, dipendenze di rete e possibili ritardi nel testo.
- **Risorsa principale prioritaria:** l'SVG della hero dichiara dimensioni, `fetchpriority="high"` e decodifica asincrona; non usa lazy loading perché appare immediatamente.
- **JavaScript non bloccante:** lo script usa `defer` e viene eseguito dopo il parsing del documento.
- **Animazioni efficienti:** `IntersectionObserver` rimuove dall'osservazione ogni elemento dopo la prima animazione; `prefers-reduced-motion` continua a tutelare chi riduce i movimenti.
- **Header di sicurezza:** entrambi i server inviano CSP, `nosniff`, Referrer Policy e Permissions Policy. Oltre a ridurre la superficie d'attacco, la CSP impedisce caricamenti accidentali da origini non autorizzate.

Durante lo sviluppo, dopo una modifica a `styles.css`, `script.js` o `doctor.svg`, incrementa la versione usata negli URL, per esempio da `?v=20260923` a `?v=20260924`. In questo modo i browser scaricano il nuovo contenuto pur mantenendo efficiente la cache delle versioni precedenti.

Per misurare le prestazioni reali è consigliato usare Lighthouse e la scheda Network degli strumenti di sviluppo, controllando LCP, CLS, INP, numero di richieste e byte trasferiti. Le future pagine con fotografie dovrebbero usare immagini AVIF/WebP, dimensioni esplicite, `srcset` e `loading="lazy"` soltanto sotto la piega.

## Limiti della demo e passaggio alla produzione

Attualmente:

- i medici e le prenotazioni sono nel database, ma non esiste ancora un calendario completo degli slot;
- il form salva dati di contatto, ma non invia ancora email o promemoria;
- la farmacia non contiene catalogo, carrello o pagamenti;
- non esistono login, area paziente o area amministrativa;
- SQL Server è configurato, mentre email, audit applicativo e monitoraggio non lo sono ancora;
- il sito usa font di sistema per restare veloce e funzionare anche senza Internet.

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

### La tipografia è leggermente diversa su due computer

Il sito usa i font già installati dal sistema operativo per evitare download esterni; Windows, macOS e Linux possono quindi mostrare caratteri leggermente diversi. Se serve un'identità tipografica identica ovunque, inserisci file WOFF2 con licenza adeguata in `wwwroot/assets/fonts`, dichiarali con `@font-face` e aggiorna la versione degli asset.

## Controlli disponibili

Il comando seguente verifica la sintassi dei file JavaScript senza avviare il sito:

```powershell
npm run check
```

Per verificare la parte .NET da terminale:

```powershell
dotnet build ClinicaAurora.sln
```
