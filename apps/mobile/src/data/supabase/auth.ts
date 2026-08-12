import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import type { SupabaseClient } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

/**
 * Uses the generic OAuth web-redirect flow (`signInWithOAuth` + WebBrowser),
 * not `@react-native-google-signin/google-signin`'s native Credential
 * Manager flow. The native package needs its own config plugin and a custom
 * dev client build to even load (same class of problem as CloudKit — see
 * docs/architecture.md §5 history); this flow is plain JS + expo-web-browser
 * (already an Expo SDK module) and works the same in Expo Go and in a
 * production build.
 */
function parseTokensFromRedirectUrl(url: string): { accessToken: string; refreshToken: string } | null {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const paramsString = hashIndex >= 0 ? url.slice(hashIndex + 1) : queryIndex >= 0 ? url.slice(queryIndex + 1) : "";
  if (!paramsString) return null;
  const params = new URLSearchParams(paramsString);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

/**
 * Web-only fallback for when the OAuth redirect lands as a normal top-level
 * navigation instead of inside a popup `openAuthSessionAsync` can talk to —
 * e.g. the app was opened from the iOS home-screen icon (standalone display
 * mode), where `window.open` doesn't create a postMessage-able popup and
 * instead just navigates the single WKWebView away and back. In that case
 * `signInWithGoogle`'s own `setSession` call never runs (its whole call
 * stack got replaced by the fresh page load), but the tokens are still
 * sitting in this page's own URL — so `auth-callback.tsx` calls this on
 * mount to pick them up directly.
 */
export async function completeWebRedirectSignIn(supabase: SupabaseClient): Promise<void> {
  const tokens = parseTokensFromRedirectUrl(window.location.href);
  if (!tokens) return;
  const { error } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (error) throw error;
}

export async function signInWithGoogle(supabase: SupabaseClient): Promise<void> {
  const redirectTo = Linking.createURL("auth-callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Google 로그인 URL을 받아오지 못했습니다.");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) {
    throw new Error("로그인이 취소되었습니다.");
  }

  const tokens = parseTokensFromRedirectUrl(result.url);
  if (!tokens) throw new Error("로그인 응답에서 토큰을 찾지 못했습니다.");

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (sessionError) throw sessionError;
}

export async function signOutSupabase(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut();
}
