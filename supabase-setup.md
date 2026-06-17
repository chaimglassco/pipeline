# Supabase Setup Notes

This project is now configured with the public Supabase project URL and anon key supplied by the project owner.

## Current Supabase project

- Project URL: `https://yeluzxsjgdtzccmekbha.supabase.co`
- Public anon key: configured in `js/supabaseClient.js`

The anon key is intended for browser use. Do not commit or paste the Supabase `service_role` key into the frontend.

## Current implementation step

The app now has a reusable Supabase configuration/client helper, but the existing login and data storage are still local-only. This keeps the first step safe and reversible. The helper accepts Supabase's `createClient` function once we add the browser client library in the next implementation step.

## Next setup step

Run `supabase/schema/001_core_auth_workspace.sql` in the Supabase SQL Editor.

This creates the first shared backend tables:

1. `profiles` — one row per authenticated user.
2. `workspaces` — one shared workspace for the team.
3. `workspace_members` — connects users to the workspace with roles.

It also enables Row Level Security (RLS) and creates starter policies so browser users can only see workspace data they belong to.

## How to run the SQL

1. Open Supabase.
2. Open the LaunchFlow project.
3. Click **SQL Editor**.
4. Click **New query**.
5. Paste the full contents of `supabase/schema/001_core_auth_workspace.sql`.
6. Click **Run**.

After those tables exist, the app can replace the prototype local login with Supabase Auth and load the signed-in user's workspace membership.

## Create the first workspace owner

After `001_core_auth_workspace.sql` succeeds and the admin Auth user exists, run `supabase/schema/002_seed_initial_workspace_owner.sql` in the Supabase SQL Editor.

This creates the shared `LaunchFlow Workspace` and makes `chaim@glasscosupplies.com` the initial `owner` using Supabase Auth UID `c4ff8192-082c-4328-a4ec-5fe42690ad35`. The script is safe to re-run because it upserts the same workspace/member records.

## Auth URL settings note

If Supabase password reset links open `localhost:3000` or another wrong URL, update Supabase **Authentication → URL Configuration** so the Site URL points to the app URL you are actually using.

For local testing, use the local app origin. For the live app, use the Vercel production URL.

## Supabase login wiring

The login form now tries Supabase Auth first. If Supabase rejects the email/password, the app falls back to the old local prototype credentials only as a temporary safety net.

The Forgot password link now asks Supabase to send the reset email. Reset links must point back to the app URL so the app can prompt for the new password.
