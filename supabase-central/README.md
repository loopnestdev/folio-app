# Loopnest Central Database

One Supabase project hosting all Loopnest applications in isolated PostgreSQL schemas.

## Why This Structure

Supabase charges per **project** (compute add-on per instance). By consolidating into one project:
- One compute bill
- One Google OAuth configuration (SSO across all apps)
- One database to back up and monitor
- Data is still fully isolated per app via PostgreSQL schemas + RLS

## Architecture

```
Supabase Project: loopnest-central
│
├── auth schema (Supabase-managed)
│   └── auth.users  ← one identity per Google account, shared
│
├── folio schema    ← folio-app (portfolio tracker)
│   ├── profiles
│   ├── portfolios
│   ├── securities
│   ├── trades
│   ├── price_history
│   └── benchmark_data
│
├── moat schema     ← moat-finder (equity research)
│   ├── users
│   ├── tickers
│   ├── research_reports
│   ├── research_versions
│   ├── audit_log
│   └── research_checkpoints
│
└── signal schema   ← signal-dashboard (stock watchlists)
    ├── user_profiles
    └── watchlists
```

### Key Properties

| Property | Detail |
|---|---|
| Google OAuth | One configuration, works for all apps |
| User identity | Same Google account → same `auth.users.id` across all apps |
| App roles | Independent per app — admin in moat ≠ admin in folio |
| First-user admin | Each app counts its own schema's user table independently |
| Data isolation | RLS enforced per schema; service role key used only in backends |
| Schema isolation | `folio.*` tables invisible to moat queries and vice versa |

---

## Setup: New Supabase Project

### 1. Create Project

Go to [supabase.com](https://supabase.com) → New Project → name it `loopnest-central`.

### 2. Enable Google OAuth

Dashboard → **Authentication** → **Providers** → Google → enable and paste your Google OAuth client credentials. This single configuration covers all three apps.

### 3. Run Migrations (in order)

Open **SQL Editor** in the Supabase dashboard and run each file in sequence:

```
migrations/001_schemas.sql        ← creates folio + moat + signal schemas
migrations/002_folio.sql          ← folio-app tables + RLS
migrations/003_moat.sql           ← moat-finder tables + RLS
migrations/004_signal.sql         ← signal-dashboard tables + RLS
```

Run `005_data_migration.sql` only if migrating existing data (see below).

### 4. Expose Schemas in PostgREST

Dashboard → **Project Settings** → **Data API** → **Exposed schemas**

Add `folio`, `moat`, and `signal` to the list (alongside `public`). Save.

This allows the Supabase JS client's `db: { schema: '...' }` option to route queries correctly.

### 5. Collect Credentials

From Dashboard → **Project Settings** → **API**:
- `SUPABASE_URL` — same for all apps
- `SUPABASE_ANON_KEY` — same for all apps (frontends)
- `SUPABASE_SERVICE_ROLE_KEY` — same for all apps (backends, keep secret)

---

## Code Changes Per App

### folio-app

Already updated. Both clients now include `db: { schema: 'folio' }`:

```typescript
// backend/src/lib/supabase.ts
createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'folio' },
})

// frontend/src/lib/supabase.ts
createClient(url, anonKey, { db: { schema: 'folio' } })
```

Update `.env` / Railway env vars to point to the new Supabase project.

### moat-finder

Two files to update:

**`backend/src/services/supabase.ts`** — add `db: { schema: 'moat' }` to both `adminClient` and `userClient`:
```typescript
export const adminClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'moat' },
});
```

**`frontend/src/lib/supabase.ts`** (or equivalent) — add `db: { schema: 'moat' }`:
```typescript
export const supabase = createClient(url, anonKey, {
  db: { schema: 'moat' },
});
```

Update `.env` / Railway / Cloudflare env vars to point to the new Supabase project.

### signal-dashboard

signal-dashboard is frontend-only (no Express backend). Two code changes are required.

**`frontend/src/lib/supabase.ts`** — add `db: { schema: 'signal' }`:

```typescript
// Before:
export const supabase: SupabaseClient<Database> | null =
  url && key ? createClient<Database>(url, key) : null;

// After:
export const supabase: SupabaseClient<Database> | null =
  url && key ? createClient<Database>(url, key, { db: { schema: 'signal' } }) : null;
```

**`frontend/src/hooks/useAuth.ts`** — INSERT profile on first sign-in (no backend or DB trigger handles this). In your `fetchProfile` function, after the SELECT returns no row, add an INSERT:

```typescript
// After SELECT returns null / no row:
const isFirstUser = (await supabase.from('user_profiles').select('id', { count: 'exact', head: true })).count === 0;

const { data: newProfile } = await supabase
  .from('user_profiles')
  .insert({
    id: session.user.id,
    email: session.user.email!,
    display_name: session.user.user_metadata?.full_name ?? null,
    is_admin: isFirstUser,
    status: isFirstUser ? 'approved' : 'pending',
  })
  .select()
  .single();
```

Update Cloudflare Pages env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) to point to the new Supabase project.

---

## Data Migration (if you have existing data to preserve)

### Option A — Fresh Start (recommended if data is sparse)

Users just sign in with Google again. Their Google account creates a new `auth.users` row automatically. They re-enter any portfolio/research data.

### Option B — Preserve Existing Data

#### Step 1: Export data from old projects

Get your old Supabase project's direct DB connection string from:
Dashboard → **Project Settings** → **Database** → **Connection string** (use the direct, not pooler, connection).

```bash
# folio-app old project
pg_dump \
  --data-only \
  --table=public.profiles \
  --table=public.portfolios \
  --table=public.securities \
  --table=public.trades \
  --table=public.price_history \
  --table=public.benchmark_data \
  "postgresql://postgres:[password]@db.[old-folio-ref].supabase.co:5432/postgres" \
  > folio_export.sql

# moat-finder old project
pg_dump \
  --data-only \
  --table=public.users \
  --table=public.tickers \
  --table=public.research_reports \
  --table=public.research_versions \
  --table=public.audit_log \
  --table=public.research_checkpoints \
  "postgresql://postgres:[password]@db.[old-moat-ref].supabase.co:5432/postgres" \
  > moat_export.sql

# signal-dashboard old project
pg_dump \
  --data-only \
  --table=public.user_profiles \
  --table=public.watchlists \
  "postgresql://postgres:[password]@db.[old-signal-ref].supabase.co:5432/postgres" \
  > signal_export.sql
```

#### Step 2: Remap schemas

```bash
sed 's/public\./folio./g'  folio_export.sql  > folio_import.sql
sed 's/public\./moat./g'   moat_export.sql   > moat_import.sql
sed 's/public\./signal./g' signal_export.sql > signal_import.sql
```

#### Step 3: Have users sign into the new project first

This creates their `auth.users` rows with new UUIDs. Then use the Supabase Admin API to list users from both old and new projects and build the UUID mapping:

```bash
# Old project users
curl "https://[old-project-ref].supabase.co/auth/v1/admin/users" \
  -H "apikey: [old-service-role-key]" \
  -H "Authorization: Bearer [old-service-role-key]" \
  | jq '[.users[] | {id, email}]' > old_users.json

# New project users (after they've re-signed-in)
curl "https://[new-project-ref].supabase.co/auth/v1/admin/users" \
  -H "apikey: [new-service-role-key]" \
  -H "Authorization: Bearer [new-service-role-key]" \
  | jq '[.users[] | {id, email}]' > new_users.json
```

#### Step 4: Run 005_data_migration.sql

Populate the `uuid_map` temp table and run the UPDATE statements to remap foreign keys for all three apps, then import the data files.

#### Step 5: Import data

Connect to the new project's database and run:

```bash
psql "postgresql://postgres:[password]@db.[new-ref].supabase.co:5432/postgres" \
  -f folio_import.sql \
  -f moat_import.sql \
  -f signal_import.sql
```

---

## Verifying the Setup

After setup, run these checks in the SQL editor:

```sql
-- Confirm schemas exist
SELECT schema_name FROM information_schema.schemata
WHERE schema_name IN ('folio', 'moat', 'signal');

-- Confirm tables exist
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_schema IN ('folio', 'moat', 'signal')
ORDER BY table_schema, table_name;

-- Confirm RLS is enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname IN ('folio', 'moat', 'signal');

-- Confirm grants
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('folio', 'moat', 'signal')
  AND grantee IN ('authenticated', 'anon', 'service_role')
ORDER BY table_schema, grantee, table_name;
```

---

## How Google OAuth Works Across Apps

One Google OAuth app → one Supabase Auth configuration → one `auth.users` table.

When the same person signs into any of the three apps with the same Google account:

- They get **one** `auth.users.id` (UUID)
- They have **independent** profile rows: `folio.profiles`, `moat.users`, `signal.user_profiles`
- Being admin in one app does NOT grant admin in any other
- Their JWT (from Google → Supabase) is valid for all three apps
- Each app reads only its own schema to check role/approval status

This is full **single sign-on** with **per-app authorisation**.
