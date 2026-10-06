using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClinicaAurora.Models;

public sealed class MedicalService
{
    public int Id { get; set; }

    [Required, MaxLength(140)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public int DurationMinutes { get; set; }

    [Column(TypeName = "decimal(10,2)")]
    public decimal Price { get; set; }

    public bool IsActive { get; set; } = true;
    public int SpecialtyId { get; set; }
    public Specialty? Specialty { get; set; }
    public ICollection<DoctorService> DoctorServices { get; set; } = [];
}
