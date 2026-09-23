// Crea l'applicazione ASP.NET Core leggendo configurazione, profilo di avvio
// ed eventuali variabili d'ambiente fornite da Visual Studio.
var builder = WebApplication.CreateBuilder(args);

// Comprime HTML, CSS, JavaScript e SVG con Brotli/Gzip quando il browser lo
// supporta. EnableForHttps è necessario perché il profilo principale usa HTTPS.
builder.Services.AddResponseCompression(options => options.EnableForHttps = true);

var app = builder.Build();

// Aggiunge intestazioni di sicurezza e una cache differenziata: la pagina HTML
// viene sempre rivalidata, mentre gli asset con parametro ?v= possono restare
// nella cache a lungo perché il valore cambia a ogni nuova versione.
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers.Append("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers["Content-Security-Policy"] = "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

    var isVersionedAsset = context.Request.Query.ContainsKey("v");
    headers["Cache-Control"] = isVersionedAsset
        ? "public,max-age=31536000,immutable"
        : "no-cache";

    await next();
});

app.UseResponseCompression();

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
