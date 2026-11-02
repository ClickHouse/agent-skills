# ClickHouse Cloud

Deploying to ClickHouse Cloud with `clickhousectl`: account setup, CLI authentication, service creation, schema migration, and connecting the application. Follow these steps in order.

## Step 1: Sign up for ClickHouse Cloud

Before using any cloud commands, the user needs a ClickHouse Cloud account.

**Ask the user:** "Do you already have a ClickHouse Cloud account?"

**If they do not have an account**, explain:

> ClickHouse Cloud is a fully managed service that runs ClickHouse for you — no infrastructure to maintain, automatic scaling, backups, and upgrades included. There's a free trial so you can get started without a credit card.
>
> To create an account, go to: **https://clickhouse.cloud** (or run `clickhousectl cloud auth signup`, which opens the sign-up page in your browser).
>
> Sign up with your email, Google, or GitHub account. Once you're in the console, let me know and we'll continue with the next step.

**Wait for the user to confirm** they have signed up or already have an account before proceeding.

## Step 2: Authenticate the CLI

Authenticate `clickhousectl` with a ClickHouse Cloud API key. Write operations (creating services, users, etc.) require API key auth — OAuth login (`cloud auth login` with no flags) is read-only, and every write command fails on it.

### Create an API key

Guide the user through creating one in the ClickHouse Cloud console:

> 1. Click the **gear icon** (Settings) in the left sidebar
> 2. Go to **API Keys**
> 3. Click **Create API Key**
> 4. Give it a name (e.g., "clickhousectl")
> 5. Select the **Admin** role for the key. On first use, `cloud service query` binds this API key to the service's Query API endpoint, which needs permission to view API keys and manage query endpoints. Developer-scoped keys can manage services but may not be able to complete that step.
> 6. Click **Generate API Key**
> 7. **Copy both the Key ID and the Key Secret** — the secret is only shown once

### Authenticate clickhousectl with the key

Ask the user to **open a new terminal tab in the same working directory** and run the login command there — this keeps the secret out of the chat session. `--interactive` prompts for the Key ID and Secret, which also keeps the secret out of shell history. Tell them to come back and let you know once it's done.

```bash
clickhousectl cloud auth login --interactive
```

Or pass both values as flags: `clickhousectl cloud auth login --api-key <key> --api-secret <secret>`. Both are required — if the user only has one, tell them both are needed. Login verifies the key and prints the identity and organizations; a key the API rejects is not saved and exits 4.

**To verify authentication works:**

```bash
clickhousectl cloud auth status
clickhousectl cloud auth whoami
```

`auth status` shows the active credential source and whether it verified; it always exits 0, so read its output. `auth whoami` lists the user's organizations and exits 4 if the credentials are rejected. If the user has more than one organization, pass `--org-id <id>` to cloud commands.

## Step 3: Create a cloud service

Create a new ClickHouse Cloud service:

```bash
clickhousectl cloud service create --name <service-name>
```

The defaults are `--provider aws --region us-east-1`; pass `--provider` (`aws`, `gcp`, `azure`) and `--region` to choose another location. Omitting `--ip-allow` opens the service to all addresses (`0.0.0.0/0`) — for production, pass `--ip-allow <IP_OR_CIDR>` (repeatable) for each address range that needs access.

The output contains the `default` user's password, which is **printed only once**. Save it straight away, e.g. as `CLICKHOUSE_ADMIN_PASSWORD` in `.env`; `cloud service reset-password <service-id>` issues a new one if it is lost. Also add the HTTPS host and port to `.env` as `CLICKHOUSE_HOST` and `CLICKHOUSE_PORT`. Make sure `.env` is gitignored.

`create` returns before the service is up. Poll until the service state is `running` (this takes a few minutes):

```bash
clickhousectl cloud service get <service-id>
```

## Step 4: Migrate schemas

If the user has local table definitions (e.g., from the local workflow in [local.md](local.md)), migrate them to the cloud service.

Use `cloud service query` to run SQL against the cloud service over HTTP. Pass the service name with `--name`, or the service ID. Each call runs **one SQL statement**: `--query` takes one statement, and a `--queries-file` must contain exactly one. Split files with several statements before applying them.

**Read the local schema files** from `clickhouse/tables/` and apply each one to the cloud service:

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

To target a specific database, pass `--database <name>`. A query that times out is not retried — check whether the statement took effect before re-running it.

## Step 5: Verify the deployment

Connect to the cloud service and confirm tables exist:

```bash
clickhousectl cloud service query --name <service-name> --query "SHOW TABLES"
```

Run a test query to confirm the schema is correct:

```bash
clickhousectl cloud service query --name <service-name> --query "DESCRIBE TABLE <table-name>"
```

## Step 6: Create a dedicated user for the application

The `default` user has full admin rights and should not be used by the application. Create a dedicated user scoped to the schema deployed in Step 4.

Generate a strong random password and append the credentials to `.env` **before** creating the user, so the password is persisted even if a subsequent step fails:

```bash
PASSWORD=$(openssl rand -base64 32)
echo "CLICKHOUSE_USER=app_user" >> .env
echo "CLICKHOUSE_PASSWORD=$PASSWORD" >> .env
```

Then create the user and grant the minimum permissions the app needs. Replace `<database>` with the database the schema lives in (often `default`):

```bash
clickhousectl cloud service query --name <service-name> --query \
  "CREATE USER app_user IDENTIFIED BY '$PASSWORD'"

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

ClickHouse cannot reveal the password later, so if `.env` is lost, the user must reset the password via `ALTER USER app_user IDENTIFIED BY '<new>'`.

---

The application can now use the credentials in `.env` to connect to ClickHouse Cloud.
