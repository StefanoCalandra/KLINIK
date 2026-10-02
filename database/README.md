# Database KlinikDb

Il database viene creato automaticamente da Entity Framework Core sul server
`STEFANO-PC\SQLEXPRESS` al primo avvio dell'applicazione. Aprendo SQL Server
Management Studio 21 con **Autenticazione di Windows**, il database sarà visibile
in **Database → KlinikDb** dopo un aggiornamento dell'albero.

`schema.sql` è fornito come alternativa per creare manualmente lo stesso schema.
Non eseguire lo script dopo che l'applicazione ha già creato e popolato il database.

`stored-procedures.sql` contiene le procedure e gli indici usati dal backend.
Viene copiato nell'output ed eseguito automaticamente a ogni avvio con istruzioni
idempotenti `CREATE OR ALTER`; può anche essere eseguito manualmente da SSMS.
