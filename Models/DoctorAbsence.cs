namespace ClinicaAurora.Models;

public sealed class DoctorAbsence
{
    public int Id { get; set; }
    public int DoctorId { get; set; }
    public Doctor? Doctor { get; set; }
    public DateTime StartsAt { get; set; }
    public DateTime EndsAt { get; set; }
}
