using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ClinicaAurora.Models;

public sealed class PharmacyProduct
{
    public int Id { get; set; }

    [Required, MaxLength(140)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(80)]
    public string Category { get; set; } = string.Empty;

    [Column(TypeName = "decimal(10,2)")]
    public decimal Price { get; set; }

    public int StockQuantity { get; set; }
    public bool IsActive { get; set; } = true;

    [MaxLength(1000)]
    public string? Description { get; set; }
}
