using System.Security.Claims;
using ClinicaAurora.Data;
using ClinicaAurora.Models;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClinicaAurora.Services;

public static class AdminSecurity
{
    public const string Scheme = "AdminCookie";
    public static ClaimsPrincipal Principal(AdminAccount account) => new(new ClaimsIdentity([
        new Claim(ClaimTypes.NameIdentifier, "1"), new Claim(ClaimTypes.Name, account.Username),
        new Claim("security_stamp", account.SecurityStamp)
    ], Scheme));

    public static async Task EnsureAccountAsync(KlinikDbContext db)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("""
            DECLARE @result int;
            EXEC @result=sys.sp_getapplock @Resource=N'KLINIK:AdminSeed',@LockMode=N'Exclusive',
                @LockOwner=N'Transaction',@LockTimeout=15000;
            IF @result<0 THROW 50041, 'Account amministrativo non inizializzato.',1;
            """);
        if (!await db.AdminAccounts.AnyAsync())
        {
            var account = new AdminAccount();
            account.PasswordHash = new PasswordHasher<AdminAccount>().HashPassword(account, "admin");
            db.AdminAccounts.Add(account);
            await db.SaveChangesAsync();
        }
        await transaction.CommitAsync();
    }

    public static async Task ValidateCookieAsync(CookieValidatePrincipalContext context)
    {
        var db = context.HttpContext.RequestServices.GetRequiredService<KlinikDbContext>();
        var stamp = await db.AdminAccounts.AsNoTracking().Where(x => x.Id == 1)
            .Select(x => x.SecurityStamp).SingleOrDefaultAsync(context.HttpContext.RequestAborted);
        if (stamp is null || stamp != context.Principal?.FindFirstValue("security_stamp"))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(Scheme);
        }
    }

    public static async Task GuardAsync(HttpContext context, RequestDelegate next)
    {
        var path = (context.Request.Path.Value ?? "").TrimEnd('/').ToLowerInvariant();
        if (!path.StartsWith("/api/", StringComparison.Ordinal)) { await next(context); return; }
        var read = HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method);
        var login = path == "/api/admin/login" && HttpMethods.IsPost(context.Request.Method);
        var session = path == "/api/admin/session" && read;
        var publicBooking = path == "/api/appointments" && HttpMethods.IsPost(context.Request.Method);
        var protectedRead = path.StartsWith("/api/appointments", StringComparison.Ordinal)
            || path.StartsWith("/api/admin", StringComparison.Ordinal)
            || path.StartsWith("/api/doctor-absences", StringComparison.Ordinal);
        var requiresAdmin = !login && !session && !publicBooking && (!read || protectedRead);
        if (requiresAdmin) context.Response.Headers.CacheControl = "no-store";
        if (requiresAdmin && context.User.Identity?.IsAuthenticated != true)
        {
            context.Response.Headers.CacheControl = "no-store";
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { message = "Accedi all'area amministrazione." });
            return;
        }
        if (!read && !publicBooking)
        {
            try { await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); }
            catch (AntiforgeryValidationException)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsJsonAsync(new { message = "Sessione del modulo non valida. Ricarica la pagina e riprova." });
                return;
            }
        }
        await next(context);
    }
}
