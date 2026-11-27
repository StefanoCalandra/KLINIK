/* Verifica in sola lettura da SSMS o SQL Server Object Explorer di Visual Studio.
   Selezionare lo stesso database della ConnectionStrings:KlinikDatabase del backend.
   Impostare l'id numerico del codice AUR oppure lasciare NULL per le ultime 50 richieste.
   Dopo un'azione nell'admin rieseguire la query: la griglia non si aggiorna da sola. */
SET NOCOUNT ON;
SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) AS SqlServer,
       DB_NAME() AS DatabaseCorrente;

DECLARE @AppointmentId int = NULL;
SELECT TOP (50)
       a.Id,
       CONCAT(N'AUR-',CASE WHEN a.Id<1000000 THEN RIGHT(CONCAT(N'000000',a.Id),6)
              ELSE CONVERT(nvarchar(11),a.Id) END) AS Codice,
       a.PatientName AS Paziente, a.Phone AS Telefono, a.Email,
       a.AppointmentDate AS DataOraUtc, a.DurationMinutes AS DurataMinuti,
       a.Status AS Stato, a.Notes AS Note,
       d.FullName AS Medico, s.Name AS Specialita,
       COALESCE(ms.Name,N'Visita standard') AS Prestazione,
       l.Name AS Sede, l.Address AS Indirizzo, l.City AS Citta,
       a.CreatedAt AS RegistrazioneUtc
FROM dbo.Appointments a
JOIN dbo.Doctors d ON d.Id=a.DoctorId
JOIN dbo.Specialties s ON s.Id=d.SpecialtyId
JOIN dbo.Locations l ON l.Id=d.LocationId
LEFT JOIN dbo.MedicalServices ms ON ms.Id=a.MedicalServiceId
WHERE @AppointmentId IS NULL OR a.Id=@AppointmentId
ORDER BY a.CreatedAt DESC,a.Id DESC
OPTION (RECOMPILE);

IF @AppointmentId IS NOT NULL
    SELECT @AppointmentId AS IdCercato,
           CASE WHEN EXISTS (SELECT 1 FROM dbo.Appointments WHERE Id=@AppointmentId)
                THEN N'Presente: un annullamento conserva lo storico.'
                ELSE N'Assente: id inesistente o record eliminato definitivamente.' END AS Esito;
