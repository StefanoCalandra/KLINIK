SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

/* Procedure richieste dal backend KLINIK.
   Eseguire nel database desiderato dopo schema.sql, expansion.sql e calendar-schema.sql. */

-- Unica regola di disponibilità condivisa da calendario e salvataggio.
-- Turni in Europe/Rome; prenotazioni e assenze in UTC. DATEFIRST indipendente.
CREATE OR ALTER FUNCTION dbo.ufn_DoctorSlots(
    @DoctorId int, @Date date, @MedicalServiceId int,
    @ExcludeAppointmentId int, @DurationMinutes int
)
RETURNS TABLE
AS RETURN (
    WITH Numbers AS (
        SELECT u.n + 10*t.n + 100*h.n AS n
        FROM (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) u(n)
        CROSS JOIN (VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) t(n)
        CROSS JOIN (VALUES(0),(1)) h(n)
    ), LocalSlots AS (
        SELECT DATEADD(minute, n.n*s.SlotDurationMinutes,
                   DATEADD(second, DATEDIFF(second, CAST('00:00' AS time), s.StartTime), CAST(@Date AS datetime2))) AS LocalStart,
               DATEADD(second, DATEDIFF(second, CAST('00:00' AS time), s.EndTime), CAST(@Date AS datetime2)) AS ShiftEnd,
               COALESCE(@DurationMinutes, ms.DurationMinutes, s.SlotDurationMinutes) AS DurationMinutes
        FROM dbo.DoctorSchedules s WITH (HOLDLOCK)
        JOIN dbo.Doctors d ON d.Id=s.DoctorId AND d.IsAvailable=1
        CROSS JOIN Numbers n
        LEFT JOIN dbo.MedicalServices ms ON ms.Id=@MedicalServiceId AND ms.IsActive=1
        WHERE s.DoctorId=@DoctorId AND s.IsActive=1
          AND s.DayOfWeek=((DATEDIFF(day, CONVERT(date,'19000107'), @Date)%7)+7)%7
          AND s.SlotDurationMinutes BETWEEN 10 AND 240
          -- Limita i candidati prima delle conversioni di fuso orario.
          AND n.n*s.SlotDurationMinutes*60 + COALESCE(@DurationMinutes,ms.DurationMinutes,s.SlotDurationMinutes)*60
              <= DATEDIFF(second,s.StartTime,s.EndTime)
          AND (@MedicalServiceId IS NULL OR (ms.Id IS NOT NULL AND EXISTS (
              SELECT 1 FROM dbo.DoctorServices ds WHERE ds.DoctorId=@DoctorId AND ds.MedicalServiceId=ms.Id)))
    ), UtcSlots AS (
        SELECT LocalStart, ShiftEnd, DurationMinutes,
            CONVERT(datetime2, LocalStart AT TIME ZONE 'W. Europe Standard Time' AT TIME ZONE 'UTC') AS StartsAt
        FROM LocalSlots
        WHERE DATEADD(minute, DurationMinutes, LocalStart) <= ShiftEnd
    )
    SELECT StartsAt, DATEADD(minute, MIN(DurationMinutes), StartsAt) AS EndsAt, MIN(DurationMinutes) AS DurationMinutes
    FROM UtcSlots s
    WHERE s.StartsAt > SYSUTCDATETIME()
      -- Non proporre orari inesistenti o visite che attraversano un cambio d'ora.
      AND CONVERT(datetime2, s.StartsAt AT TIME ZONE 'UTC' AT TIME ZONE 'W. Europe Standard Time')=s.LocalStart
      AND CONVERT(datetime2, DATEADD(minute,s.DurationMinutes,s.StartsAt) AT TIME ZONE 'UTC' AT TIME ZONE 'W. Europe Standard Time')
          =DATEADD(minute,s.DurationMinutes,s.LocalStart)
      AND NOT EXISTS (SELECT 1 FROM dbo.DoctorAbsences x
          WHERE x.DoctorId=@DoctorId AND x.StartsAt<DATEADD(minute,s.DurationMinutes,s.StartsAt) AND x.EndsAt>s.StartsAt)
      AND NOT EXISTS (SELECT 1 FROM dbo.Appointments a
          WHERE a.DoctorId=@DoctorId AND a.Status<>N'Annullata'
            AND (@ExcludeAppointmentId IS NULL OR a.Id<>@ExcludeAppointmentId)
            -- CK_Appointments_Duration garantisce al massimo 480 minuti.
            -- La ricerca indicizzata non deve rileggere tutto lo storico del medico.
            AND a.AppointmentDate>DATEADD(minute,-480,s.StartsAt)
            AND a.AppointmentDate<DATEADD(minute,s.DurationMinutes,s.StartsAt)
            AND DATEADD(minute,a.DurationMinutes,a.AppointmentDate)>s.StartsAt)
    GROUP BY StartsAt
);
GO

CREATE OR ALTER PROCEDURE dbo.usp_Doctor_GetSlots
    @DoctorId int, @Date date, @MedicalServiceId int=NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @Date IS NULL OR @Date<'20000101' OR @Date>'20991231'
        THROW 50010, 'Data calendario non valida (2000-2099).', 1;
    SELECT StartsAt, EndsAt, DurationMinutes
    FROM dbo.ufn_DoctorSlots(@DoctorId,@Date,@MedicalServiceId,NULL,NULL)
    ORDER BY StartsAt, DurationMinutes;
END;
GO

-- Ricerca limitata: non inventa turni nei giorni di chiusura.
CREATE OR ALTER PROCEDURE dbo.usp_Doctor_GetNextSlot
    @DoctorId int, @From date, @MedicalServiceId int=NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @From IS NULL OR @From<'20000101' OR @From>'20991231'
        THROW 50010, 'Data calendario non valida (2000-2099).', 1;
    DECLARE @Today date=CONVERT(date,SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'W. Europe Standard Time');
    IF @From<@Today SET @From=@Today;
    DECLARE @Day int=0;
    DECLARE @Next TABLE (StartsAt datetime2,EndsAt datetime2,DurationMinutes int);
    WHILE @Day<28 AND @From<='20991231'
    BEGIN
        INSERT @Next SELECT TOP (1) StartsAt,EndsAt,DurationMinutes
        FROM dbo.ufn_DoctorSlots(@DoctorId,@From,@MedicalServiceId,NULL,NULL)
        ORDER BY StartsAt,DurationMinutes;
        IF @@ROWCOUNT>0
        BEGIN
            SELECT StartsAt,EndsAt,DurationMinutes FROM @Next;
            RETURN;
        END;
        SET @From=DATEADD(day,1,@From);
        SET @Day+=1;
    END;
    SELECT StartsAt,EndsAt,DurationMinutes FROM @Next;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Appointment_Save
    @PatientName nvarchar(120), @Phone nvarchar(30), @Email nvarchar(150)=NULL,
    @AppointmentDate datetime2, @DoctorId int, @Notes nvarchar(1000)=NULL,
    @MedicalServiceId int=NULL, @AppointmentId int=NULL, @Status nvarchar(30)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF NULLIF(TRIM(@PatientName),N'') IS NULL THROW 50001, 'Il nome del paziente è obbligatorio.', 1;
    IF NULLIF(TRIM(@Phone),N'') IS NULL THROW 50002, 'Il telefono è obbligatorio.', 1;
    IF @AppointmentDate IS NULL OR @AppointmentDate<=SYSUTCDATETIME() OR @AppointmentDate>'20991231'
        THROW 50003, 'La data deve essere futura e precedente al 2100.', 1;
    IF @DoctorId IS NULL OR @DoctorId<=0 THROW 50004, 'Medico inesistente o non disponibile.', 1;
    SET @Status=NULLIF(TRIM(@Status),N'');
    IF @Status IS NOT NULL AND @Status NOT IN (N'In attesa',N'Confermata',N'Completata',N'Annullata',N'Assente')
        THROW 50021, 'Stato appuntamento non valido.', 1;
    DECLARE @InitialTranCount int=@@TRANCOUNT, @OldDoctor int, @CurrentDoctor int,
        @CurrentStatus nvarchar(30), @Duration int, @LocalDate date;
    SELECT @OldDoctor=DoctorId FROM dbo.Appointments WHERE Id=@AppointmentId;
    BEGIN TRY
        IF @InitialTranCount=0 BEGIN TRANSACTION;
        ELSE SAVE TRANSACTION AppointmentSave;
        -- Bloccare i medici in ordine evita inversioni durante uno spostamento.
        DECLARE @FirstDoctor int=CASE WHEN @OldDoctor<@DoctorId THEN @OldDoctor ELSE @DoctorId END;
        DECLARE @SecondDoctor int=CASE WHEN @OldDoctor<>@DoctorId THEN
            CASE WHEN @OldDoctor<@DoctorId THEN @DoctorId ELSE @OldDoctor END END;
        DECLARE @Locked int;
        SELECT @Locked=Id FROM dbo.Doctors WITH (UPDLOCK,HOLDLOCK) WHERE Id=@FirstDoctor;
        SELECT @Locked=Id FROM dbo.Doctors WITH (UPDLOCK,HOLDLOCK) WHERE Id=@SecondDoctor;
        IF NOT EXISTS (SELECT 1 FROM dbo.Doctors WHERE Id=@DoctorId AND IsAvailable=1)
            THROW 50004, 'Medico inesistente o non disponibile.', 1;
        IF @AppointmentId IS NOT NULL
        BEGIN
            SELECT @CurrentDoctor=DoctorId, @CurrentStatus=Status, @Duration=DurationMinutes
            FROM dbo.Appointments WITH (UPDLOCK,HOLDLOCK) WHERE Id=@AppointmentId;
            IF @CurrentDoctor IS NULL THROW 50022, 'Appuntamento inesistente.', 1;
            IF @CurrentDoctor<>@OldDoctor THROW 50005, 'Appuntamento modificato: riprovare.', 1;
        END;
        IF @MedicalServiceId IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM dbo.MedicalServices ms JOIN dbo.DoctorServices ds ON ds.MedicalServiceId=ms.Id
            WHERE ms.Id=@MedicalServiceId AND ds.DoctorId=@DoctorId AND ms.IsActive=1)
            THROW 50004, 'Prestazione inesistente o non disponibile per il medico.', 1;
        SET @Status=COALESCE(@Status,@CurrentStatus,N'In attesa');
        SET @LocalDate=CONVERT(date,@AppointmentDate AT TIME ZONE 'UTC' AT TIME ZONE 'W. Europe Standard Time');
        IF @Status<>N'Annullata'
        BEGIN
            SET @Duration=NULL;
            SELECT @Duration=MIN(DurationMinutes)
            FROM dbo.ufn_DoctorSlots(@DoctorId,@LocalDate,@MedicalServiceId,@AppointmentId,NULL)
            WHERE StartsAt=@AppointmentDate;
            IF @Duration IS NULL THROW 50005, 'Questo orario non è più disponibile o non rientra nei turni del medico.', 1;
        END;
        IF @AppointmentId IS NULL
        BEGIN
            INSERT dbo.Appointments(PatientName,Phone,Email,AppointmentDate,Status,Notes,DoctorId,CreatedAt,DurationMinutes,MedicalServiceId)
            VALUES(TRIM(@PatientName),TRIM(@Phone),NULLIF(TRIM(@Email),N''),@AppointmentDate,@Status,
                NULLIF(TRIM(@Notes),N''),@DoctorId,SYSUTCDATETIME(),COALESCE(@Duration,30),@MedicalServiceId);
            SET @AppointmentId=CONVERT(int,SCOPE_IDENTITY());
        END
        ELSE UPDATE dbo.Appointments SET PatientName=TRIM(@PatientName),Phone=TRIM(@Phone),Email=NULLIF(TRIM(@Email),N''),
            AppointmentDate=@AppointmentDate,Status=@Status,Notes=NULLIF(TRIM(@Notes),N''),DoctorId=@DoctorId,
            DurationMinutes=COALESCE(@Duration,30),MedicalServiceId=@MedicalServiceId WHERE Id=@AppointmentId;
        IF @InitialTranCount=0 COMMIT;
    END TRY
    BEGIN CATCH
        IF @InitialTranCount=0 AND XACT_STATE()<>0 ROLLBACK;
        ELSE IF @InitialTranCount>0 AND XACT_STATE()=1 ROLLBACK TRANSACTION AppointmentSave;
        IF ERROR_NUMBER() IN (2601,2627) THROW 50005, 'Questo orario non è più disponibile.', 1;
        THROW;
    END CATCH;
    SELECT @AppointmentId AS Id, @Status AS Status;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Appointment_Create
    @PatientName nvarchar(120), @Phone nvarchar(30), @Email nvarchar(150)=NULL,
    @AppointmentDate datetime2, @DoctorId int, @Notes nvarchar(1000)=NULL, @MedicalServiceId int=NULL
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_Appointment_Save @PatientName,@Phone,@Email,@AppointmentDate,@DoctorId,@Notes,@MedicalServiceId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Appointment_SetStatus
    @AppointmentId int, @Status nvarchar(30)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET @Status=NULLIF(TRIM(@Status),N'');
    IF @Status IS NULL OR @Status NOT IN (N'In attesa',N'Confermata',N'Completata',N'Annullata',N'Assente')
        THROW 50021, 'Stato appuntamento non valido.', 1;
    DECLARE @DoctorId int, @CurrentDoctor int, @Date datetime2, @Duration int, @CurrentStatus nvarchar(30), @Service int;
    SELECT @DoctorId=DoctorId FROM dbo.Appointments WHERE Id=@AppointmentId;
    DECLARE @InitialTranCount int=@@TRANCOUNT;
    BEGIN TRY
        IF @InitialTranCount=0 BEGIN TRANSACTION;
        ELSE SAVE TRANSACTION AppointmentStatus;
        DECLARE @Locked int;
        SELECT @Locked=Id FROM dbo.Doctors WITH (UPDLOCK,HOLDLOCK) WHERE Id=@DoctorId;
        SELECT @CurrentDoctor=DoctorId,@Date=AppointmentDate,@Duration=DurationMinutes,@CurrentStatus=Status,@Service=MedicalServiceId
        FROM dbo.Appointments WITH (UPDLOCK,HOLDLOCK) WHERE Id=@AppointmentId;
        IF @CurrentDoctor IS NULL THROW 50022, 'Appuntamento inesistente.', 1;
        IF @CurrentDoctor<>@DoctorId THROW 50005, 'Appuntamento modificato: riprovare.', 1;
        -- Cambi di stato storici restano possibili; una riattivazione occupa nuovamente lo slot.
        IF @CurrentStatus=N'Annullata' AND @Status<>N'Annullata'
        BEGIN
            DECLARE @LocalDate date=CONVERT(date,@Date AT TIME ZONE 'UTC' AT TIME ZONE 'W. Europe Standard Time');
            IF NOT EXISTS (SELECT 1 FROM dbo.ufn_DoctorSlots(@DoctorId,@LocalDate,@Service,@AppointmentId,@Duration) WHERE StartsAt=@Date)
                THROW 50005, 'Questo orario non è più disponibile.', 1;
        END;
        UPDATE dbo.Appointments SET Status=@Status WHERE Id=@AppointmentId;
        IF @InitialTranCount=0 COMMIT;
    END TRY
    BEGIN CATCH
        IF @InitialTranCount=0 AND XACT_STATE()<>0 ROLLBACK;
        ELSE IF @InitialTranCount>0 AND XACT_STATE()=1 ROLLBACK TRANSACTION AppointmentStatus;
        IF ERROR_NUMBER() IN (2601,2627) THROW 50005, 'Questo orario non è più disponibile.', 1;
        THROW;
    END CATCH;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_DoctorAbsence_Create
    @DoctorId int, @StartsAt datetime2, @EndsAt datetime2
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @StartsAt IS NULL OR @EndsAt IS NULL OR @StartsAt>=@EndsAt
        THROW 50010, 'Intervallo di assenza non valido.', 1;
    DECLARE @InitialTranCount int=@@TRANCOUNT,@Id int;
    BEGIN TRY
        IF @InitialTranCount=0 BEGIN TRANSACTION;
        ELSE SAVE TRANSACTION DoctorAbsence;
        DECLARE @Locked int;
        SELECT @Locked=Id FROM dbo.Doctors WITH (UPDLOCK,HOLDLOCK) WHERE Id=@DoctorId;
        IF @Locked IS NULL THROW 50004, 'Medico inesistente.', 1;
        IF EXISTS (SELECT 1 FROM dbo.Appointments WHERE DoctorId=@DoctorId AND Status<>N'Annullata'
            AND AppointmentDate<@EndsAt AND DATEADD(minute,DurationMinutes,AppointmentDate)>@StartsAt)
            THROW 50005, 'Spostare o annullare le prenotazioni prima di inserire l''assenza.', 1;
        INSERT dbo.DoctorAbsences(DoctorId,StartsAt,EndsAt) VALUES(@DoctorId,@StartsAt,@EndsAt);
        SET @Id=CONVERT(int,SCOPE_IDENTITY());
        IF @InitialTranCount=0 COMMIT;
    END TRY
    BEGIN CATCH
        IF @InitialTranCount=0 AND XACT_STATE()<>0 ROLLBACK;
        ELSE IF @InitialTranCount>0 AND XACT_STATE()=1 ROLLBACK TRANSACTION DoctorAbsence;
        THROW;
    END CATCH;
    SELECT @Id AS Id;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Doctor_Search
    @SpecialtyId int = NULL,
    @LocationId int = NULL,
    @OnlyAvailable bit = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET @OnlyAvailable=COALESCE(@OnlyAvailable,0);
    SELECT d.Id, d.FullName, d.Biography, d.IsAvailable, d.SpecialtyId,
           s.Name AS Specialty, d.LocationId, l.Name AS Location
    FROM dbo.Doctors d
    INNER JOIN dbo.Specialties s ON s.Id = d.SpecialtyId
    INNER JOIN dbo.Locations l ON l.Id = d.LocationId
    WHERE (@SpecialtyId IS NULL OR d.SpecialtyId = @SpecialtyId)
      AND (@LocationId IS NULL OR d.LocationId = @LocationId)
      AND (@OnlyAvailable = 0 OR d.IsAvailable = 1)
    ORDER BY d.FullName,d.Id;
END;
GO

-- Tre result set in un solo comando/collegamento, senza cache di dati modificabili.
CREATE OR ALTER PROCEDURE dbo.usp_ReferenceData_Get
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id,Name FROM dbo.Specialties ORDER BY Name,Id;
    SELECT Id,Name FROM dbo.Locations ORDER BY Name,Id;
    EXEC dbo.usp_Doctor_Search;
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
    IF @From IS NULL OR @To IS NULL OR @From >= @To THROW 50010, 'L''intervallo temporale non è valido.', 1;

    SELECT a.Id, a.PatientName, a.Phone, a.Email, a.AppointmentDate, a.Status,
           a.Notes, a.DurationMinutes, a.MedicalServiceId, a.DoctorId, d.FullName AS Doctor, s.Name AS Specialty,
           l.Name AS Location, a.CreatedAt
    FROM dbo.Appointments a
    INNER JOIN dbo.Doctors d ON d.Id = a.DoctorId
    INNER JOIN dbo.Specialties s ON s.Id = d.SpecialtyId
    INNER JOIN dbo.Locations l ON l.Id = d.LocationId
    WHERE a.AppointmentDate >= @From AND a.AppointmentDate < @To
      AND (@DoctorId IS NULL OR a.DoctorId = @DoctorId)
      AND (@Status IS NULL OR a.Status = @Status)
    ORDER BY a.AppointmentDate,d.FullName,a.Id;
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

CREATE OR ALTER PROCEDURE dbo.usp_Product_GetAvailable
    @Category nvarchar(80)=NULL, @Search nvarchar(140)=NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @Category=NULLIF(TRIM(@Category),N'');
    SET @Search=NULLIF(TRIM(@Search),N'');
    DECLARE @Pattern nvarchar(282)=N'%' + REPLACE(REPLACE(REPLACE(REPLACE(@Search,N'~',N'~~'),N'%',N'~%'),N'_',N'~_'),N'[',N'~[') + N'%';
    SELECT Id, Name, Category, Price, StockQuantity, Description
    FROM dbo.PharmacyProducts
    WHERE IsActive=1 AND StockQuantity>0
      AND (@Category IS NULL OR Category=@Category)
      AND (@Search IS NULL OR Name LIKE @Pattern ESCAPE N'~')
    ORDER BY Name,Id;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Product_DecreaseStock
    @ProductId int, @Quantity int
AS
BEGIN
    SET NOCOUNT ON;
    IF @Quantity IS NULL OR @Quantity<=0 THROW 50030, 'La quantità deve essere maggiore di zero.', 1;
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
    CREATE UNIQUE INDEX IX_Appointments_DoctorId_AppointmentDate ON dbo.Appointments(DoctorId, AppointmentDate) INCLUDE (DurationMinutes) WHERE Status<>N'Annullata';
-- Aggiorna l'indice filtrato già installato senza aggiungere un indice duplicato.
IF NOT EXISTS (SELECT 1 FROM sys.index_columns ic
    JOIN sys.indexes i ON i.object_id=ic.object_id AND i.index_id=ic.index_id
    JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
    WHERE i.object_id=OBJECT_ID(N'dbo.Appointments') AND i.name=N'IX_Appointments_DoctorId_AppointmentDate'
      AND c.name=N'DurationMinutes' AND ic.is_included_column=1)
    CREATE UNIQUE INDEX IX_Appointments_DoctorId_AppointmentDate
        ON dbo.Appointments(DoctorId,AppointmentDate) INCLUDE (DurationMinutes)
        WHERE Status<>N'Annullata' WITH (DROP_EXISTING=ON);
COMMIT;
GO

-- Vista amministrativa senza periodo: paginazione delle richieste più recenti.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.Appointments') AND name=N'IX_Appointments_CreatedAt_Id')
    CREATE INDEX IX_Appointments_CreatedAt_Id ON dbo.Appointments(CreatedAt DESC,Id DESC)
        INCLUDE (AppointmentDate,Status,DoctorId);
GO
