/**
 * Fixed project this app syncs to — every install (including friends' phones)
 * shares this one Supabase project. Safe to commit: the anon key is designed
 * by Supabase to be public (access control is RLS, not this key) — see
 * docs/architecture.md §5-2/§5-4. Never put the service_role key here.
 */
export const SUPABASE_URL = "https://bubqchiykuajukmtsjno.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1YnFjaGl5a3VhanVrbXRzam5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNzk1NzUsImV4cCI6MjEwMTk1NTU3NX0.yjoLqbdWEku3bzUOskO9AZ0OvsAfSD1gx2mO6Xlt-9Q";
