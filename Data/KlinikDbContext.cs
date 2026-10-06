using ClinicaAurora.Models;
using Microsoft.EntityFrameworkCore;

namespace ClinicaAurora.Data;

public sealed class KlinikDbContext(DbContextOptions<KlinikDbContext> options) : DbContext(options)
{
    public DbSet<Specialty> Specialties => Set<Specialty>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Doctor> Doctors => Set<Doctor>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<PharmacyProduct> PharmacyProducts => Set<PharmacyProduct>();
    public DbSet<MedicalService> MedicalServices => Set<MedicalService>();
    public DbSet<DoctorService> DoctorServices => Set<DoctorService>();
    public DbSet<DoctorSchedule> DoctorSchedules => Set<DoctorSchedule>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Specialty>().HasIndex(item => item.Name).IsUnique();
        modelBuilder.Entity<Location>().HasIndex(item => item.Name).IsUnique();
        modelBuilder.Entity<Doctor>()
            .HasOne(item => item.Specialty)
            .WithMany(item => item.Doctors)
            .HasForeignKey(item => item.SpecialtyId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Doctor>()
            .HasOne(item => item.Location)
            .WithMany(item => item.Doctors)
            .HasForeignKey(item => item.LocationId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Appointment>()
            .HasOne(item => item.Doctor)
            .WithMany(item => item.Appointments)
            .HasForeignKey(item => item.DoctorId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Appointment>()
            .HasIndex(item => new { item.DoctorId, item.AppointmentDate })
            .IsUnique();
        modelBuilder.Entity<MedicalService>()
            .HasOne(item => item.Specialty)
            .WithMany(item => item.MedicalServices)
            .HasForeignKey(item => item.SpecialtyId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<DoctorService>().HasKey(item => new { item.DoctorId, item.MedicalServiceId });
        modelBuilder.Entity<DoctorService>()
            .HasOne(item => item.Doctor)
            .WithMany(item => item.DoctorServices)
            .HasForeignKey(item => item.DoctorId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<DoctorService>()
            .HasOne(item => item.MedicalService)
            .WithMany(item => item.DoctorServices)
            .HasForeignKey(item => item.MedicalServiceId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<DoctorSchedule>()
            .HasOne(item => item.Doctor)
            .WithMany(item => item.Schedules)
            .HasForeignKey(item => item.DoctorId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<DoctorSchedule>()
            .HasIndex(item => new { item.DoctorId, item.DayOfWeek, item.StartTime })
            .IsUnique();
    }
}
