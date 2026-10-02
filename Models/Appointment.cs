using System.ComponentModel.DataAnnotations;

namespace ClinicaAurora.Models;

public sealed class Appointment
{
    public int Id { get; set; }

    [Required, MaxLength(120)]
    public string PatientName { get; set; } = string.Empty;

    [Required, MaxLength(30)]
    public string Phone { get; set; } = string.Empty;

    [EmailAddress, MaxLength(150)]
    public string? Email { get; set; }

    public DateTime AppointmentDate { get; set; }

    [Required, MaxLength(30)]
    public string Status { get; set; } = "In attesa";

    [MaxLength(1000)]
    public string? Notes { get; set; }

    public int DoctorId { get; set; }
    public Doctor? Doctor { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
