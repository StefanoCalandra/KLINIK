namespace ClinicaAurora.Dtos;

public sealed record DoctorResult(
    int Id,
    string FullName,
    string? Biography,
    bool IsAvailable,
    int SpecialtyId,
    string Specialty,
    int LocationId,
    string Location);

public sealed record AppointmentResult(
    int Id,
    string PatientName,
    string Phone,
    string? Email,
    DateTime AppointmentDate,
    string Status,
    string? Notes,
    int DoctorId,
    string Doctor,
    string Specialty,
    string? Location,
    DateTime CreatedAt);

public sealed record ProductResult(
    int Id,
    string Name,
    string Category,
    decimal Price,
    int StockQuantity,
    string? Description);

public sealed record AppointmentCreatedResult(int Id, string Status);
public sealed record StockResult(int Id, int StockQuantity);
