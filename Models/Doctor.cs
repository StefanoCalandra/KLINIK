using System.ComponentModel.DataAnnotations;

namespace ClinicaAurora.Models;

public sealed class Doctor
{
    public int Id { get; set; }

    [Required, MaxLength(120)]
    public string FullName { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Biography { get; set; }

    public bool IsAvailable { get; set; } = true;
    public int SpecialtyId { get; set; }
    public Specialty? Specialty { get; set; }
    public int LocationId { get; set; }
    public Location? Location { get; set; }
    public ICollection<Appointment> Appointments { get; set; } = [];
}
