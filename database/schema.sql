/* Eseguire in SSMS 21 connessi a STEFANO-PC\SQLEXPRESS.
   Lo script è alternativo alla creazione automatica di Entity Framework Core. */
IF DB_ID(N'KlinikDb') IS NULL
    CREATE DATABASE KlinikDb;
GO
USE KlinikDb;
GO

IF OBJECT_ID(N'dbo.Specialties', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Specialties (
        Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Specialties PRIMARY KEY,
        Name nvarchar(100) NOT NULL,
        Description nvarchar(500) NULL,
        CONSTRAINT UQ_Specialties_Name UNIQUE (Name)
    );
END;

IF OBJECT_ID(N'dbo.Locations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Locations (
        Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Locations PRIMARY KEY,
        Name nvarchar(120) NOT NULL,
        Address nvarchar(200) NULL,
        City nvarchar(80) NULL,
        CONSTRAINT UQ_Locations_Name UNIQUE (Name)
    );
END;

IF OBJECT_ID(N'dbo.Doctors', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Doctors (
        Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Doctors PRIMARY KEY,
        FullName nvarchar(120) NOT NULL,
        Biography nvarchar(1000) NULL,
        IsAvailable bit NOT NULL CONSTRAINT DF_Doctors_IsAvailable DEFAULT 1,
        SpecialtyId int NOT NULL,
        LocationId int NOT NULL,
        CONSTRAINT FK_Doctors_Specialties FOREIGN KEY (SpecialtyId) REFERENCES dbo.Specialties(Id),
        CONSTRAINT FK_Doctors_Locations FOREIGN KEY (LocationId) REFERENCES dbo.Locations(Id)
    );
END;

IF OBJECT_ID(N'dbo.Appointments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Appointments (
        Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Appointments PRIMARY KEY,
        PatientName nvarchar(120) NOT NULL,
        Phone nvarchar(30) NOT NULL,
        Email nvarchar(150) NULL,
        AppointmentDate datetime2 NOT NULL,
        Status nvarchar(30) NOT NULL CONSTRAINT DF_Appointments_Status DEFAULT N'In attesa',
        Notes nvarchar(1000) NULL,
        DoctorId int NOT NULL,
        CreatedAt datetime2 NOT NULL CONSTRAINT DF_Appointments_CreatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Appointments_Doctors FOREIGN KEY (DoctorId) REFERENCES dbo.Doctors(Id),
        CONSTRAINT UQ_Appointments_DoctorDate UNIQUE (DoctorId, AppointmentDate)
    );
END;

IF OBJECT_ID(N'dbo.PharmacyProducts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PharmacyProducts (
        Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_PharmacyProducts PRIMARY KEY,
        Name nvarchar(140) NOT NULL,
        Category nvarchar(80) NOT NULL,
        Price decimal(10,2) NOT NULL,
        StockQuantity int NOT NULL,
        IsActive bit NOT NULL CONSTRAINT DF_Products_IsActive DEFAULT 1,
        Description nvarchar(1000) NULL,
        CONSTRAINT CK_Products_Price CHECK (Price >= 0),
        CONSTRAINT CK_Products_Stock CHECK (StockQuantity >= 0)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Specialties)
BEGIN
    INSERT dbo.Specialties (Name, Description) VALUES
      (N'Cardiologia', N'Prevenzione e cura cardiovascolare'),
      (N'Dermatologia', N'Salute della pelle'),
      (N'Pediatria', N'Cura dei bambini e adolescenti'),
      (N'Medicina generale', N'Visite e prevenzione');

    INSERT dbo.Locations (Name, Address, City) VALUES
      (N'Milano, Centro', N'Via della Salute 12', N'Milano'),
      (N'Milano, Navigli', N'Alzaia Naviglio 24', N'Milano'),
      (N'Online', NULL, N'Telemedicina');

    INSERT dbo.Doctors (FullName, Biography, IsAvailable, SpecialtyId, LocationId)
    SELECT N'Dott.ssa Laura Ferri', N'Specialista in cardiologia clinica.', 1, s.Id, l.Id
      FROM dbo.Specialties s CROSS JOIN dbo.Locations l WHERE s.Name=N'Cardiologia' AND l.Name=N'Milano, Centro'
    UNION ALL
    SELECT N'Dott. Marco Riva', N'Specialista in dermatologia e prevenzione.', 1, s.Id, l.Id
      FROM dbo.Specialties s CROSS JOIN dbo.Locations l WHERE s.Name=N'Dermatologia' AND l.Name=N'Milano, Navigli'
    UNION ALL
    SELECT N'Dott.ssa Sara Bianchi', N'Specialista in pediatria.', 1, s.Id, l.Id
      FROM dbo.Specialties s CROSS JOIN dbo.Locations l WHERE s.Name=N'Pediatria' AND l.Name=N'Milano, Centro';

    INSERT dbo.PharmacyProducts (Name, Category, Price, StockQuantity, IsActive, Description) VALUES
      (N'Vitamina D3', N'Integratori', 14.90, 30, 1, N'Integratore alimentare di vitamina D3.'),
      (N'Magnesio', N'Integratori', 11.50, 24, 1, N'Supporto per energia e funzione muscolare.'),
      (N'Crema corpo', N'Dermocosmesi', 18.00, 18, 1, N'Crema corpo idratante.');
END;
GO
