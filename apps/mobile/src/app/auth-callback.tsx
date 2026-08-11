import { Redirect } from 'expo-router';

/**
 * Target of the OAuth redirect (`Linking.createURL("auth-callback")` in
 * data/supabase/auth.ts). `WebBrowser.openAuthSessionAsync` reads the tokens
 * off this URL directly without needing this screen to render anything, but
 * Expo Router still dispatches the incoming deep link to whatever route
 * matches its path — without a route here, that dispatch hits Router's
 * "Unmatched Route" screen instead of bouncing back into the app.
 */
export default function AuthCallbackScreen() {
  return <Redirect href="/(tabs)" />;
}
