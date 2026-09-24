namespace ClinicaAurora.Dtos;

public sealed record SpecialtyRequest(string Name, string? Description);
public sealed record LocationRequest(string Name, string? Address, string? City);
public sealed record DoctorRequest(string FullName, string? Biography, bool IsAvailable, int SpecialtyId, int LocationId);
public sealed record AppointmentRequest(string PatientName, string Phone, string? Email, DateTime AppointmentDate, string? Status, string? Notes, int DoctorId);
public sealed record ProductRequest(string Name, string Category, decimal Price, int StockQuantity, bool IsActive, string? Description);
