# Supabase Setup Notes

This project is now configured with the public Supabase project URL and anon key supplied by the project owner.

## Current Supabase project

- Project URL: `https://yeluzxsjgdtzccmekbha.supabase.co`
- Public anon key: configured in `js/supabaseClient.js`

The anon key is intended for browser use. Do not commit or paste the Supabase `service_role` key into the frontend.

## Current implementation step

The app now has a reusable Supabase configuration/client helper, but the existing login and data storage are still local-only. This keeps the first step safe and reversible. The helper accepts Supabase's `createClient` function once we add the browser client library in the next implementation step.

## Next setup step

Create the first Supabase database tables and Row Level Security policies before moving app data from localStorage.

Recommended first tables:

1. `profiles` — one row per authenticated user.
2. `workspaces` — one shared workspace for the team.
3. `workspace_members` — connects users to the workspace with roles.

After those tables exist, the app can replace the prototype local login with Supabase Auth and load the signed-in user's workspace membership.
