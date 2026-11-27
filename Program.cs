using ClinicaAurora.Data;
using ClinicaAurora.Endpoints;
using ClinicaAurora.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using System.Threading.RateLimiting;

// Deve essere eseguito prima che Microsoft.Data.SqlClient inizializzi il proprio
// supporto globale. Il runtimeconfig e il pacchetto ICU applicano la stessa
// configurazione ancora prima dell'ingresso nel metodo Main.
AppContext.SetSwitch("System.Globalization.Invariant", false);

// Crea l'applicazione ASP.NET Core leggendo configurazione, profilo di avvio
// ed eventuali variabili d'ambiente fornite da Visual Studio.
var builder = WebApplication.CreateBuilder(args);

// Comprime HTML, CSS, JavaScript e SVG con Brotli/Gzip quando il browser lo
// supporta. EnableForHttps è necessario perché il profilo principale usa HTTPS.
builder.Services.AddResponseCompression(options => options.EnableForHttps = true);
builder.Services.AddDbContextPool<KlinikDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("KlinikDatabase")));
builder.Services.AddScoped<ClinicStoredProcedures>();

builder.Services.AddAuthentication(AdminSecurity.Scheme).AddCookie(AdminSecurity.Scheme, options =>
{
    options.Cookie.Name = "Klinik.Admin";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = false;
    options.Events.OnValidatePrincipal = AdminSecurity.ValidateCookieAsync;
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "Klinik.Antiforgery";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
});
builder.Services.AddDataProtection().SetApplicationName("ClinicaAurora")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Environment.ContentRootPath, "App_Data", "DataProtectionKeys")));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("admin-login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

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

    var extension = Path.GetExtension(context.Request.Path);
    var isVersionedAsset = context.Request.Query.ContainsKey("v")
        && extension is ".css" or ".js" or ".svg";
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
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(AdminSecurity.GuardAsync);

// Espone le operazioni CRUD per specialità, sedi, medici, appuntamenti e
// prodotti. I dati vengono letti e modificati direttamente su SQL Server.
app.MapClinicEndpoints();
app.MapAdminEndpoints();
app.MapAdminAuth();

// Un indirizzo API sconosciuto non deve restituire HTML con stato 200.
app.MapFallback("/api/{**path}", () => Results.NotFound());

// In una demo a pagina singola, un percorso non riconosciuto torna alla home
// invece di mostrare una pagina 404. I file realmente esistenti sono già stati
// gestiti da UseStaticFiles nelle righe precedenti.
app.MapFallbackToFile("index.html");

// Al primo avvio crea il database e inserisce alcuni dati dimostrativi.
// Lo scope garantisce che il DbContext venga eliminato correttamente.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<KlinikDbContext>();
    await DatabaseInitializer.InitializeAsync(db, builder.Configuration.GetValue<bool>("Database:ReapplyScripts"));
}

// Avvia Kestrel sugli indirizzi definiti in Properties/launchSettings.json.
app.Run();
