-- Regressioni SQL dirette: sqlcmd -b -d <database-di-sviluppo> -i tests/stored-procedures.sql
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;
GO
BEGIN TRY
    EXEC dbo.usp_Appointment_GetRange @From=NULL,@To='20350101';
    THROW 51000, 'Intervallo NULL accettato.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER()<>50010 THROW;
END CATCH;
BEGIN TRY
    EXEC dbo.usp_Appointment_Create @PatientName=N'Test',@Phone=N'000',@AppointmentDate=NULL,@DoctorId=1;
    THROW 51000, 'Data NULL accettata.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER()<>50003 THROW;
END CATCH;
BEGIN TRY
    EXEC dbo.usp_Product_DecreaseStock @ProductId=1,@Quantity=NULL;
    THROW 51000, 'Quantità NULL accettata.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER()<>50030 THROW;
END CATCH;
GO
DECLARE @Doctor int=(SELECT TOP (1) Id FROM dbo.Doctors WHERE IsAvailable=1 ORDER BY Id);
DECLARE @Date datetime2;
SELECT TOP (1) @Date=s.StartsAt
FROM (VALUES(1),(2),(3),(4),(5),(6),(7)) days(n)
CROSS APPLY dbo.ufn_DoctorSlots(@Doctor,CONVERT(date,DATEADD(day,days.n,SYSUTCDATETIME())),NULL,NULL,NULL) s
ORDER BY s.StartsAt;
IF @Date IS NULL THROW 51000, 'Serve un medico di prova con un turno libero entro sette giorni.', 1;
-- Errore dopo l'apertura della transazione: nessun leak di @@TRANCOUNT.
DECLARE @InvalidDate datetime2=DATEADD(second,1,@Date);
BEGIN TRY
    EXEC dbo.usp_Appointment_Create @PatientName=N'Test',@Phone=N'000',@AppointmentDate=@InvalidDate,@DoctorId=@Doctor;
    THROW 51000, 'Orario fuori griglia accettato.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER()<>50005 THROW;
END CATCH;
IF @@TRANCOUNT<>0 THROW 51000, 'Transazione interna non annullata.', 1;
BEGIN TRANSACTION;
BEGIN TRY
    DECLARE @Created TABLE (Id int, Status nvarchar(30));
    INSERT @Created EXEC dbo.usp_Appointment_Create @PatientName=N'SQL regression',@Phone=N'000',@AppointmentDate=@Date,@DoctorId=@Doctor;
    IF @@TRANCOUNT<>1 THROW 51000, 'Transazione del chiamante modificata.', 1;
    DECLARE @Id int=(SELECT Id FROM @Created);
    IF @Id IS NULL THROW 51000, 'Prenotazione non restituita.', 1;
    EXEC dbo.usp_Appointment_SetStatus @AppointmentId=@Id,@Status=N' Confermata ';
    IF NOT EXISTS (SELECT 1 FROM dbo.Appointments WHERE Id=@Id AND Status=N'Confermata')
        THROW 51000, 'Normalizzazione stato fallita.', 1;
    ROLLBACK;
    IF EXISTS (SELECT 1 FROM dbo.Appointments WHERE Id=@Id) THROW 51000, 'Rollback esterno non rispettato.', 1;
END TRY
BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK;
    THROW;
END CATCH;
GO
BEGIN TRANSACTION;
BEGIN TRY
    DECLARE @Category nvarchar(80)=CONVERT(nvarchar(36),NEWID());
    INSERT dbo.PharmacyProducts(Name,Category,Price,StockQuantity,IsActive)
    VALUES(N'SQL 100%_[~ test',@Category,1,3,1),(N'SQL 100AB test',@Category,1,3,1);
    DECLARE @Products TABLE(Id int, Name nvarchar(140), Category nvarchar(80), Price decimal(10,2), StockQuantity int, Description nvarchar(1000));
    INSERT @Products EXEC dbo.usp_Product_GetAvailable @Category=@Category,@Search=N'%_[~';
    IF (SELECT COUNT(*) FROM @Products)<>1 THROW 51000, 'Ricerca letterale fallita.', 1;
    ROLLBACK;
END TRY
BEGIN CATCH
    IF XACT_STATE()<>0 ROLLBACK;
    THROW;
END CATCH;
GO
PRINT N'SQL OK: NULL, slot, rollback, transazioni esterne e ricerca letterale.';
