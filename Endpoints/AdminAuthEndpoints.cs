using ClinicaAurora.Data;
using ClinicaAurora.Models;
using ClinicaAurora.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClinicaAurora.Endpoints;

public sealed record AdminLoginRequest(string? Username, string? Password);
public sealed record AdminCredentialsRequest(string? Username, string? CurrentPassword, string? NewPassword, string? ConfirmPassword);

public static class AdminAuthEndpoints
{
    public static IEndpointRouteBuilder MapAdminAuth(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/session", (HttpContext context, IAntiforgery antiforgery) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new { authenticated = context.User.Identity?.IsAuthenticated == true,
                username = context.User.Identity?.Name, csrfToken = antiforgery.GetAndStoreTokens(context).RequestToken });
        });
        app.MapPost("/api/admin/login", async (AdminLoginRequest request, HttpContext context, KlinikDbContext db) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Length > 80
                || string.IsNullOrEmpty(request.Password) || request.Password.Length > 256)
                return Results.Unauthorized();
            var account = await db.AdminAccounts.AsNoTracking().SingleAsync(x => x.Id == 1, context.RequestAborted);
            // Esegue comunque la verifica dell'hash anche con uno username errato.
            var valid = new PasswordHasher<AdminAccount>().VerifyHashedPassword(account, account.PasswordHash, request.Password);
            if (!string.Equals(account.Username, request.Username.Trim(), StringComparison.Ordinal)
                || valid == PasswordVerificationResult.Failed) return Results.Unauthorized();
            await context.SignInAsync(AdminSecurity.Scheme, AdminSecurity.Principal(account),
                new AuthenticationProperties { IsPersistent = false, AllowRefresh = false });
            return Results.Ok(new { username = account.Username });
        }).RequireRateLimiting("admin-login");
        app.MapPost("/api/admin/logout", async (HttpContext context) =>
        {
            await context.SignOutAsync(AdminSecurity.Scheme);
            return Results.NoContent();
        }).RequireAuthorization();
        app.MapPut("/api/admin/credentials", async (AdminCredentialsRequest request, HttpContext context, KlinikDbContext db) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var username = request.Username?.Trim();
            if (string.IsNullOrWhiteSpace(username) || username.Length > 80 || username.Any(char.IsControl)
                || string.IsNullOrEmpty(request.CurrentPassword) || request.CurrentPassword.Length > 256
                || string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length > 256
                || request.NewPassword != request.ConfirmPassword)
                return Results.BadRequest(new { message = "Indica username, password attuale e nuova password confermata. Username massimo 80 caratteri, password massimo 256." });
            var account = await db.AdminAccounts.AsNoTracking().SingleAsync(x => x.Id == 1, context.RequestAborted);
            var hasher = new PasswordHasher<AdminAccount>();
            if (hasher.VerifyHashedPassword(account, account.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
                return Results.BadRequest(new { message = "La password attuale non è corretta." });
            var oldStamp = account.SecurityStamp;
            account.Username = username;
            account.PasswordHash = hasher.HashPassword(account, request.NewPassword);
            account.SecurityStamp = Guid.NewGuid().ToString();
            var changed = await db.AdminAccounts.Where(x => x.Id == 1 && x.SecurityStamp == oldStamp)
                .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.Username, account.Username)
                    .SetProperty(x => x.PasswordHash, account.PasswordHash).SetProperty(x => x.SecurityStamp, account.SecurityStamp)
                    .SetProperty(x => x.ChangedAt, DateTime.UtcNow), context.RequestAborted);
            if (changed != 1) return Results.Conflict(new { message = "Credenziali già modificate da un'altra sessione. Accedi nuovamente." });
            await context.SignInAsync(AdminSecurity.Scheme, AdminSecurity.Principal(account),
                new AuthenticationProperties { IsPersistent = false, AllowRefresh = false });
            return Results.Ok(new { username = account.Username });
        }).RequireAuthorization();
        return app;
    }
}
