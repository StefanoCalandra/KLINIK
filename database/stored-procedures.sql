SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

/* Procedure richieste dal backend KLINIK.
   Eseguire nel database desiderato dopo schema.sql. */

CREATE OR ALTER PROCEDURE dbo.usp_Doctor_Search
    @SpecialtyId int = NULL,
    @LocationId int = NULL,
    @OnlyAvailable bit = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT d.Id, d.FullName, d.Biography, d.IsAvailable, d.SpecialtyId,
           s.Name AS Specialty, d.LocationId, l.Name AS Location
    FROM dbo.Doctors d
    INNER JOIN dbo.Specialties s ON s.Id = d.SpecialtyId
    INNER JOIN dbo.Locations l ON l.Id = d.LocationId
    WHERE (@SpecialtyId IS NULL OR d.SpecialtyId = @SpecialtyId)
      AND (@LocationId IS NULL OR d.LocationId = @LocationId)
      AND (@OnlyAvailable = 0 OR d.IsAvailable = 1)
    ORDER BY d.FullName;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Appointment_GetRange
    @From datetime2,
    @To datetime2,
    @DoctorId int = NULL,
    @Status nvarchar(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @From >= @To THROW 50010, 'L''intervallo temporale non è valido.', 1;

    SELECT a.Id, a.PatientName, a.Phone, a.Email, a.AppointmentDate, a.Status,
           a.Notes, a.DoctorId, d.FullName AS Doctor, s.Name AS Specialty,
           l.Name AS Location, a.CreatedAt
    FROM dbo.Appointments a
    INNER JOIN dbo.Doctors d ON d.Id = a.DoctorId
    INNER JOIN dbo.Specialties s ON s.Id = d.SpecialtyId
    INNER JOIN dbo.Locations l ON l.Id = d.LocationId
    WHERE a.AppointmentDate >= @From AND a.AppointmentDate < @To
      AND (@DoctorId IS NULL OR a.DoctorId = @DoctorId)
      AND (@Status IS NULL OR a.Status = @Status)
    ORDER BY a.AppointmentDate, d.FullName;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Appointment_Create
    @PatientName nvarchar(120),
    @Phone nvarchar(30),
    @Email nvarchar(150) = NULL,
    @AppointmentDate datetime2,
    @DoctorId int,
    @Notes nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF NULLIF(TRIM(@PatientName), N'') IS NULL THROW 50001, 'Il nome del paziente è obbligatorio.', 1;
    IF NULLIF(TRIM(@Phone), N'') IS NULL THROW 50002, 'Il telefono è obbligatorio.', 1;
    IF @AppointmentDate <= SYSUTCDATETIME() THROW 50003, 'La data deve essere futura.', 1;

    BEGIN TRANSACTION;
    IF NOT EXISTS (SELECT 1 FROM dbo.Doctors WITH (UPDLOCK, HOLDLOCK) WHERE Id=@DoctorId AND IsAvailable=1)
    BEGIN
        ROLLBACK; THROW 50004, 'Il medico non esiste o non è disponibile.', 1;
    END;
    IF EXISTS (SELECT 1 FROM dbo.Appointments WITH (UPDLOCK, HOLDLOCK) WHERE DoctorId=@DoctorId AND AppointmentDate=@AppointmentDate AND Status<>N'Annullata')
    BEGIN
        ROLLBACK; THROW 50005, 'Questo orario non è più disponibile.', 1;
    END;

    INSERT dbo.Appointments (PatientName, Phone, Email, AppointmentDate, Status, Notes, DoctorId, CreatedAt)
    VALUES (TRIM(@PatientName), TRIM(@Phone), NULLIF(TRIM(@Email), N''), @AppointmentDate,
            N'In attesa', NULLIF(TRIM(@Notes), N''), @DoctorId, SYSUTCDATETIME());
    DECLARE @Id int = CONVERT(int, SCOPE_IDENTITY());
    COMMIT;
    SELECT @Id AS Id, N'In attesa' AS Status;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Appointment_Cancel @AppointmentId int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.Appointments SET Status=N'Annullata'
    WHERE Id=@AppointmentId AND Status NOT IN (N'Annullata', N'Completata');
    IF @@ROWCOUNT=0 THROW 50020, 'Appuntamento inesistente o non annullabile.', 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Appointment_SetStatus
    @AppointmentId int, @Status nvarchar(30)
AS
BEGIN
    SET NOCOUNT ON;
    IF @Status IS NULL OR @Status NOT IN (N'In attesa',N'Confermata',N'Completata',N'Annullata',N'Assente')
        THROW 50021, 'Stato appuntamento non valido.', 1;
    UPDATE dbo.Appointments SET Status=@Status WHERE Id=@AppointmentId;
    IF @@ROWCOUNT=0 THROW 50022, 'Appuntamento inesistente.', 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Product_GetAvailable
    @Category nvarchar(80)=NULL, @Search nvarchar(140)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, Name, Category, Price, StockQuantity, Description
    FROM dbo.PharmacyProducts
    WHERE IsActive=1 AND StockQuantity>0
      AND (@Category IS NULL OR Category=@Category)
      AND (@Search IS NULL OR Name LIKE N'%' + @Search + N'%')
    ORDER BY Name;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Product_DecreaseStock
    @ProductId int, @Quantity int
AS
BEGIN
    SET NOCOUNT ON;
    IF @Quantity<=0 THROW 50030, 'La quantità deve essere maggiore di zero.', 1;
    DECLARE @Updated TABLE (Id int, StockQuantity int);
    UPDATE dbo.PharmacyProducts SET StockQuantity=StockQuantity-@Quantity
    OUTPUT INSERTED.Id, INSERTED.StockQuantity INTO @Updated
    WHERE Id=@ProductId AND IsActive=1 AND StockQuantity>=@Quantity;
    IF @@ROWCOUNT=0 THROW 50031, 'Prodotto inesistente, non attivo o quantità insufficiente.', 1;
    SELECT Id, StockQuantity FROM @Updated;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_Appointments_AppointmentDate' AND object_id=OBJECT_ID(N'dbo.Appointments'))
    CREATE INDEX IX_Appointments_AppointmentDate ON dbo.Appointments(AppointmentDate) INCLUDE (DoctorId, Status, CreatedAt);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_Doctors_Specialty_Location_Available' AND object_id=OBJECT_ID(N'dbo.Doctors'))
    CREATE INDEX IX_Doctors_Specialty_Location_Available ON dbo.Doctors(SpecialtyId, LocationId, IsAvailable) INCLUDE (FullName);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_PharmacyProducts_Active_Name' AND object_id=OBJECT_ID(N'dbo.PharmacyProducts'))
    CREATE INDEX IX_PharmacyProducts_Active_Name ON dbo.PharmacyProducts(Name) INCLUDE (Category,Price,StockQuantity,Description) WHERE IsActive=1;
GO

-- Libera gli slot annullati e aggiorna anche i database delle versioni precedenti.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name=N'UQ_Appointments_DoctorDate' AND parent_object_id=OBJECT_ID(N'dbo.Appointments'))
    ALTER TABLE dbo.Appointments DROP CONSTRAINT UQ_Appointments_DoctorDate;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_Appointments_DoctorId_AppointmentDate' AND object_id=OBJECT_ID(N'dbo.Appointments') AND has_filter=0)
    DROP INDEX IX_Appointments_DoctorId_AppointmentDate ON dbo.Appointments;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_Appointments_DoctorId_AppointmentDate' AND object_id=OBJECT_ID(N'dbo.Appointments'))
    CREATE UNIQUE INDEX IX_Appointments_DoctorId_AppointmentDate ON dbo.Appointments(DoctorId, AppointmentDate) WHERE Status<>N'Annullata';
COMMIT;
GO
