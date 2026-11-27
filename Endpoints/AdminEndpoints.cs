using ClinicaAurora.Data;
using Microsoft.EntityFrameworkCore;

namespace ClinicaAurora.Endpoints;

public static class AdminEndpoints
{
    private static readonly TimeZoneInfo ClinicZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Rome");
    private static readonly string[] Statuses = ["In attesa", "Confermata", "Completata", "Annullata", "Assente"];

    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/appointments", async (DateOnly? from, DateOnly? to, int? doctorId,
            int? locationId, string? status, string? search, int? page, int? pageSize,
            KlinikDbContext db, HttpContext context, CancellationToken cancellationToken) =>
        {
            context.Response.Headers.CacheControl = "no-store";
            var number = page ?? 1;
            var size = pageSize ?? 25;
            if ((from.HasValue && (from.Value.Year < 2000 || from.Value.Year > 2099))
                || (to.HasValue && (to.Value.Year < 2000 || to.Value.Year > 2099))
                || (from.HasValue && to.HasValue && (from > to || to.Value.DayNumber - from.Value.DayNumber > 365))
                || number < 1 || size is < 1 or > 100 || (long)(number - 1) * size > int.MaxValue
                || doctorId is <= 0 || locationId is <= 0 || search?.Length > 120
                || (!string.IsNullOrEmpty(status) && !Statuses.Contains(status)))
                return Results.ValidationProblem(new Dictionary<string, string[]> {
                    ["filters"] = ["Verifica i filtri: date facoltative tra 2000 e 2099, periodo massimo 366 giorni se entrambe indicate, stato valido e fino a 100 visite per pagina."] });

            // Date inclusive della clinica, indipendenti dal fuso del browser.
            var query = db.Appointments.AsNoTracking().AsQueryable();
            if (from.HasValue)
            {
                var start = TimeZoneInfo.ConvertTimeToUtc(from.Value.ToDateTime(TimeOnly.MinValue), ClinicZone);
                query = query.Where(x => x.AppointmentDate >= start);
            }
            if (to.HasValue)
            {
                var end = TimeZoneInfo.ConvertTimeToUtc(to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue), ClinicZone);
                query = query.Where(x => x.AppointmentDate < end);
            }
            if (doctorId.HasValue) query = query.Where(x => x.DoctorId == doctorId);
            if (locationId.HasValue) query = query.Where(x => x.Doctor!.LocationId == locationId);
            if (!string.IsNullOrEmpty(status)) query = query.Where(x => x.Status == status);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                var numeric = term.StartsWith("AUR-", StringComparison.OrdinalIgnoreCase) ? term[4..] : term;
                var hasId = int.TryParse(numeric, out var id);
                query = query.Where(x => x.PatientName.Contains(term) || x.Phone.Contains(term) || (hasId && x.Id == id));
            }
            var counts = await query.GroupBy(x => x.Status)
                .Select(x => new { Status = x.Key, Count = x.Count() }).ToListAsync(cancellationToken);
            int Count(string state) => counts.FirstOrDefault(x => x.Status == state)?.Count ?? 0;
            var total = counts.Sum(x => x.Count);
            // Senza periodo: mostra prima le richieste appena registrate.
            // Con un periodo esplicito: mantiene l'ordine cronologico delle visite.
            var ordered = from.HasValue || to.HasValue
                ? query.OrderBy(x => x.AppointmentDate).ThenBy(x => x.Id)
                : query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id);
            var items = await ordered.Skip((number - 1) * size).Take(size).Select(x => new
                {
                    x.Id, x.PatientName, x.Phone, x.Email, x.AppointmentDate, x.DurationMinutes,
                    x.Status, x.Notes, x.CreatedAt, x.DoctorId, Doctor = x.Doctor!.FullName,
                    Specialty = x.Doctor.Specialty!.Name, x.MedicalServiceId,
                    MedicalService = x.MedicalService == null ? "Visita standard" : x.MedicalService.Name,
                    LocationId = x.Doctor.LocationId, Location = x.Doctor.Location!.Name,
                    Address = x.Doctor.Location.Address, City = x.Doctor.Location.City
                }).ToListAsync(cancellationToken);
            return Results.Ok(new { items, total, page = number, pageSize = size,
                summary = new { pending = Count("In attesa"), confirmed = Count("Confermata"),
                    completed = Count("Completata"), cancelled = Count("Annullata"), absent = Count("Assente") } });
        });
        return app;
    }
}
