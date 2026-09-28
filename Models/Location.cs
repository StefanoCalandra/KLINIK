using System.ComponentModel.DataAnnotations;

namespace ClinicaAurora.Models;

public sealed class Location
{
    public int Id { get; set; }

    [Required, MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? Address { get; set; }

    [MaxLength(80)]
    public string? City { get; set; }

    public ICollection<Doctor> Doctors { get; set; } = [];
}
