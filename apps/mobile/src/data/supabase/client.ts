import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: { url: string; anonKey: string; client: SupabaseClient } | null = null;

/**
 * One client per (url, anonKey) pair — rebuilt only when the Developer
 * settings change, otherwise reused so Supabase's own auth-session listeners
 * aren't torn down and recreated on every render. Session persistence uses
 * AsyncStorage (not expo-secure-store): Supabase's session payload routinely
 * exceeds SecureStore's ~2048-byte per-item limit on iOS Keychain/Android
 * Keystore, which throws/truncates. AsyncStorage has no such cap — the
 * standard tradeoff every Supabase+Expo guide makes (session token at rest
 * unencrypted-on-disk vs. hitting the size limit).
 */
export function getSupabaseClient(url: string, anonKey: string): SupabaseClient {
  if (cached && cached.url === url && cached.anonKey === anonKey) return cached.client;
  const client = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  cached = { url, anonKey, client };
  return client;
}
