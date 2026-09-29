using ClinicaAurora.Models;
using Microsoft.EntityFrameworkCore;

namespace ClinicaAurora.Data;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(KlinikDbContext db)
    {
        // Crea KlinikDb su SQL Server al primo avvio. Per evoluzioni successive
        // di uno schema in produzione è preferibile usare le migration EF Core.
        await db.Database.EnsureCreatedAsync();

        if (await db.Specialties.AnyAsync()) return;

        var cardiology = new Specialty { Name = "Cardiologia", Description = "Prevenzione e cura cardiovascolare" };
        var dermatology = new Specialty { Name = "Dermatologia", Description = "Salute della pelle" };
        var pediatrics = new Specialty { Name = "Pediatria", Description = "Cura dei bambini e adolescenti" };
        var general = new Specialty { Name = "Medicina generale", Description = "Visite e prevenzione" };
        var center = new Location { Name = "Milano, Centro", Address = "Via della Salute 12", City = "Milano" };
        var navigli = new Location { Name = "Milano, Navigli", Address = "Alzaia Naviglio 24", City = "Milano" };
        var online = new Location { Name = "Online", City = "Telemedicina" };

        db.AddRange(cardiology, dermatology, pediatrics, general, center, navigli, online);
        await db.SaveChangesAsync();

        db.Doctors.AddRange(
            new Doctor { FullName = "Dott.ssa Laura Ferri", SpecialtyId = cardiology.Id, LocationId = center.Id, Biography = "Specialista in cardiologia clinica." },
            new Doctor { FullName = "Dott. Marco Riva", SpecialtyId = dermatology.Id, LocationId = navigli.Id, Biography = "Specialista in dermatologia e prevenzione." },
            new Doctor { FullName = "Dott.ssa Sara Bianchi", SpecialtyId = pediatrics.Id, LocationId = center.Id, Biography = "Specialista in pediatria." });

        db.PharmacyProducts.AddRange(
            new PharmacyProduct { Name = "Vitamina D3", Category = "Integratori", Price = 14.90m, StockQuantity = 30, Description = "Integratore alimentare di vitamina D3." },
            new PharmacyProduct { Name = "Magnesio", Category = "Integratori", Price = 11.50m, StockQuantity = 24, Description = "Supporto per energia e funzione muscolare." },
            new PharmacyProduct { Name = "Crema corpo", Category = "Dermocosmesi", Price = 18.00m, StockQuantity = 18, Description = "Crema corpo idratante." });

        await db.SaveChangesAsync();
    }
}
