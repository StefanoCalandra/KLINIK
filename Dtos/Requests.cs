using System.ComponentModel.DataAnnotations;

namespace ClinicaAurora.Dtos;

public sealed record SpecialtyRequest(
    [property: Required, StringLength(100)] string Name,
    [property: StringLength(500)] string? Description);
public sealed record LocationRequest(
    [property: Required, StringLength(120)] string Name,
    [property: StringLength(200)] string? Address,
    [property: StringLength(80)] string? City);
public sealed record DoctorRequest(
    [property: Required, StringLength(120)] string FullName,
    [property: StringLength(1000)] string? Biography, bool IsAvailable,
    [property: Range(1, int.MaxValue)] int SpecialtyId,
    [property: Range(1, int.MaxValue)] int LocationId);
public sealed record AppointmentRequest(
    [property: Required, StringLength(120)] string PatientName,
    [property: Required, StringLength(30)] string Phone,
    [property: EmailAddress, StringLength(150)] string? Email,
    DateTimeOffset AppointmentDate,
    [property: RegularExpression("In attesa|Confermata|Completata|Annullata|Assente")] string? Status,
    [property: StringLength(1000)] string? Notes,
    [property: Range(1, int.MaxValue)] int DoctorId);
public sealed record ProductRequest(
    [property: Required, StringLength(140)] string Name,
    [property: Required, StringLength(80)] string Category,
    [property: Range(typeof(decimal), "0", "99999999.99")] decimal Price,
    [property: Range(0, int.MaxValue)] int StockQuantity, bool IsActive,
    [property: StringLength(1000)] string? Description);
public sealed record AppointmentStatusRequest(
    [property: Required, RegularExpression("In attesa|Confermata|Completata|Annullata|Assente")] string Status);
public sealed record StockRequest([property: Range(1, int.MaxValue)] int Quantity);
public sealed record MedicalServiceRequest(
    [property: Required, StringLength(140)] string Name,
    [property: StringLength(1000)] string? Description,
    [property: Range(10, 480)] int DurationMinutes,
    [property: Range(typeof(decimal), "0", "99999999.99")] decimal Price,
    bool IsActive, [property: Range(1, int.MaxValue)] int SpecialtyId);
public sealed record DoctorScheduleRequest(
    [property: Range(1, int.MaxValue)] int DoctorId,
    [property: EnumDataType(typeof(DayOfWeek))] DayOfWeek DayOfWeek,
    TimeOnly StartTime, TimeOnly EndTime,
    [property: Range(10, 240)] int SlotDurationMinutes, bool IsActive);
