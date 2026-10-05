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
public sealed class ClinicStoredProcedures(KlinikDbContext db)
{
    public async Task<List<DoctorResult>> SearchDoctorsAsync(int? specialtyId, int? locationId, bool onlyAvailable, CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_Doctor_Search", cancellationToken);
        AddParameter(command, "@SpecialtyId", DbType.Int32, specialtyId);
        AddParameter(command, "@LocationId", DbType.Int32, locationId);
        AddParameter(command, "@OnlyAvailable", DbType.Boolean, onlyAvailable);

        var results = new List<DoctorResult>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(new DoctorResult(
                reader.GetInt32(reader.GetOrdinal("Id")),
                reader.GetString(reader.GetOrdinal("FullName")),
                GetNullableString(reader, "Biography"),
                reader.GetBoolean(reader.GetOrdinal("IsAvailable")),
                reader.GetInt32(reader.GetOrdinal("SpecialtyId")),
                reader.GetString(reader.GetOrdinal("Specialty")),
                reader.GetInt32(reader.GetOrdinal("LocationId")),
                reader.GetString(reader.GetOrdinal("Location"))));
        }
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
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(new AppointmentResult(
                reader.GetInt32(reader.GetOrdinal("Id")),
                reader.GetString(reader.GetOrdinal("PatientName")),
                reader.GetString(reader.GetOrdinal("Phone")),
                GetNullableString(reader, "Email"),
                reader.GetDateTime(reader.GetOrdinal("AppointmentDate")),
                reader.GetString(reader.GetOrdinal("Status")),
                GetNullableString(reader, "Notes"),
                reader.GetInt32(reader.GetOrdinal("DoctorId")),
                reader.GetString(reader.GetOrdinal("Doctor")),
                reader.GetString(reader.GetOrdinal("Specialty")),
                HasColumn(reader, "Location") ? GetNullableString(reader, "Location") : null,
                reader.GetDateTime(reader.GetOrdinal("CreatedAt"))));
        }
        return results;
    }

    public async Task<AppointmentCreatedResult> CreateAppointmentAsync(AppointmentRequest request, CancellationToken cancellationToken)
    {
        await using var command = await CreateCommandAsync("dbo.usp_Appointment_Create", cancellationToken);
        AddParameter(command, "@PatientName", DbType.String, request.PatientName, 120);
        AddParameter(command, "@Phone", DbType.String, request.Phone, 30);
        AddParameter(command, "@Email", DbType.String, request.Email, 150);
        AddParameter(command, "@AppointmentDate", DbType.DateTime2, request.AppointmentDate);
        AddParameter(command, "@DoctorId", DbType.Int32, request.DoctorId);
        AddParameter(command, "@Notes", DbType.String, request.Notes, 1000);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) throw new InvalidOperationException("La procedura non ha restituito la prenotazione creata.");
        return new AppointmentCreatedResult(reader.GetInt32(reader.GetOrdinal("Id")), reader.GetString(reader.GetOrdinal("Status")));
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
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(new ProductResult(
                reader.GetInt32(reader.GetOrdinal("Id")),
                reader.GetString(reader.GetOrdinal("Name")),
                reader.GetString(reader.GetOrdinal("Category")),
                reader.GetDecimal(reader.GetOrdinal("Price")),
                reader.GetInt32(reader.GetOrdinal("StockQuantity")),
                GetNullableString(reader, "Description")));
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
        if (connection.State != ConnectionState.Open) await connection.OpenAsync(cancellationToken);
        var command = connection.CreateCommand();
        command.CommandText = name;
        command.CommandType = CommandType.StoredProcedure;
        command.CommandTimeout = 30;
        return command;
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

    private static string? GetNullableString(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    private static bool HasColumn(DbDataReader reader, string name)
    {
        for (var index = 0; index < reader.FieldCount; index++)
            if (string.Equals(reader.GetName(index), name, StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }
}
