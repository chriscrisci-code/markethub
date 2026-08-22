# Market Hub

Create once → publish anywhere → fulfill anywhere → manage everything from Market Hub.

Phase 1 includes the admin foundation: authentication, dashboard, master item catalog, artwork upload, mock connectors, and the normalized database schema for future orders, channels, and money tracking.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Postgres, Auth, Storage)
- Vercel (deployment)

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**
3. Choose an organization, name (e.g. `market-hub`), database password, and region
4. Wait for the project to finish provisioning

### 3. Run database migrations

In the Supabase dashboard:

1. Open **SQL Editor**
2. Run the contents of [`supabase/migrations/20260822100000_initial_schema.sql`](supabase/migrations/20260822100000_initial_schema.sql)
3. Run the contents of [`supabase/migrations/20260822100001_storage.sql`](supabase/migrations/20260822100001_storage.sql)

Alternatively, if you use the Supabase CLI:

```bash
supabase db push
```

### 4. Create your admin user

1. In Supabase, open **Authentication → Users**
2. Click **Add user → Create new user**
3. Enter your email and password (this is your Market Hub admin account)

### 5. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Fill in values from Supabase **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 6. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the user you created.

## GitHub repository

Market Hub should have its **own** GitHub repo, separate from other projects.

1. Go to [github.com/new](https://github.com/new)
2. Name it `market-hub` (private recommended)
3. Do **not** initialize with a README (this project already has one)
4. In this folder:

```bash
git init
git add .
git commit -m "Initial Market Hub Phase 1 scaffold"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/market-hub.git
git push -u origin main
```

## Vercel deployment

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your `market-hub` GitHub repository
3. Add the same environment variables from `.env.local`
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL (e.g. `https://market-hub.vercel.app`)
5. Deploy

After deploying, update Supabase **Authentication → URL Configuration**:

- **Site URL:** your Vercel URL
- **Redirect URLs:** add `http://localhost:3000/**` and `https://your-vercel-url/**`

## Phase 1 features

- Sign in / sign out (single owner)
- Dashboard with item and order counts
- Items list with **Add Item**
- Item detail: name, description, price, status, artwork upload, fulfillment provider, sales channel status (mock)
- Connector architecture with mock fulfillment and marketplace providers

## What's next

When you're ready:

- **Phase 2:** Product designer (canvas placement, variants)
- **Phase 3:** Real publish/sync to marketplaces
- **Phase 4:** Orders and fulfillment loop
- **Phase 5:** Profit, payouts, dashboard depth

To add a real provider later, say: *"Walk me through adding [provider] to Market Hub."*
