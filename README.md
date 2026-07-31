# Kantin Sekolah

## Architecture plan

### Database schema

- `profiles`: one row per Supabase Auth user, including `role` (`student` or `admin`), student number, class, and balance.
- `menu_items`: active canteen products and their current prices.
- `transactions`: immutable purchase header with a UUID, student snapshot, explicit `transaction_date` (`YYYY-MM-DD`), `transaction_time` (`HH:MM`), total and status.
- `transaction_items`: immutable line-item snapshots linked to a transaction. This preserves the item name and price even when the menu is later edited or deleted.

Run `supabase/schema.sql` in the Supabase SQL editor before using the site.

### Authentication and protection

The browser uses Supabase Auth with its session tokens held in secure, same-site cookies via a custom Supabase storage adapter. No application data, credentials, balances, cart, or transaction data is stored in `localStorage`.

Every protected page calls `requireRole()` before rendering. `admin.html` accepts only a valid authenticated user with an `admin` profile; all others are signed out and redirected to `index.html`. This client redirect is only the first layer: Supabase Row Level Security also denies student reads and writes to admin data, and the purchase RPC derives the student identity from `auth.uid()`.

### Daily reports

`transaction_date` is a PostgreSQL `date`, formatted by the UI only as `YYYY-MM-DD`. `transaction_time` is a PostgreSQL `time`, formatted as `HH:MM`. The `daily_transaction_reports` view groups successful transactions by `transaction_date`, summing income, transaction count, and quantities from the line-item table. It never depends on locale date strings.

### File responsibilities

- `index.html`: sign-in page.
- `dashboard.html`: student menu, balance, cart and today’s purchases.
- `admin.html`: menu, student balance, student management and reports.
- `history.html`: role-aware transaction history and search.
- `js/auth.js`: Supabase client, cookie session storage and route guards.
- `js/database.js`: all database calls.
- `js/purchase.js`: cart and checkout UI.
- `js/admin.js`: admin management UI.
- `js/history.js`: history UI and date grouping.
- `js/utils.js`: formatting, sanitising, notifications and date utilities.

## Setup and Vercel deployment

1. Create a Supabase project and run `supabase/schema.sql`.
2. In Supabase Auth, create users, then update their `profiles.role` to `admin` for staff accounts. Set the Auth redirect URL to your Vercel URL.
3. Add the project URL and anon key to `js/config.js`. These are public client values; never add the service-role key.
4. In Vercel Project Settings > Environment Variables, add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. This server-only key is used only by `api/admin-users.js` to create and permanently remove students after verifying the caller is an admin. Never expose it in frontend code.
5. Deploy this folder to Vercel. Database authorization remains enforced by Supabase RLS and the checkout RPC.

## Admin operations

- **Menu & stock:** Add, edit (including stock), hide, or delete items. Zero-stock products cannot be added to a cart, and checkout rechecks stock then deducts it atomically.
- **Students:** Create a student Auth account, search students, set/top up a balance, and permanently delete an account.

## Existing-project security migration

If you installed an earlier version of the schema, run this in the Supabase SQL editor after applying the updated report definition:

```sql
alter view public.daily_transaction_reports set (security_invoker = true);
```

For production, enable email confirmation/password policy in Supabase and restrict your Auth site URLs to your Vercel domains.
