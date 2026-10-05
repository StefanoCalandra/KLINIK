/* Espansione idempotente di KlinikDb: prestazioni, turni e dati dimostrativi. */
USE KlinikDb;
GO

IF OBJECT_ID(N'dbo.MedicalServices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MedicalServices (
        Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_MedicalServices PRIMARY KEY,
        Name nvarchar(140) NOT NULL,
        Description nvarchar(1000) NULL,
        DurationMinutes int NOT NULL,
        Price decimal(10,2) NOT NULL,
        IsActive bit NOT NULL CONSTRAINT DF_MedicalServices_IsActive DEFAULT 1,
        SpecialtyId int NOT NULL,
        CONSTRAINT FK_MedicalServices_Specialties FOREIGN KEY (SpecialtyId) REFERENCES dbo.Specialties(Id),
        CONSTRAINT CK_MedicalServices_Duration CHECK (DurationMinutes BETWEEN 10 AND 480),
        CONSTRAINT CK_MedicalServices_Price CHECK (Price >= 0),
        CONSTRAINT UQ_MedicalServices_Name_Specialty UNIQUE (Name, SpecialtyId)
    );
END;

IF OBJECT_ID(N'dbo.DoctorServices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DoctorServices (
        DoctorId int NOT NULL,
        MedicalServiceId int NOT NULL,
        CONSTRAINT PK_DoctorServices PRIMARY KEY (DoctorId, MedicalServiceId),
        CONSTRAINT FK_DoctorServices_Doctors FOREIGN KEY (DoctorId) REFERENCES dbo.Doctors(Id) ON DELETE CASCADE,
        CONSTRAINT FK_DoctorServices_MedicalServices FOREIGN KEY (MedicalServiceId) REFERENCES dbo.MedicalServices(Id) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'dbo.DoctorSchedules', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DoctorSchedules (
        Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_DoctorSchedules PRIMARY KEY,
        DoctorId int NOT NULL,
        DayOfWeek int NOT NULL,
        StartTime time NOT NULL,
        EndTime time NOT NULL,
        SlotDurationMinutes int NOT NULL CONSTRAINT DF_DoctorSchedules_Slot DEFAULT 30,
        IsActive bit NOT NULL CONSTRAINT DF_DoctorSchedules_IsActive DEFAULT 1,
        CONSTRAINT FK_DoctorSchedules_Doctors FOREIGN KEY (DoctorId) REFERENCES dbo.Doctors(Id) ON DELETE CASCADE,
        CONSTRAINT CK_DoctorSchedules_Day CHECK (DayOfWeek BETWEEN 0 AND 6),
        CONSTRAINT CK_DoctorSchedules_Time CHECK (StartTime < EndTime),
        CONSTRAINT CK_DoctorSchedules_Slot CHECK (SlotDurationMinutes BETWEEN 10 AND 240),
        CONSTRAINT UQ_DoctorSchedules_DoctorDayStart UNIQUE (DoctorId, DayOfWeek, StartTime)
    );
END;
GO

-- Nuove specialità e sedi.
IF NOT EXISTS (SELECT 1 FROM dbo.Specialties WHERE Name=N'Oculistica')
    INSERT dbo.Specialties(Name,Description) VALUES(N'Oculistica',N'Prevenzione, diagnosi e cura della vista');
IF NOT EXISTS (SELECT 1 FROM dbo.Specialties WHERE Name=N'Ortopedia')
    INSERT dbo.Specialties(Name,Description) VALUES(N'Ortopedia',N'Patologie dell’apparato muscolo-scheletrico');
IF NOT EXISTS (SELECT 1 FROM dbo.Specialties WHERE Name=N'Ginecologia')
    INSERT dbo.Specialties(Name,Description) VALUES(N'Ginecologia',N'Prevenzione e salute della donna');
IF NOT EXISTS (SELECT 1 FROM dbo.Specialties WHERE Name=N'Neurologia')
    INSERT dbo.Specialties(Name,Description) VALUES(N'Neurologia',N'Diagnosi e cura del sistema nervoso');
IF NOT EXISTS (SELECT 1 FROM dbo.Specialties WHERE Name=N'Nutrizione')
    INSERT dbo.Specialties(Name,Description) VALUES(N'Nutrizione',N'Valutazione nutrizionale e piani alimentari');

IF NOT EXISTS (SELECT 1 FROM dbo.Locations WHERE Name=N'Milano, Porta Romana')
    INSERT dbo.Locations(Name,Address,City) VALUES(N'Milano, Porta Romana',N'Corso Lodi 18',N'Milano');
IF NOT EXISTS (SELECT 1 FROM dbo.Locations WHERE Name=N'Milano, CityLife')
    INSERT dbo.Locations(Name,Address,City) VALUES(N'Milano, CityLife',N'Viale Boezio 7',N'Milano');

-- Nuovi medici.
INSERT dbo.Doctors(FullName,Biography,IsAvailable,SpecialtyId,LocationId)
SELECT v.FullName,v.Biography,1,s.Id,l.Id
FROM (VALUES
 (N'Dott.ssa Elena Conti',N'Specialista in oftalmologia clinica.',N'Oculistica',N'Milano, Centro'),
 (N'Dott. Andrea Moretti',N'Specialista in ortopedia e traumatologia.',N'Ortopedia',N'Milano, Porta Romana'),
 (N'Dott.ssa Giulia Romano',N'Specialista in ginecologia e prevenzione.',N'Ginecologia',N'Milano, CityLife'),
 (N'Dott. Paolo Greco',N'Specialista in neurologia.',N'Neurologia',N'Milano, Centro'),
 (N'Dott.ssa Martina Villa',N'Biologa nutrizionista.',N'Nutrizione',N'Online')
) v(FullName,Biography,SpecialtyName,LocationName)
JOIN dbo.Specialties s ON s.Name=v.SpecialtyName
JOIN dbo.Locations l ON l.Name=v.LocationName
WHERE NOT EXISTS (SELECT 1 FROM dbo.Doctors d WHERE d.FullName=v.FullName);

-- Prestazioni mediche con durata e prezzo.
INSERT dbo.MedicalServices(Name,Description,DurationMinutes,Price,IsActive,SpecialtyId)
SELECT v.Name,v.Description,v.DurationMinutes,v.Price,1,s.Id
FROM (VALUES
 (N'Visita cardiologica',N'Valutazione cardiologica completa.',45,120.00,N'Cardiologia'),
 (N'Elettrocardiogramma',N'ECG a riposo con referto.',20,55.00,N'Cardiologia'),
 (N'Mappatura nei',N'Controllo dermatologico dei nei.',30,90.00,N'Dermatologia'),
 (N'Visita pediatrica',N'Visita generale pediatrica.',40,85.00,N'Pediatria'),
 (N'Visita oculistica',N'Controllo completo della vista.',45,100.00,N'Oculistica'),
 (N'Visita ortopedica',N'Valutazione articolare e muscolare.',40,110.00,N'Ortopedia'),
 (N'Visita ginecologica',N'Visita specialistica e prevenzione.',45,120.00,N'Ginecologia'),
 (N'Visita neurologica',N'Valutazione neurologica completa.',50,140.00,N'Neurologia'),
 (N'Consulenza nutrizionale',N'Analisi e piano alimentare personalizzato.',60,95.00,N'Nutrizione'),
 (N'Consulto di medicina generale',N'Consulto in presenza o online.',30,60.00,N'Medicina generale')
) v(Name,Description,DurationMinutes,Price,SpecialtyName)
JOIN dbo.Specialties s ON s.Name=v.SpecialtyName
WHERE NOT EXISTS (SELECT 1 FROM dbo.MedicalServices ms WHERE ms.Name=v.Name AND ms.SpecialtyId=s.Id);

-- Associa automaticamente ogni medico alle prestazioni della propria specialità.
INSERT dbo.DoctorServices(DoctorId,MedicalServiceId)
SELECT d.Id,ms.Id FROM dbo.Doctors d
JOIN dbo.MedicalServices ms ON ms.SpecialtyId=d.SpecialtyId
WHERE NOT EXISTS (SELECT 1 FROM dbo.DoctorServices ds WHERE ds.DoctorId=d.Id AND ds.MedicalServiceId=ms.Id);

-- Turni dimostrativi: lunedì, mercoledì e venerdì.
INSERT dbo.DoctorSchedules(DoctorId,DayOfWeek,StartTime,EndTime,SlotDurationMinutes,IsActive)
SELECT d.Id,v.DayOfWeek,v.StartTime,v.EndTime,30,1
FROM dbo.Doctors d
CROSS JOIN (VALUES (1,CAST('09:00' AS time),CAST('13:00' AS time)),
                   (3,CAST('14:00' AS time),CAST('18:00' AS time)),
                   (5,CAST('09:00' AS time),CAST('13:00' AS time))) v(DayOfWeek,StartTime,EndTime)
WHERE NOT EXISTS (SELECT 1 FROM dbo.DoctorSchedules ds WHERE ds.DoctorId=d.Id AND ds.DayOfWeek=v.DayOfWeek AND ds.StartTime=v.StartTime);

-- Ulteriori prodotti della farmacia.
INSERT dbo.PharmacyProducts(Name,Category,Price,StockQuantity,IsActive,Description)
SELECT * FROM (VALUES
 (N'Omega 3',N'Integratori',16.90,35,1,N'Integratore di acidi grassi Omega 3.'),
 (N'Multivitaminico',N'Integratori',13.50,40,1,N'Vitamine e minerali per il benessere quotidiano.'),
 (N'Protezione solare SPF 50',N'Dermocosmesi',21.90,22,1,N'Protezione solare ad alta schermatura.'),
 (N'Detergente viso delicato',N'Dermocosmesi',12.00,28,1,N'Detergente per pelli sensibili.'),
 (N'Cerotti assortiti',N'Medicazione',5.90,60,1,N'Cerotti in formati assortiti.'),
 (N'Termometro digitale',N'Dispositivi',9.90,20,1,N'Termometro digitale a lettura rapida.'),
 (N'Soluzione fisiologica',N'Medicazione',4.50,50,1,N'Fiale monodose di soluzione fisiologica.'))
 v(Name,Category,Price,StockQuantity,IsActive,Description)
WHERE NOT EXISTS (SELECT 1 FROM dbo.PharmacyProducts p WHERE p.Name=v.Name);
GO
