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

## Share local workspace fields and dropdowns

After the workspace owner seed succeeds, run `supabase/schema/003_workspace_app_state.sql` in the Supabase SQL Editor.

This creates a `workspace_app_state` table used as the first shared storage bridge for the current local-only workspace fields/dropdowns. Once this table exists, the app can load `workspaceDetails` from Supabase after login and save owner/admin edits back to Supabase.

Important: to migrate existing local fields, sign in once from the browser/computer where those fields are still visible locally. If Supabase does not already have shared workspace details, the app uploads that local `workspaceDetails` snapshot as the initial shared state.

## Auth URL settings note

If Supabase password reset links open `localhost:3000` or another wrong URL, update Supabase **Authentication → URL Configuration** before sending another reset email:

1. Set **Site URL** to the exact app URL you are using, such as your Vercel production URL.
2. Add the same URL to **Redirect URLs**.
3. For Vercel preview deployments, also add the preview URL pattern Supabase allows for your Vercel team/account.
4. Save the settings, then send a new password reset email. Old reset links can stay broken or expire; use the newest email.

For local testing, use the local app origin that is actually running. For the live app, use the Vercel production URL instead of `http://localhost:3000`.

## Add Supabase users to the shared workspace

If Supabase login succeeds but the app says the user is not an active member of a LaunchFlow workspace, add that Auth user to `workspace_members`.

For Ruben's current Auth user, run `supabase/schema/004_add_ruben_workspace_member.sql` in the Supabase SQL Editor. This adds `ruben@cartandcard.com` to the shared workspace as an active `user`. Change the script role to `admin` or `viewer` before running if that user should have a different access level.

## Supabase email rate limit note

If Supabase shows `email rate limit exceeded` when sending a password reset, the user does **not** need to register again. Supabase has temporarily blocked additional auth emails for the project.

Beginner-safe options:

1. Wait for the rate limit window to reset, then send one new password recovery email.
2. Avoid repeatedly clicking resend; each attempt can continue to count against the limit.
3. For production, configure a custom SMTP provider in Supabase so password reset and invite emails are sent through the project's own email service instead of Supabase's default limited email service.

After changing Site URL / Redirect URLs or waiting for the email limit to reset, send a fresh password reset email. Do not reuse an old reset link.

## Supabase login wiring

The login form now tries Supabase Auth first. If Supabase rejects the email/password, the app falls back to the old local prototype credentials only as a temporary safety net.

The Forgot password link now asks Supabase to send the reset email. Reset links must point back to the app URL so the app can prompt for the new password.
