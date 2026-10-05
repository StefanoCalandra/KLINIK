namespace ClinicaAurora.Models;

public sealed class DoctorService
{
    public int DoctorId { get; set; }
    public Doctor? Doctor { get; set; }
    public int MedicalServiceId { get; set; }
    public MedicalService? MedicalService { get; set; }
}
