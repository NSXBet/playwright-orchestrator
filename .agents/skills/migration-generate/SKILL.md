---
name: migration-generate
description: Generate TypeORM database migrations for admin-api. Analyzes entity changes, derives a descriptive migration name, ensures MySQL is running, and generates the migration file.
disable-model-invocation: true
argument-hint: "[optional-name]"
metadata:
  internal: true
---

# Database Migration Generator

**IF** the user provided `$ARGUMENTS` **THEN** use it as `MigrationName` (convert to PascalCase if needed), skip Step 3.
**ELSE** derive `MigrationName` in Step 3.

## Step 1: Ensure MySQL is running

```bash
docker compose up -d mysql && until docker compose exec -T mysql mysqladmin ping -h localhost --silent > /dev/null 2>&1; do sleep 1; done
```

## Step 2: Run pending migrations

```bash
cd apps/admin-api && NODE_ENV=development bun run migration:run
```

## Step 3: Derive the migration name

Analyze entity changes to derive `MigrationName` in **PascalCase**. Use `git diff` on entity files, or compare entities against existing migrations.

Entity files: `apps/admin-api/src/modules/**/entities/*.entity.ts`

**Naming conventions:**

| Change type                   | Pattern                          | Example                              |
| ----------------------------- | -------------------------------- | ------------------------------------ |
| New table/entity              | `Create{Table}`                  | `CreateAuditLog`                     |
| Add column(s)                 | `Add{Column}To{Table}`           | `AddEmailToUsers`                    |
| Remove column(s)              | `Remove{Column}From{Table}`      | `RemoveStatusFromModules`            |
| Modify column                 | `Alter{Column}In{Table}`         | `AlterVersionInModules`              |
| Add index                     | `AddIndexOn{Column}To{Table}`    | `AddIndexOnModuleIdToModuleVersions` |
| Add relation/FK               | `Add{Relation}RelationTo{Table}` | `AddModuleRelationToVersions`        |
| Multiple changes on one table | `Update{Table}`                  | `UpdateModules`                      |
| Multiple tables changed       | `Update{Table1}And{Table2}`      | `UpdateModulesAndModuleVersions`     |

**Rules:**

- **PascalCase**, no spaces or hyphens
- Use the **entity concept name** (e.g., `Modules` not `modules`)
- Be specific — `AddBaseUrlToModuleVersions` > `UpdateModuleVersions`
- Keep under 60 characters

## Step 4: Generate the migration

```bash
cd apps/admin-api && NODE_ENV=development bun run migration:generate src/database/migrations/{MigrationName}
```

TypeORM prepends a timestamp automatically (e.g., `1774370341096-AddEmailToUsers.ts`).

**IF** output contains "No changes in database schema were found" **THEN** inform the user that entities already match the database. **Stop here.**

## Step 5: Verify the generated migration

Read the generated file and check:

1. `up()` references the correct table/column names and types
2. `up()` contains no unintended destructive operations (DROP TABLE, DROP COLUMN)
3. `down()` correctly reverses every change in `up()`

## Step 6: Test the migration

```bash
cd apps/admin-api && NODE_ENV=development bun run migration:run
```

Verify no schema drift remains:

```bash
cd apps/admin-api && NODE_ENV=development bun run migration:generate src/database/migrations/VerifyNoDrift
```

This MUST report "No changes in database schema were found". **IF** it generates a file **THEN** investigate the discrepancy.

Delete the verification file (whether generated or not):

```bash
rm -f apps/admin-api/src/database/migrations/*-VerifyNoDrift.ts
```

## Step 7: Report

Output format:

```
**Migration created**: `{file path}`
**Changes**: {1-2 sentence summary of SQL operations}
**Status**: Tested successfully — no schema drift
```
