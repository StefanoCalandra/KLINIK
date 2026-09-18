# Clinica Aurora

Sito dimostrativo responsive per una clinica, pronto per essere aperto come progetto **ASP.NET Core in Visual Studio 2026**. Il frontend rimane composto da HTML, CSS e JavaScript standard.

## Avvio con Visual Studio 2026 (consigliato)

### Requisiti

Durante l'installazione di Visual Studio 2026 seleziona il carico di lavoro **Sviluppo ASP.NET e Web**. Il progetto usa .NET 10.

### Procedura

1. Apri `ClinicaAurora.sln` con Visual Studio 2026.
2. Verifica che `ClinicaAurora` sia il progetto di avvio (il nome deve apparire in grassetto in Esplora soluzioni).
3. Premi **F5** per avviare con il debugger, oppure **Ctrl+F5** per avviare senza debugger.
4. Visual Studio compilerà il progetto e aprirà automaticamente il sito nel browser.

Il profilo di avvio usa `https://localhost:7043` e `http://localhost:5043`. Al primo avvio HTTPS, Visual Studio potrebbe chiedere di autorizzare il certificato locale di sviluppo.

Non sono necessari `npm install`, estensioni come Live Server o comandi manuali nel terminale.

## Avvio rapido su Windows

Puoi anche fare doppio clic su `avvia-sito.bat`. Lo script preferisce automaticamente .NET/ASP.NET Core e, se .NET non è installato, prova il server Node.js alternativo.

## Avvio con Visual Studio Code

1. Installa Node.js 18 o successivo.
2. Apri questa cartella in Visual Studio Code.
3. Premi **F5**.

La configurazione inclusa avvierà il server alternativo e aprirà `http://127.0.0.1:4173` nel browser. È anche disponibile l'attività **Avvia il sito** tramite `Ctrl+Shift+B`.

## Avvio alternativo da terminale

Con il .NET SDK 10:

```powershell
dotnet run --project ClinicaAurora.csproj
```

Oppure con Node.js 18 o successivo, senza installare dipendenze:

```powershell
npm start
```

Per aprire anche il browser predefinito:

```powershell
npm run start:open
```

La porta del server Node può essere personalizzata tramite la variabile `PORT`.

## Struttura del progetto

- `ClinicaAurora.sln`: soluzione da aprire in Visual Studio 2026;
- `ClinicaAurora.csproj`: progetto web ASP.NET Core per .NET 10;
- `Program.cs`: configurazione del server ASP.NET Core;
- `Properties/launchSettings.json`: profilo di avvio e indirizzi locali per Visual Studio;
- `wwwroot/`: tutti i file pubblici del sito (`index.html`, CSS, JavaScript e immagini);
- `server.mjs`: server Node.js alternativo per chi non usa Visual Studio.

> Il progetto è una demo frontend: le richieste di prenotazione non vengono salvate né inviate a un servizio sanitario reale.
