// Crea l'applicazione ASP.NET Core leggendo configurazione, profilo di avvio
// ed eventuali variabili d'ambiente fornite da Visual Studio.
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Se l'indirizzo richiesto è una cartella (per esempio "/"), cerca il file
// predefinito "index.html". UseStaticFiles pubblica esclusivamente i file
// contenuti in wwwroot e assegna automaticamente il MIME type corretto.
app.UseDefaultFiles();
app.UseStaticFiles();

// In una demo a pagina singola, un percorso non riconosciuto torna alla home
// invece di mostrare una pagina 404. I file realmente esistenti sono già stati
// gestiti da UseStaticFiles nelle righe precedenti.
app.MapFallbackToFile("index.html");

// Avvia Kestrel sugli indirizzi definiti in Properties/launchSettings.json.
app.Run();
