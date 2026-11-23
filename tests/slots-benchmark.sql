/* SOLO DATABASE DI SVILUPPO: crea 100.000 prenotazioni sintetiche in una
   transazione e annulla tutti i record al termine. Può bloccare altre richieste
   mentre è in esecuzione. Eseguire da SSMS o sqlcmd -b nel database inizializzato.
   Confrontare risultati e letture logiche, oltre al tempo dipendente dalla macchina. */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
BEGIN TRY
DECLARE @Specialty int=(SELECT MIN(Id) FROM dbo.Specialties);
DECLARE @Location int=(SELECT MIN(Id) FROM dbo.Locations);
IF @Specialty IS NULL OR @Location IS NULL THROW 51000, 'Inizializzare il database di sviluppo prima del benchmark.', 1;
INSERT dbo.Doctors(FullName,IsAvailable,SpecialtyId,LocationId) VALUES(N'Performance fixture',1,@Specialty,@Location);
DECLARE @Doctor int=CONVERT(int,SCOPE_IDENTITY());
INSERT dbo.DoctorSchedules(DoctorId,DayOfWeek,StartTime,EndTime,SlotDurationMinutes,IsActive)
VALUES(@Doctor,1,'09:00','13:00',30,1);
WITH n AS (
 SELECT TOP (100000) ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS n
 FROM sys.all_objects a CROSS JOIN sys.all_objects b
)
INSERT dbo.Appointments(PatientName,Phone,AppointmentDate,Status,DoctorId,CreatedAt,DurationMinutes)
SELECT N'Performance fixture',N'000',DATEADD(minute,CONVERT(int,n)*30,CONVERT(datetime2,'20100101')),
N'Confermata',@Doctor,'20090101',30 FROM n;
DECLARE @Date date=CONVERT(date,DATEADD(day,7,SYSUTCDATETIME()));
WHILE (DATEDIFF(day,CONVERT(date,'19000107'),@Date)%7)<>1 SET @Date=DATEADD(day,1,@Date);
-- Primo giro per compilazione e cache; poi misurazione dello stesso carico.
SELECT COUNT(*) AS Slots FROM dbo.ufn_DoctorSlots(@Doctor,@Date,NULL,NULL,NULL);
SET STATISTICS IO ON;
SET STATISTICS TIME ON;
DECLARE @Start datetime2=SYSUTCDATETIME(), @i int=0, @Slots int;
WHILE @i<10
BEGIN
 SELECT @Slots=COUNT(*) FROM dbo.ufn_DoctorSlots(@Doctor,@Date,NULL,NULL,NULL);
 SET @i+=1;
END;
SELECT DATEDIFF(millisecond,@Start,SYSUTCDATETIME()) AS ElapsedMs, @Slots AS Slots, 100000 AS HistoricalRows;
SET STATISTICS IO OFF;
SET STATISTICS TIME OFF;
ROLLBACK;
END TRY
BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK;
    THROW;
END CATCH;
