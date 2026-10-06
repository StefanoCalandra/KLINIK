using ClinicaAurora.Data;
using ClinicaAurora.Dtos;
using ClinicaAurora.Models;
using ClinicaAurora.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;

namespace ClinicaAurora.Endpoints;

public static class ClinicEndpoints
{
    public static IEndpointRouteBuilder MapClinicEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api");
        MapSpecialties(api);
        MapLocations(api);
        MapDoctors(api);
        MapAppointments(api);
        MapProducts(api);
        MapMedicalServices(api);
        MapDoctorSchedules(api);
        return app;
    }

    private static void MapSpecialties(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/specialties");
        group.MapGet("/", async (KlinikDbContext db) => await db.Specialties.AsNoTracking().OrderBy(x => x.Name).ToListAsync());
        group.MapGet("/{id:int}", async (int id, KlinikDbContext db) =>
        {
            var item = await db.Specialties.FindAsync(id);
            if (item is null) return Results.NotFound();
            return Results.Ok(item);
        });
        group.MapPost("/", async (SpecialtyRequest request, KlinikDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name)) return Validation("Il nome è obbligatorio.");
            var item = new Specialty { Name = request.Name.Trim(), Description = request.Description?.Trim() };
            db.Specialties.Add(item);
            await db.SaveChangesAsync();
            return Results.Created($"/api/specialties/{item.Id}", item);
        });
        group.MapPut("/{id:int}", async (int id, SpecialtyRequest request, KlinikDbContext db) =>
        {
            var item = await db.Specialties.FindAsync(id);
            if (item is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(request.Name)) return Validation("Il nome è obbligatorio.");
            item.Name = request.Name.Trim(); item.Description = request.Description?.Trim();
            await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapDelete("/{id:int}", (int id, KlinikDbContext db) => DeleteAsync(db, db.Specialties, id));
    }

    private static void MapLocations(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/locations");
        group.MapGet("/", async (KlinikDbContext db) => await db.Locations.AsNoTracking().OrderBy(x => x.Name).ToListAsync());
        group.MapGet("/{id:int}", async (int id, KlinikDbContext db) =>
        {
            var item = await db.Locations.FindAsync(id);
            if (item is null) return Results.NotFound();
            return Results.Ok(item);
        });
        group.MapPost("/", async (LocationRequest request, KlinikDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name)) return Validation("Il nome è obbligatorio.");
            var item = new Location { Name = request.Name.Trim(), Address = request.Address?.Trim(), City = request.City?.Trim() };
            db.Locations.Add(item); await db.SaveChangesAsync();
            return Results.Created($"/api/locations/{item.Id}", item);
        });
        group.MapPut("/{id:int}", async (int id, LocationRequest request, KlinikDbContext db) =>
        {
            var item = await db.Locations.FindAsync(id);
            if (item is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(request.Name)) return Validation("Il nome è obbligatorio.");
            item.Name = request.Name.Trim(); item.Address = request.Address?.Trim(); item.City = request.City?.Trim();
            await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapDelete("/{id:int}", (int id, KlinikDbContext db) => DeleteAsync(db, db.Locations, id));
    }

    private static void MapDoctors(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/doctors");
        group.MapGet("/", async (int? specialtyId, int? locationId, bool? onlyAvailable, ClinicStoredProcedures procedures, CancellationToken cancellationToken) =>
            await procedures.SearchDoctorsAsync(specialtyId, locationId, onlyAvailable ?? false, cancellationToken));
        group.MapGet("/{id:int}", async (int id, KlinikDbContext db) =>
        {
            var item = await db.Doctors.AsNoTracking().Where(x => x.Id == id).Select(x => new
            {
                x.Id, x.FullName, x.Biography, x.IsAvailable, x.SpecialtyId,
                Specialty = x.Specialty!.Name, x.LocationId, Location = x.Location!.Name
            }).FirstOrDefaultAsync();
            if (item is null) return Results.NotFound();
            return Results.Ok(item);
        });
        group.MapPost("/", async (DoctorRequest request, KlinikDbContext db) =>
        {
            var error = await ValidateDoctorAsync(request, db); if (error is not null) return error;
            var item = new Doctor { FullName = request.FullName.Trim(), Biography = request.Biography?.Trim(), IsAvailable = request.IsAvailable, SpecialtyId = request.SpecialtyId, LocationId = request.LocationId };
            db.Doctors.Add(item); await db.SaveChangesAsync();
            return Results.Created($"/api/doctors/{item.Id}", new { item.Id });
        });
        group.MapPut("/{id:int}", async (int id, DoctorRequest request, KlinikDbContext db) =>
        {
            var item = await db.Doctors.FindAsync(id); if (item is null) return Results.NotFound();
            var error = await ValidateDoctorAsync(request, db); if (error is not null) return error;
            item.FullName = request.FullName.Trim(); item.Biography = request.Biography?.Trim(); item.IsAvailable = request.IsAvailable; item.SpecialtyId = request.SpecialtyId; item.LocationId = request.LocationId;
            await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapDelete("/{id:int}", (int id, KlinikDbContext db) => DeleteAsync(db, db.Doctors, id));
    }

    private static void MapAppointments(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/appointments");
        group.MapGet("/", async (DateTime? from, DateTime? to, int? doctorId, string? status, ClinicStoredProcedures procedures, CancellationToken cancellationToken) =>
        {
            var rangeFrom = from ?? DateTime.Today.AddYears(-1);
            var rangeTo = to ?? DateTime.Today.AddYears(5);
            if (rangeFrom >= rangeTo) return Results.ValidationProblem(new Dictionary<string, string[]> { ["range"] = ["L'intervallo di date non è valido."] });
            var results = await procedures.GetAppointmentsAsync(rangeFrom, rangeTo, doctorId, status, cancellationToken);
            return Results.Ok(results);
        });
        group.MapGet("/{id:int}", async (int id, KlinikDbContext db) =>
        {
            var item = await db.Appointments.AsNoTracking().Where(x => x.Id == id).Select(x => new
            {
                x.Id, x.PatientName, x.Phone, x.Email, x.AppointmentDate, x.Status,
                x.Notes, x.DoctorId, Doctor = x.Doctor!.FullName, Specialty = x.Doctor.Specialty!.Name, x.CreatedAt
            }).FirstOrDefaultAsync();
            if (item is null) return Results.NotFound();
            return Results.Ok(item);
        });
        group.MapPost("/", async (AppointmentRequest request, ClinicStoredProcedures procedures, CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await procedures.CreateAppointmentAsync(request, cancellationToken);
                return Results.Created($"/api/appointments/{result.Id}", result);
            }
            catch (SqlException exception) when (exception.Number is >= 50001 and <= 50005)
            {
                return StoredProcedureProblem(exception);
            }
        });
        group.MapPut("/{id:int}", async (int id, AppointmentRequest request, KlinikDbContext db) =>
        {
            var item = await db.Appointments.FindAsync(id); if (item is null) return Results.NotFound();
            var error = await ValidateAppointmentAsync(request, db, id); if (error is not null) return error;
            item.PatientName = request.PatientName.Trim(); item.Phone = request.Phone.Trim(); item.Email = request.Email?.Trim();
            item.AppointmentDate = request.AppointmentDate; item.Status = string.IsNullOrWhiteSpace(request.Status) ? item.Status : request.Status.Trim();
            item.Notes = request.Notes?.Trim(); item.DoctorId = request.DoctorId;
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) { return Results.Conflict(new { message = "Questo orario non è più disponibile." }); }
            return Results.NoContent();
        });
        group.MapPost("/{id:int}/cancel", async (int id, ClinicStoredProcedures procedures, CancellationToken cancellationToken) =>
        {
            try { await procedures.CancelAppointmentAsync(id, cancellationToken); return Results.NoContent(); }
            catch (SqlException exception) when (exception.Number is >= 50000 and <= 59999) { return StoredProcedureProblem(exception); }
        });
        group.MapPut("/{id:int}/status", async (int id, AppointmentStatusRequest request, ClinicStoredProcedures procedures, CancellationToken cancellationToken) =>
        {
            try { await procedures.SetAppointmentStatusAsync(id, request.Status, cancellationToken); return Results.NoContent(); }
            catch (SqlException exception) when (exception.Number is >= 50000 and <= 59999) { return StoredProcedureProblem(exception); }
        });
        // DELETE resta disponibile per l'amministrazione; il sito deve preferire /cancel per conservare lo storico.
        group.MapDelete("/{id:int}", (int id, KlinikDbContext db) => DeleteAsync(db, db.Appointments, id));
    }

    private static void MapProducts(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/products");
        group.MapGet("/", async (bool? active, string? category, string? search, KlinikDbContext db, ClinicStoredProcedures procedures, CancellationToken cancellationToken) =>
        {
            if (active is not false) return Results.Ok(await procedures.GetAvailableProductsAsync(category, search, cancellationToken));
            var query = db.PharmacyProducts.AsNoTracking().AsQueryable();
            return Results.Ok(await query.OrderBy(x => x.Name).ToListAsync(cancellationToken));
        });
        group.MapGet("/{id:int}", async (int id, KlinikDbContext db) =>
        {
            var item = await db.PharmacyProducts.FindAsync(id);
            if (item is null) return Results.NotFound();
            return Results.Ok(item);
        });
        group.MapPost("/", async (ProductRequest request, KlinikDbContext db) =>
        {
            var error = ValidateProduct(request); if (error is not null) return error;
            var item = ToProduct(request); db.PharmacyProducts.Add(item); await db.SaveChangesAsync();
            return Results.Created($"/api/products/{item.Id}", item);
        });
        group.MapPut("/{id:int}", async (int id, ProductRequest request, KlinikDbContext db) =>
        {
            var item = await db.PharmacyProducts.FindAsync(id); if (item is null) return Results.NotFound();
            var error = ValidateProduct(request); if (error is not null) return error;
            item.Name = request.Name.Trim(); item.Category = request.Category.Trim(); item.Price = request.Price; item.StockQuantity = request.StockQuantity; item.IsActive = request.IsActive; item.Description = request.Description?.Trim();
            await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapDelete("/{id:int}", (int id, KlinikDbContext db) => DeleteAsync(db, db.PharmacyProducts, id));
        group.MapPost("/{id:int}/decrease-stock", async (int id, StockRequest request, ClinicStoredProcedures procedures, CancellationToken cancellationToken) =>
        {
            try { return Results.Ok(await procedures.DecreaseStockAsync(id, request.Quantity, cancellationToken)); }
            catch (SqlException exception) when (exception.Number is >= 50000 and <= 59999) { return StoredProcedureProblem(exception); }
        });
    }

    private static void MapMedicalServices(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/medical-services");
        group.MapGet("/", async (int? specialtyId, bool? active, KlinikDbContext db) =>
        {
            var query = db.MedicalServices.AsNoTracking().AsQueryable();
            if (specialtyId.HasValue) query = query.Where(item => item.SpecialtyId == specialtyId);
            if (active.HasValue) query = query.Where(item => item.IsActive == active);
            return await query.OrderBy(item => item.Name).Select(item => new
            {
                item.Id, item.Name, item.Description, item.DurationMinutes, item.Price,
                item.IsActive, item.SpecialtyId, Specialty = item.Specialty!.Name
            }).ToListAsync();
        });
        group.MapPost("/", async (MedicalServiceRequest request, KlinikDbContext db) =>
        {
            var error = await ValidateMedicalServiceAsync(request, db); if (error is not null) return error;
            var item = new MedicalService { Name = request.Name.Trim(), Description = request.Description?.Trim(), DurationMinutes = request.DurationMinutes, Price = request.Price, IsActive = request.IsActive, SpecialtyId = request.SpecialtyId };
            db.MedicalServices.Add(item); await db.SaveChangesAsync();
            return Results.Created($"/api/medical-services/{item.Id}", new { item.Id });
        });
        group.MapPut("/{id:int}", async (int id, MedicalServiceRequest request, KlinikDbContext db) =>
        {
            var item = await db.MedicalServices.FindAsync(id); if (item is null) return Results.NotFound();
            var error = await ValidateMedicalServiceAsync(request, db); if (error is not null) return error;
            item.Name = request.Name.Trim(); item.Description = request.Description?.Trim(); item.DurationMinutes = request.DurationMinutes;
            item.Price = request.Price; item.IsActive = request.IsActive; item.SpecialtyId = request.SpecialtyId;
            await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapDelete("/{id:int}", (int id, KlinikDbContext db) => DeleteAsync(db, db.MedicalServices, id));
        group.MapPut("/{serviceId:int}/doctors/{doctorId:int}", async (int serviceId, int doctorId, KlinikDbContext db) =>
        {
            if (!await db.MedicalServices.AnyAsync(item => item.Id == serviceId) || !await db.Doctors.AnyAsync(item => item.Id == doctorId)) return Results.NotFound();
            if (!await db.DoctorServices.AnyAsync(item => item.MedicalServiceId == serviceId && item.DoctorId == doctorId))
            {
                db.DoctorServices.Add(new DoctorService { MedicalServiceId = serviceId, DoctorId = doctorId });
                await db.SaveChangesAsync();
            }
            return Results.NoContent();
        });
        group.MapDelete("/{serviceId:int}/doctors/{doctorId:int}", async (int serviceId, int doctorId, KlinikDbContext db) =>
        {
            var item = await db.DoctorServices.FindAsync(doctorId, serviceId); if (item is null) return Results.NotFound();
            db.DoctorServices.Remove(item); await db.SaveChangesAsync(); return Results.NoContent();
        });
    }

    private static void MapDoctorSchedules(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/doctor-schedules");
        group.MapGet("/", async (int? doctorId, KlinikDbContext db) =>
        {
            var query = db.DoctorSchedules.AsNoTracking().AsQueryable();
            if (doctorId.HasValue) query = query.Where(item => item.DoctorId == doctorId);
            return await query.OrderBy(item => item.DoctorId).ThenBy(item => item.DayOfWeek).ThenBy(item => item.StartTime)
                .Select(item => new { item.Id, item.DoctorId, Doctor = item.Doctor!.FullName, item.DayOfWeek, item.StartTime, item.EndTime, item.SlotDurationMinutes, item.IsActive }).ToListAsync();
        });
        group.MapPost("/", async (DoctorScheduleRequest request, KlinikDbContext db) =>
        {
            var error = await ValidateScheduleAsync(request, db); if (error is not null) return error;
            var item = new DoctorSchedule { DoctorId = request.DoctorId, DayOfWeek = request.DayOfWeek, StartTime = request.StartTime, EndTime = request.EndTime, SlotDurationMinutes = request.SlotDurationMinutes, IsActive = request.IsActive };
            db.DoctorSchedules.Add(item); await db.SaveChangesAsync();
            return Results.Created($"/api/doctor-schedules/{item.Id}", new { item.Id });
        });
        group.MapPut("/{id:int}", async (int id, DoctorScheduleRequest request, KlinikDbContext db) =>
        {
            var item = await db.DoctorSchedules.FindAsync(id); if (item is null) return Results.NotFound();
            var error = await ValidateScheduleAsync(request, db); if (error is not null) return error;
            item.DoctorId = request.DoctorId; item.DayOfWeek = request.DayOfWeek; item.StartTime = request.StartTime;
            item.EndTime = request.EndTime; item.SlotDurationMinutes = request.SlotDurationMinutes; item.IsActive = request.IsActive;
            await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapDelete("/{id:int}", (int id, KlinikDbContext db) => DeleteAsync(db, db.DoctorSchedules, id));
    }

    private static async Task<IResult?> ValidateDoctorAsync(DoctorRequest request, KlinikDbContext db)
    {
        if (string.IsNullOrWhiteSpace(request.FullName)) return Validation("Il nome del medico è obbligatorio.");
        if (!await db.Specialties.AnyAsync(x => x.Id == request.SpecialtyId)) return Validation("Specialità inesistente.");
        if (!await db.Locations.AnyAsync(x => x.Id == request.LocationId)) return Validation("Sede inesistente.");
        return null;
    }

    private static async Task<IResult?> ValidateAppointmentAsync(AppointmentRequest request, KlinikDbContext db, int? currentId = null)
    {
        if (string.IsNullOrWhiteSpace(request.PatientName) || string.IsNullOrWhiteSpace(request.Phone)) return Validation("Nome e telefono sono obbligatori.");
        if (request.AppointmentDate <= DateTime.Now) return Validation("La data deve essere futura.");
        if (!await db.Doctors.AnyAsync(x => x.Id == request.DoctorId && x.IsAvailable)) return Validation("Medico inesistente o non disponibile.");
        var occupied = await db.Appointments.AnyAsync(x => x.DoctorId == request.DoctorId && x.AppointmentDate == request.AppointmentDate && x.Id != currentId);
        return occupied ? Results.Conflict(new { message = "Questo orario non è più disponibile." }) : null;
    }

    private static IResult? ValidateProduct(ProductRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return Validation("Il nome del prodotto è obbligatorio.");
        if (request.Price < 0 || request.StockQuantity < 0) return Validation("Prezzo e quantità non possono essere negativi.");
        return null;
    }

    private static async Task<IResult?> ValidateMedicalServiceAsync(MedicalServiceRequest request, KlinikDbContext db)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return Validation("Il nome della prestazione è obbligatorio.");
        if (request.DurationMinutes is < 10 or > 480 || request.Price < 0) return Validation("Durata o prezzo non validi.");
        return await db.Specialties.AnyAsync(item => item.Id == request.SpecialtyId) ? null : Validation("Specialità inesistente.");
    }

    private static async Task<IResult?> ValidateScheduleAsync(DoctorScheduleRequest request, KlinikDbContext db)
    {
        if (request.StartTime >= request.EndTime) return Validation("L'orario di fine deve essere successivo a quello iniziale.");
        if (request.SlotDurationMinutes is < 10 or > 240) return Validation("La durata dello slot deve essere compresa tra 10 e 240 minuti.");
        return await db.Doctors.AnyAsync(item => item.Id == request.DoctorId) ? null : Validation("Medico inesistente.");
    }

    private static PharmacyProduct ToProduct(ProductRequest request) => new()
    {
        Name = request.Name.Trim(), Category = request.Category.Trim(), Price = request.Price,
        StockQuantity = request.StockQuantity, IsActive = request.IsActive, Description = request.Description?.Trim()
    };

    private static IResult Validation(string message) => Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = [message] });

    private static IResult StoredProcedureProblem(SqlException exception) =>
        Results.Problem(title: "Operazione rifiutata dal database", detail: exception.Message, statusCode: StatusCodes.Status409Conflict);

    private static async Task<IResult> DeleteAsync<TEntity>(KlinikDbContext db, DbSet<TEntity> set, int id) where TEntity : class
    {
        var item = await set.FindAsync(id); if (item is null) return Results.NotFound();
        set.Remove(item);
        try { await db.SaveChangesAsync(); return Results.NoContent(); }
        catch (DbUpdateException) { return Results.Conflict(new { message = "Il record è usato da altri dati e non può essere eliminato." }); }
    }
}
