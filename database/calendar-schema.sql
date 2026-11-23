-- Aggiornamento idempotente: le prenotazioni storiche conservano una durata di 30 minuti.
IF COL_LENGTH(N'dbo.Appointments', N'DurationMinutes') IS NULL
    ALTER TABLE dbo.Appointments ADD DurationMinutes int NOT NULL CONSTRAINT DF_Appointments_Duration DEFAULT 30;
IF COL_LENGTH(N'dbo.Appointments', N'MedicalServiceId') IS NULL
    ALTER TABLE dbo.Appointments ADD MedicalServiceId int NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns
    WHERE parent_object_id=OBJECT_ID(N'dbo.Appointments')
      AND parent_column_id=COLUMNPROPERTY(OBJECT_ID(N'dbo.Appointments'),N'MedicalServiceId','ColumnId')
      AND referenced_object_id=OBJECT_ID(N'dbo.MedicalServices'))
    ALTER TABLE dbo.Appointments ADD CONSTRAINT FK_Appointments_MedicalServices
        FOREIGN KEY (MedicalServiceId) REFERENCES dbo.MedicalServices(Id);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.Appointments') AND name=N'CK_Appointments_Duration')
    ALTER TABLE dbo.Appointments ADD CONSTRAINT CK_Appointments_Duration CHECK (DurationMinutes BETWEEN 10 AND 480);
IF OBJECT_ID(N'dbo.DoctorAbsences', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DoctorAbsences (
        Id int IDENTITY PRIMARY KEY,
        DoctorId int NOT NULL REFERENCES dbo.Doctors(Id) ON DELETE CASCADE,
        StartsAt datetime2 NOT NULL,
        EndsAt datetime2 NOT NULL,
        CONSTRAINT CK_DoctorAbsences_Range CHECK (StartsAt < EndsAt)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.DoctorAbsences') AND name=N'CK_DoctorAbsences_Range')
    ALTER TABLE dbo.DoctorAbsences ADD CONSTRAINT CK_DoctorAbsences_Range CHECK (StartsAt < EndsAt);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.DoctorAbsences') AND name=N'IX_DoctorAbsences_DoctorId_StartsAt')
    CREATE INDEX IX_DoctorAbsences_DoctorId_StartsAt ON dbo.DoctorAbsences(DoctorId, StartsAt) INCLUDE (EndsAt);
GO
