using System.ComponentModel.DataAnnotations;
namespace ClinicaAurora.Models;

public sealed class AdminAccount
{
    public int Id { get; set; } = 1;
    [MaxLength(80)] public string Username { get; set; } = "admin";
    [MaxLength(512)] public string PasswordHash { get; set; } = "";
    [MaxLength(36)] public string SecurityStamp { get; set; } = Guid.NewGuid().ToString();
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
}
