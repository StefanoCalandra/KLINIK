# Database KlinikDb

Il database viene creato automaticamente da Entity Framework Core sul server
`STEFANO-PC\SQLEXPRESS` al primo avvio dell'applicazione. Aprendo SQL Server
Management Studio 21 con **Autenticazione di Windows**, il database sarà visibile
in **Database → KlinikDb** dopo un aggiornamento dell'albero.

`schema.sql` è fornito come alternativa per creare manualmente lo stesso schema.
Non eseguire lo script dopo che l'applicazione ha già creato e popolato il database.

`stored-procedures.sql` contiene le procedure e gli indici usati dal backend.
Viene copiato nell'output e applicato automaticamente quando cambia il contenuto,
con istruzioni idempotenti `CREATE OR ALTER`; può anche essere eseguito manualmente da SSMS.

`expansion.sql` aggiunge prestazioni mediche, associazioni medico-prestazione,
turni settimanali, ulteriori specialisti e un catalogo farmaceutico ampio. È idempotente e viene
eseguito automaticamente prima delle stored procedure.


Negli script `expansion.sql`, `calendar-schema.sql` e `stored-procedures.sql` non è presente `USE KlinikDb`:
se li esegui manualmente, seleziona prima il database corretto in SSMS. L'applicazione
usa automaticamente il database indicato nella connessione. La cancellazione logica di
un appuntamento libera il relativo slot; lo script delle procedure aggiorna in modo
idempotente anche il precedente indice/vincolo univoco senza eliminare lo storico.
Le nuove prenotazioni usano orari UTC; non viene applicata alcuna conversione ai dati
storici inseriti manualmente.

## Calendario e prenotazioni

L'avvio esegue, nell'ordine, `expansion.sql`, `calendar-schema.sql`, `admin-schema.sql` e
`stored-procedures.sql`. Per un'installazione manuale, eseguire questi quattro file
nel database selezionato dopo `schema.sql`. L'aggiornamento è idempotente:
aggiunge durata, prestazione opzionale e assenze senza eliminare appuntamenti.
Alle prenotazioni storiche viene assegnata una durata convenzionale di 30 minuti;
le loro date restano invariate e vanno verificate prima di usarle come agenda reale.

- `GET /api/doctors/{id}/slots?date=2027-01-15&medicalServiceId=1`: orari liberi
  per un giorno della clinica, con inizio/fine UTC e durata. `medicalServiceId` è
  opzionale; senza prestazione viene usata la durata del turno.
- `GET /api/medical-services?active=true&doctorId=1`: prestazioni associate al medico.
- `POST /api/appointments` e `PUT /api/appointments/{id}`: accettano anche
  `medicalServiceId`; la durata viene calcolata sul server e salvata con la visita.
- `GET /api/doctor-absences?doctorId=1`, `POST /api/doctor-absences` con
  `{ "doctorId": 1, "startsAt": "2027-01-15T08:00:00Z", "endsAt": "2027-01-15T12:00:00Z" }`,
  `DELETE /api/doctor-absences/{id}`: gestione di ferie, assenze e chiusure per medico.
  Prima di inserire un'assenza sovrapposta occorre spostare o annullare le visite;
  non vengono cancellate prenotazioni automaticamente.

I turni settimanali sono espressi nell'ora locale di Roma (`W. Europe Standard
Time` in SQL Server). Le API scambiano UTC con suffisso `Z`, anche se il browser
si trova in un altro fuso. Gli intervalli sono semiaperti `[inizio, fine)`:
una visita può iniziare esattamente alla fine della precedente. Sono esclusi
orari passati, visite oltre la fine del turno, sovrapposizioni e assenze.
La griglia segue `SlotDurationMinutes`; una prestazione può occupare più passi.
Gli orari inesistenti al cambio dell'ora sono esclusi; per gli orari ripetuti in
autunno viene proposta una sola occorrenza, scelta da SQL Server. Non vengono
proposte visite che attraversano il cambio d'ora. Le date supportate sono 2000–2099.

`ufn_DoctorSlots` è condivisa da ricerca e salvataggio. Le procedure serializzano
prenotazioni, spostamenti, riattivazioni e inserimento di assenze sul medico e
ricontrollano la disponibilità nella transazione. Un conflitto restituisce `409`.
`TRY/CATCH` annulla le transazioni interne; le chiamate in transazioni esterne
usano savepoint. Con `XACT_STATE()=-1` il chiamante deve effettuare il rollback completo.
La disponibilità visualizzata non costituisce una prenotazione provvisoria.

Test: `npm run test:api` include durate, sovrapposizioni, assenze, concorrenza,
annullamento/riattivazione e cambio d'ora. `npm run test:browser` verifica il modulo
in Europe/Rome e America/New_York con record di prova rimossi al termine.
Le API delle assenze e le modifiche amministrative richiedono il login amministrativo.

Per le regressioni SQL dirette: `sqlcmd -b -d <database-di-sviluppo> -i tests/stored-procedures.sql`.

## Avvio e misurazione delle prestazioni

`dbo.KlinikScriptVersions` registra hash e data di applicazione degli script.
Un riavvio senza modifiche non ripete seed e DDL; i dati dimostrativi eliminati
non vengono reinseriti a ogni avvio. Per riapplicare intenzionalmente gli script
usare `Database:ReapplyScripts=true` (variabile `Database__ReapplyScripts=true`)
per un avvio, poi rimuovere l'impostazione. Questa opzione può reinserire dati
seed mancanti; non serve dopo una normale modifica ai file SQL, rilevata automaticamente.
Le modifiche manuali alle procedure in SSMS non cambiano gli hash dei file:
usare la riapplicazione esplicita per riallinearle ai sorgenti.

`database/performance-check.sql` è diagnostica in sola lettura, senza `USE`:
selezionare il database desiderato in SSMS. Le DMV sulle dimensioni degli indici
possono richiedere autorizzazioni di visualizzazione dello stato del database.
`tests/slots-benchmark.sql` è riservato allo sviluppo: crea 100.000 righe in una
transazione, misura dieci ricerche e annulla tutto. Durante l'esecuzione può
bloccare altre richieste. Non usarlo sul database operativo.

Il piano degli slot può ora effettuare seek per medico e intervallo temporale
sull'indice univoco filtrato, che include `DurationMinutes`. Il limite inferiore
è corretto grazie a `CK_Appointments_Duration` (durata massima 480 minuti):
se si aumenta questo limite occorre aggiornare anche la funzione SQL.

## Recupero del caricamento e prima disponibilità

`GET /api/doctors/{id}/next-slot?from=2026-12-05&medicalServiceId=1` cerca il primo
slot libero da quel giorno, per un massimo di 28 giorni. La prestazione è opzionale;
la data è quella della clinica (Roma), mentre il risultato contiene timestamp UTC.
La risposta è `204` quando non ci sono slot. Il salvataggio ricontrolla sempre la
disponibilità: il risultato della ricerca non riserva lo slot.

Oltre agli hash degli script, l'avvio verifica che le procedure richieste e la
funzione degli slot esistano. Se un oggetto è stato eliminato, riapplica lo script
delle procedure nella stessa transazione degli aggiornamenti. Non forza la
disponibilità dei medici e non elimina prenotazioni o assenze.

## Account amministrativo

`admin-schema.sql` aggiunge `dbo.AdminAccounts`, senza modificare appuntamenti e
turni. Il backend crea una sola volta l'account iniziale `admin/admin` con hash
PBKDF2. Il cambio credenziali passa dalla pagina amministrativa, richiede la
password attuale e rinnova `SecurityStamp`, così i vecchi cookie non sono più
validi. Non sono salvate password in chiaro e non viene restituito l'hash dalle API.
Il normale avvio e la riapplicazione degli script non sovrascrivono l'account.
