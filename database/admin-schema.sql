-- L'account iniziale viene creato dal backend con password hashata, una sola volta.
IF OBJECT_ID(N'dbo.AdminAccounts',N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AdminAccounts (
        Id int NOT NULL CONSTRAINT PK_AdminAccounts PRIMARY KEY,
        Username nvarchar(80) NOT NULL,
        PasswordHash nvarchar(512) NOT NULL,
        SecurityStamp nvarchar(36) NOT NULL,
        ChangedAt datetime2 NOT NULL,
        CONSTRAINT CK_AdminAccounts_SingleAccount CHECK (Id=1)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.AdminAccounts') AND name=N'CK_AdminAccounts_SingleAccount')
    ALTER TABLE dbo.AdminAccounts ADD CONSTRAINT CK_AdminAccounts_SingleAccount CHECK (Id=1);
GO
