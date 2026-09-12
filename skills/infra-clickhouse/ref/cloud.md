# ClickHouse Cloud

Deploying to ClickHouse Cloud with `clickhousectl`: account setup, CLI authentication, service creation, schema migration, and connecting the application. Use only the steps needed for the requested operation; the full sequence is for a new deployment.

## Existing context first

Inspect the task's service ID/name, project endpoint and `clickhousectl cloud auth status`. Reuse working authentication and the requested service. A schema change or connection task does not require a new account, service or application identity.

If no account exists and Cloud setup is requested, direct the user to [ClickHouse Cloud](https://clickhouse.cloud). Ask them to complete signup only when it blocks the requested operation. Avoid hard-coding trial or pricing promises.

## Step 2: Authenticate the CLI

If existing authentication is insufficient for the operation, authenticate `clickhousectl` with a ClickHouse Cloud API key. Write operations (creating services, users, etc.) require API key auth — OAuth login is read-only.

### Create an API key

Guide the user through creating one in the ClickHouse Cloud console:

> 1. Click the **gear icon** (Settings) in the left sidebar
> 2. Go to **API Keys**
> 3. Click **Create API Key**
> 4. Give it a name (e.g., "clickhousectl")
> 5. Select the **Admin** role for the key. Admin is needed because `cloud service query` auto-provisions a per-service query endpoint API key on first use, which requires permission to create keys. Developer-scoped keys can manage services but may not be able to complete the auto-provisioning step.
> 6. Click **Generate API Key**
> 7. **Copy both the Key ID and the Key Secret** — the secret is only shown once

### Authenticate clickhousectl with the key

Ask the user to **open a new terminal tab in the same working directory** and run the login command there with their Key ID and Secret — this keeps the secret out of the chat session. Tell them to come back and let you know once it's done.

```bash
clickhousectl cloud auth login --api-key <key> --api-secret <secret>
```

Both `--api-key` and `--api-secret` are required — if the user only has one, tell them both are needed.

**To verify authentication works:**

```bash
clickhousectl cloud auth status
clickhousectl cloud org list
```

This should return the user's organization.

## Step 3: Create a cloud service

For an authorized new deployment, resolve organization, region and sizing from the task or ask for missing consequential choices. Check the installed `service create --help` for the corresponding options. For an existing service, skip creation. After a timeout, list/get services to determine whether creation succeeded before retrying. The minimal creation command is:

```bash
clickhousectl cloud service create --name <service-name>
```

From the output, add the HTTPS host and port to `.env` as `CLICKHOUSE_HOST` and `CLICKHOUSE_PORT`. Make sure `.env` is gitignored.

Poll with a bounded deadline until the service state is `running`; report a failure state or timeout instead of creating another service:

```bash
clickhousectl cloud service get <service-id>
```

## Step 4: Migrate schemas

If the user has local table definitions (e.g., from the local workflow in [local.md](local.md)), migrate them to the cloud service.

Use `cloud service query` to run SQL against the cloud service over HTTP. Just pass the service name (or `--id`).

Read the project's migration/schema files and compare them with target DDL. Review compatibility and dependency order; do not assume `IF NOT EXISTS` migrates an existing table. Apply only the requested migration to the resolved service, preferably by ID. In the example layout:

```bash
clickhousectl cloud service query --name <service-name> \
  --queries-file clickhouse/tables/<table>.sql
```

Apply them in dependency order — tables referenced by materialized views should be created first.

**Also apply materialized views** if they exist:

```bash
clickhousectl cloud service query --name <service-name> \
  --queries-file clickhouse/materialized_views/<view>.sql
```

To target a specific database, pass `--database <name>`.

## Step 5: Verify the deployment

Connect to the cloud service and confirm tables exist:

```bash
clickhousectl cloud service query --name <service-name> --query "SHOW TABLES"
```

Inspect table definitions; this checks structure, not migration completeness or application behavior:

```bash
clickhousectl cloud service query --name <service-name> --query "DESCRIBE TABLE <table-name>"
```

## Step 6: Create a dedicated user for the application

Reuse an existing suitably scoped application identity. For a new app identity, grant the minimum needed on the deployed schema; avoid using an administrative identity for application traffic. Check for an existing `app_user` before creation, and do not reset its credentials on a retry.

For a new identity, persist the password privately before creating the user. Merge with the project's existing secret mechanism; never duplicate credential keys or overwrite other `.env` values. Ensure `.env` is gitignored. This local example stops when credentials already exist:

```bash
if [ -f .env ] && grep -Eq '^CLICKHOUSE_(USER|PASSWORD)=' .env; then
  printf '%s\n' 'Reuse the existing credentials or explicitly plan a rotation.' >&2
  exit 1
fi
PASSWORD="$(openssl rand -hex 32)Aa1-"
( umask 177
  printf 'CLICKHOUSE_USER=app_user\nCLICKHOUSE_PASSWORD=%s\n' "$PASSWORD" >> .env
)
chmod 600 .env
PW_HASH=$(printf %s "$PASSWORD" | openssl dgst -sha256 | awk '{print $NF}')
```

Use a locally computed hash in SQL so query errors do not echo the plaintext password. Treat the hash as sensitive too and sanitize error output. Replace `<database>` with the resolved database:

```bash
clickhousectl cloud service query --name <service-name> --query \
  "CREATE USER app_user IDENTIFIED WITH sha256_hash BY '$PW_HASH'"

clickhousectl cloud service query --name <service-name> --query \
  "GRANT SELECT, INSERT ON <database>.* TO app_user"
```

Adjust the grants to fit the app:

- Read-only app → drop `INSERT`
- Needs to create/drop its own tables → also grant `CREATE TABLE, DROP TABLE` on the database (but prefer running migrations as the admin user instead)
- Multiple databases → repeat the `GRANT` per database, or scope per table with `ON <database>.<table>`

Verify the user exists and has the expected grants:

```bash
clickhousectl cloud service query --name <service-name> --query "SHOW GRANTS FOR app_user"
```

If credentials are lost, use the existing secret store or plan an authorized rotation that updates dependent applications. Do not place replacement plaintext passwords in logged SQL.

---

Verify a connection with the application identity and its expected operations before reporting success. Summarize the service, schema changes, config location and verification evidence without credentials. Schema deployment alone does not migrate historical data; include a separate data migration and cutover plan when that is requested.
