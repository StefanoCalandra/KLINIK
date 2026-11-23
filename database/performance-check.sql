/* SSMS: eseguire nel database selezionato, con piano di esecuzione effettivo
   (Ctrl+M). Diagnostica in sola lettura: non ricostruisce indici, non svuota cache. */
SET NOCOUNT ON;
DECLARE @DoctorId int=(SELECT MIN(Id) FROM dbo.Doctors WHERE IsAvailable=1);
DECLARE @Date date=CONVERT(date,DATEADD(day,7,SYSUTCDATETIME()));
SET STATISTICS IO ON;
SET STATISTICS TIME ON;
EXEC dbo.usp_Doctor_GetSlots @DoctorId=@DoctorId,@Date=@Date;
EXEC dbo.usp_Doctor_Search @OnlyAvailable=1;
SET STATISTICS IO OFF;
SET STATISTICS TIME OFF;

-- Dimensione degli indici degli appuntamenti; le righe non vanno sommate tra indici.
SELECT i.name, SUM(p.row_count) AS RowsInIndex,
       SUM(p.used_page_count)*8 AS UsedKB
FROM sys.indexes i
JOIN sys.dm_db_partition_stats p ON p.object_id=i.object_id AND p.index_id=i.index_id
WHERE i.object_id=OBJECT_ID(N'dbo.Appointments')
GROUP BY i.name;
-- Cronologia degli script installati: un normale riavvio deve lasciare AppliedAt invariato.
IF OBJECT_ID(N'dbo.KlinikScriptVersions',N'U') IS NOT NULL
    EXEC(N'SELECT ScriptName,ScriptHash,AppliedAt FROM dbo.KlinikScriptVersions ORDER BY ScriptName');
