import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Redirect } from 'expo-router';

import { getConfiguredSupabaseClient } from '@/composition/container';
import { completeWebRedirectSignIn } from '@/data/supabase/auth';

/**
 * Target of the OAuth redirect (`Linking.createURL("auth-callback")` in
 * data/supabase/auth.ts). On native, `WebBrowser.openAuthSessionAsync` reads
 * the tokens off this URL directly without needing this screen to do
 * anything else — Expo Router still needs a route here so the incoming deep
 * link doesn't hit Router's "Unmatched Route" screen, but this screen itself
 * can just bounce back into the app.
 *
 * On web, that popup-based flow only works when `window.open` actually
 * yields a postMessage-able popup — which it doesn't when the app is
 * running as an installed standalone PWA (home-screen icon on iOS), where
 * `window.open` just navigates the single WKWebView away and back instead.
 * `completeWebRedirectSignIn` is the fallback for that case: it parses the
 * tokens straight off this page's own URL and sets the session directly.
 */
export default function AuthCallbackScreen() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    void completeWebRedirectSignIn(getConfiguredSupabaseClient());
  }, []);

  return <Redirect href="/(tabs)" />;
}
