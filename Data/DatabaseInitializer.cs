using ClinicaAurora.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;
using System.Security.Cryptography;

namespace ClinicaAurora.Data;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(KlinikDbContext db, bool reapplyScripts = false)
    {
        // Crea KlinikDb su SQL Server al primo avvio. Per evoluzioni successive
        // di uno schema in produzione è preferibile usare le migration EF Core.
        await db.Database.EnsureCreatedAsync();

        if (!await db.Specialties.AnyAsync())
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
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
            await transaction.CommitAsync();
        }

        await ApplySqlScriptsAsync(db, reapplyScripts);
        await ClinicaAurora.Services.AdminSecurity.EnsureAccountAsync(db);
    }

    private static async Task ApplySqlScriptsAsync(KlinikDbContext db, bool reapplyScripts)
    {
        // Leggere e validare tutti i file prima di aprire la transazione SQL.
        var scripts = new List<(string Name, string Text, string Hash)>();
        foreach (var name in new[] { "expansion.sql", "calendar-schema.sql", "admin-schema.sql", "stored-procedures.sql" })
        {
            var path = Path.Combine(AppContext.BaseDirectory, "database", name);
            var text = await File.ReadAllTextAsync(path);
            scripts.Add((name, text, Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(text)))));
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        // Due avvii simultanei non devono applicare la stessa versione in parallelo.
        await db.Database.ExecuteSqlRawAsync("""
            DECLARE @result int;
            EXEC @result=sys.sp_getapplock @Resource=N'KLINIK:SchemaScripts',
                @LockMode=N'Exclusive', @LockOwner=N'Transaction', @LockTimeout=15000;
            IF @result<0 THROW 50040, 'Impossibile acquisire il lock degli aggiornamenti SQL.', 1;
            IF OBJECT_ID(N'dbo.KlinikScriptVersions',N'U') IS NULL
                CREATE TABLE dbo.KlinikScriptVersions (
                    ScriptName nvarchar(128) NOT NULL PRIMARY KEY,
                    ScriptHash nvarchar(64) NOT NULL,
                    AppliedAt datetime2 NOT NULL
                );
            """);
        var applyFollowing = reapplyScripts;
        foreach (var script in scripts)
        {
            var installedHash = await db.Database.SqlQueryRaw<string>(
                "SELECT ScriptHash AS [Value] FROM dbo.KlinikScriptVersions WHERE ScriptName={0}", script.Name)
                .SingleOrDefaultAsync();
            // Ripara procedure eliminate manualmente anche a file invariati.
            var missingObjects = script.Name == "stored-procedures.sql" && await db.Database.SqlQueryRaw<int>("""
                SELECT COUNT(*) AS [Value] FROM (VALUES
                    (N'dbo.usp_ReferenceData_Get'), (N'dbo.usp_Doctor_Search'),
                    (N'dbo.usp_Doctor_GetSlots'), (N'dbo.usp_Doctor_GetNextSlot'),
                    (N'dbo.usp_Appointment_Save'), (N'dbo.usp_Appointment_Create'),
                    (N'dbo.usp_Appointment_GetRange'), (N'dbo.usp_Appointment_Cancel'),
                    (N'dbo.usp_Appointment_SetStatus'), (N'dbo.usp_DoctorAbsence_Create'),
                    (N'dbo.usp_Product_GetAvailable'), (N'dbo.usp_Product_DecreaseStock'),
                    (N'dbo.ufn_DoctorSlots')) required(Name)
                WHERE OBJECT_ID(required.Name) IS NULL
                """).SingleAsync() > 0;
            applyFollowing |= installedHash != script.Hash || missingObjects;
            if (!applyFollowing) continue;

            foreach (var batch in Regex.Split(script.Text, @"^\s*GO\s*(?:--.*)?$", RegexOptions.Multiline | RegexOptions.IgnoreCase)
                .Where(value => !string.IsNullOrWhiteSpace(value)))
                await db.Database.ExecuteSqlRawAsync(batch);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE dbo.KlinikScriptVersions SET ScriptHash={script.Hash},AppliedAt=SYSUTCDATETIME()
                    WHERE ScriptName={script.Name};
                IF @@ROWCOUNT=0 INSERT dbo.KlinikScriptVersions(ScriptName,ScriptHash,AppliedAt)
                    VALUES({script.Name},{script.Hash},SYSUTCDATETIME());
                """);
        }
        await transaction.CommitAsync();
    }
}
