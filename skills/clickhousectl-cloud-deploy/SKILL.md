---
name: clickhousectl-cloud-deploy
description: Use when a user wants to deploy ClickHouse to the cloud, go to production, use ClickHouse Cloud, host a managed ClickHouse service, or migrate from a local ClickHouse setup to ClickHouse Cloud.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.2.0"
---

# Deploy to ClickHouse Cloud

This skill walks through deploying to ClickHouse Cloud using `clickhousectl`. It covers account setup, CLI authentication, service creation, schema migration, and connecting your application. Follow these steps in order.

## When to Apply

Use this skill when the user wants to:
- Deploy their ClickHouse application to production
- Host ClickHouse as a managed cloud service
- Migrate from a local ClickHouse setup to ClickHouse Cloud
- Create a ClickHouse Cloud service
- Set up ClickHouse Cloud for the first time

---

## Step 1: Sign up for ClickHouse Cloud

Before using any cloud commands, the user needs a ClickHouse Cloud account.

**Ask the user:** "Do you already have a ClickHouse Cloud account?"

**If they do not have an account**, explain:

> ClickHouse Cloud is a fully managed service that runs ClickHouse for you — no infrastructure to maintain, automatic scaling, backups, and upgrades included. There's a free trial so you can get started without a credit card.
>
> To create an account, go to: **https://clickhouse.cloud**
>
> Sign up with your email, Google, or GitHub account. Once you're in the console, let me know and we'll continue with the next step.

**Wait for the user to confirm** they have signed up or already have an account before proceeding.

---

## Step 2: Authenticate the CLI

First, ensure `clickhousectl` is installed. Check with:

```bash
which clickhousectl
```

If not found, install it:

```bash
curl -fsSL https://clickhouse.com/cli | sh
```

Authenticate `clickhousectl` with a ClickHouse Cloud API key.

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
clickhousectl cloud login --api-key <key> --api-secret <secret>
```

Both `--api-key` and `--api-secret` are required — if the user only has one, tell them both are needed.

---

**To verify authentication works:**

```bash
clickhousectl cloud org list
```

This should return the user's organization.

---

## Step 3: Create a cloud service

Create a new ClickHouse Cloud service:

```bash
clickhousectl cloud service create --name <service-name>
```

From the output, add the HTTPS host and port to `.env` as `CLICKHOUSE_HOST` and `CLICKHOUSE_PORT`. Make sure `.env` is gitignored.

Then poll until the service state is `running`:

```bash
clickhousectl cloud service get <service-id>
```

---

## Step 4: Migrate schemas

If the user has local table definitions (e.g., from using the `clickhousectl-local-dev` skill), migrate them to the cloud service.

Use `cloud service query` to run SQL against the cloud service over HTTP. Just pass the service name (or `--id`).

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

To target a specific database, pass `--database <name>`.

---

## Step 5: Verify the deployment

Connect to the cloud service and confirm tables exist:

```bash
clickhousectl cloud service query --name <service-name> --query "SHOW TABLES"
```

Run a test query to confirm the schema is correct:

```bash
clickhousectl cloud service query --name <service-name> --query "DESCRIBE TABLE <table-name>"
```

---

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