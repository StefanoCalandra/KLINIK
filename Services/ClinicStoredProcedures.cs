using System.Data;
using System.Data.Common;
using ClinicaAurora.Data;
using ClinicaAurora.Dtos;
using Microsoft.EntityFrameworkCore;

namespace ClinicaAurora.Services;

/// <summary>
/// Unico punto di accesso alle stored procedure installate in KlinikDb.
/// DbCommand mantiene i valori parametrizzati e impedisce SQL injection.
/// </summary>
public sealed class ClinicStoredProcedures(KlinikDbContext db) : IAsyncDisposable
{
    private bool ownsOpenConnection;
    public async Task<List<DoctorResult>> SearchDoctorsAsync(int? specialtyId, int? locationId, bool onlyAvailable, CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_Doctor_Search", cancellationToken);
        AddParameter(command, "@SpecialtyId", DbType.Int32, specialtyId);
        AddParameter(command, "@LocationId", DbType.Int32, locationId);
        AddParameter(command, "@OnlyAvailable", DbType.Boolean, onlyAvailable);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await ReadDoctorsAsync(reader, cancellationToken);
    }

    public async Task<ReferenceDataResult> GetReferenceDataAsync(CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_ReferenceData_Get", cancellationToken);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var specialties = await ReadReferenceItemsAsync(reader, cancellationToken);
        await reader.NextResultAsync(cancellationToken);
        var locations = await ReadReferenceItemsAsync(reader, cancellationToken);
        await reader.NextResultAsync(cancellationToken);
        return new ReferenceDataResult(specialties, locations, await ReadDoctorsAsync(reader, cancellationToken));
    }

    private static async Task<List<ReferenceItem>> ReadReferenceItemsAsync(DbDataReader reader, CancellationToken cancellationToken)
    {
        var results = new List<ReferenceItem>();
        while (await reader.ReadAsync(cancellationToken)) results.Add(new ReferenceItem(reader.GetInt32(0), reader.GetString(1)));
        return results;
    }

    private static async Task<List<DoctorResult>> ReadDoctorsAsync(DbDataReader reader, CancellationToken cancellationToken)
    {
        var results = new List<DoctorResult>();
        var id = reader.GetOrdinal("Id");
        var name = reader.GetOrdinal("FullName");
        var biography = reader.GetOrdinal("Biography");
        var available = reader.GetOrdinal("IsAvailable");
        var specialtyId = reader.GetOrdinal("SpecialtyId");
        var specialty = reader.GetOrdinal("Specialty");
        var locationId = reader.GetOrdinal("LocationId");
        var location = reader.GetOrdinal("Location");
        while (await reader.ReadAsync(cancellationToken))
            results.Add(new DoctorResult(reader.GetInt32(id), reader.GetString(name), GetNullableString(reader, biography),
                reader.GetBoolean(available), reader.GetInt32(specialtyId), reader.GetString(specialty),
                reader.GetInt32(locationId), reader.GetString(location)));
        return results;
    }

    public async Task<List<AppointmentResult>> GetAppointmentsAsync(DateTime from, DateTime to, int? doctorId, string? status, CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_Appointment_GetRange", cancellationToken);
        AddParameter(command, "@From", DbType.DateTime2, from);
        AddParameter(command, "@To", DbType.DateTime2, to);
        AddParameter(command, "@DoctorId", DbType.Int32, doctorId);
        AddParameter(command, "@Status", DbType.String, status, 30);

        var results = new List<AppointmentResult>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var colId = reader.GetOrdinal("Id");
        var colPatientName = reader.GetOrdinal("PatientName");
        var colPhone = reader.GetOrdinal("Phone");
        var colEmail = reader.GetOrdinal("Email");
        var colAppointmentDate = reader.GetOrdinal("AppointmentDate");
        var colStatus = reader.GetOrdinal("Status");
        var colNotes = reader.GetOrdinal("Notes");
        var colDurationMinutes = reader.GetOrdinal("DurationMinutes");
        var colMedicalServiceId = reader.GetOrdinal("MedicalServiceId");
        var colDoctorId = reader.GetOrdinal("DoctorId");
        var colDoctor = reader.GetOrdinal("Doctor");
        var colSpecialty = reader.GetOrdinal("Specialty");
        var colLocation = reader.GetOrdinal("Location");
        var colCreatedAt = reader.GetOrdinal("CreatedAt");
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(new AppointmentResult(
                reader.GetInt32(colId),
                reader.GetString(colPatientName),
                reader.GetString(colPhone),
                GetNullableString(reader, colEmail),
                DateTime.SpecifyKind(reader.GetDateTime(colAppointmentDate), DateTimeKind.Utc),
                reader.GetString(colStatus),
                GetNullableString(reader, colNotes),
                reader.GetInt32(colDurationMinutes),
                reader.IsDBNull(colMedicalServiceId) ? null : reader.GetInt32(colMedicalServiceId),
                reader.GetInt32(colDoctorId),
                reader.GetString(colDoctor),
                reader.GetString(colSpecialty),
                GetNullableString(reader, colLocation),
                DateTime.SpecifyKind(reader.GetDateTime(colCreatedAt), DateTimeKind.Utc)));
        }
        return results;
    }

    public async Task<AppointmentCreatedResult> SaveAppointmentAsync(AppointmentRequest request, CancellationToken cancellationToken, int? appointmentId = null)
    {
        await using var command = await CreateCommandAsync("dbo.usp_Appointment_Save", cancellationToken);
        AddParameter(command, "@PatientName", DbType.String, request.PatientName, 120);
        AddParameter(command, "@Phone", DbType.String, request.Phone, 30);
        AddParameter(command, "@Email", DbType.String, request.Email, 150);
        AddParameter(command, "@AppointmentDate", DbType.DateTime2, request.AppointmentDate.UtcDateTime);
        AddParameter(command, "@DoctorId", DbType.Int32, request.DoctorId);
        AddParameter(command, "@Notes", DbType.String, request.Notes, 1000);
        AddParameter(command, "@MedicalServiceId", DbType.Int32, request.MedicalServiceId);
        AddParameter(command, "@AppointmentId", DbType.Int32, appointmentId);
        // La creazione pubblica avvia sempre una richiesta in attesa.
        AddParameter(command, "@Status", DbType.String, appointmentId.HasValue ? request.Status : null, 30);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) throw new InvalidOperationException("La procedura non ha restituito la prenotazione creata.");
        return new AppointmentCreatedResult(reader.GetInt32(reader.GetOrdinal("Id")), reader.GetString(reader.GetOrdinal("Status")));
    }

    public async Task<List<SlotResult>> GetSlotsAsync(int doctorId, DateOnly date, int? medicalServiceId, CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_Doctor_GetSlots", cancellationToken);
        AddParameter(command, "@DoctorId", DbType.Int32, doctorId);
        AddParameter(command, "@Date", DbType.Date, date.ToDateTime(TimeOnly.MinValue));
        AddParameter(command, "@MedicalServiceId", DbType.Int32, medicalServiceId);
        var results = new List<SlotResult>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            results.Add(new SlotResult(DateTime.SpecifyKind(reader.GetDateTime(0), DateTimeKind.Utc),
                DateTime.SpecifyKind(reader.GetDateTime(1), DateTimeKind.Utc), reader.GetInt32(2)));
        return results;
    }

    public async Task<int> CreateAbsenceAsync(DoctorAbsenceRequest request, CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_DoctorAbsence_Create", cancellationToken);
        AddParameter(command, "@DoctorId", DbType.Int32, request.DoctorId);
        AddParameter(command, "@StartsAt", DbType.DateTime2, request.StartsAt.UtcDateTime);
        AddParameter(command, "@EndsAt", DbType.DateTime2, request.EndsAt.UtcDateTime);
        return Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
    }

    public async Task CancelAppointmentAsync(int appointmentId, CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_Appointment_Cancel", cancellationToken);
        AddParameter(command, "@AppointmentId", DbType.Int32, appointmentId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task SetAppointmentStatusAsync(int appointmentId, string status, CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_Appointment_SetStatus", cancellationToken);
        AddParameter(command, "@AppointmentId", DbType.Int32, appointmentId);
        AddParameter(command, "@Status", DbType.String, status, 30);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<List<ProductResult>> GetAvailableProductsAsync(string? category, string? search, CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_Product_GetAvailable", cancellationToken);
        AddParameter(command, "@Category", DbType.String, category, 80);
        AddParameter(command, "@Search", DbType.String, search, 140);
        var results = new List<ProductResult>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var colId = reader.GetOrdinal("Id");
        var colName = reader.GetOrdinal("Name");
        var colCategory = reader.GetOrdinal("Category");
        var colPrice = reader.GetOrdinal("Price");
        var colStockQuantity = reader.GetOrdinal("StockQuantity");
        var colDescription = reader.GetOrdinal("Description");
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(new ProductResult(
                reader.GetInt32(colId),
                reader.GetString(colName),
                reader.GetString(colCategory),
                reader.GetDecimal(colPrice),
                reader.GetInt32(colStockQuantity),
                GetNullableString(reader, colDescription)));
        }
        return results;
    }

    public async Task<StockResult> DecreaseStockAsync(int productId, int quantity, CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_Product_DecreaseStock", cancellationToken);
        AddParameter(command, "@ProductId", DbType.Int32, productId);
        AddParameter(command, "@Quantity", DbType.Int32, quantity);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) throw new InvalidOperationException("La procedura non ha restituito la giacenza aggiornata.");
        return new StockResult(reader.GetInt32(reader.GetOrdinal("Id")), reader.GetInt32(reader.GetOrdinal("StockQuantity")));
    }

    private async Task<DbCommand> CreateCommandAsync(string name, CancellationToken cancellationToken)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await db.Database.OpenConnectionAsync(cancellationToken);
            ownsOpenConnection = true;
        }
        var command = connection.CreateCommand();
        command.CommandText = name;
        command.CommandType = CommandType.StoredProcedure;
        command.CommandTimeout = 30;
        return command;
    }

    // Ripristina lo stato del driver prima di restituire il DbContext al pool.
    public async ValueTask DisposeAsync()
    {
        if (ownsOpenConnection)
        {
            await db.Database.CloseConnectionAsync();
            ownsOpenConnection = false;
        }
    }

    private static void AddParameter(DbCommand command, string name, DbType type, object? value, int? size = null)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = type;
        parameter.Value = value ?? DBNull.Value;
        if (size.HasValue) parameter.Size = size.Value;
        command.Parameters.Add(parameter);
    }

    private static string? GetNullableString(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
}
