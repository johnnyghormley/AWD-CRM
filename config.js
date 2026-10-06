// Supabase project settings (Project Settings → API in Supabase).
// The "anon public" key is designed to be used in browser code; the database's
// security rules (setup.sql) block everything unless you're signed in.
// NEVER put the "service_role" key here.
window.AWD_CONFIG = {
  SUPABASE_URL: "PASTE_PROJECT_URL_HERE",
  SUPABASE_ANON_KEY: "PASTE_ANON_PUBLIC_KEY_HERE"
};
