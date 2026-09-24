using System.ComponentModel.DataAnnotations;

namespace ClinicaAurora.Models;

public sealed class Specialty
{
    public int Id { get; set; }

    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public ICollection<Doctor> Doctors { get; set; } = [];
}
