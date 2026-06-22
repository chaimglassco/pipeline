const SUPABASE_URL = "https://yeluzxsjgdtzccmekbha.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllbHV6eHNqZ2R0emNjbWVrYmhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2ODc4MTcsImV4cCI6MjA5NzI2MzgxN30.RAAtSTAuYhvEWKw-1w19WDwHnDEnFFVY27aVKR6MA64";

let supabaseClient = null;

export function getSupabaseConfig() {
  return {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  };
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function createSupabaseClient(createClient) {
  if (!isSupabaseConfigured() || typeof createClient !== "function") return null;
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseClient;
}

export function resetSupabaseClientForTests() {
  supabaseClient = null;
}
