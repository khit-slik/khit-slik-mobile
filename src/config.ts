// Override with EXPO_PUBLIC_WEB_APP_URL while developing, so the WebView and the native POS
// screens log in to and read from the same backend (a token from one backend is rejected by another).
export const WEB_APP_URL = (
  process.env.EXPO_PUBLIC_WEB_APP_URL || 'https://khit-slik-frontend.pages.dev'
).replace(/\/+$/, '');

// Override per build with EXPO_PUBLIC_API_BASE_URL (e.g. a local backend while developing).
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  '' // TODO: khit-slik production backend URL (e.g. 'https://<khit-slik-backend>/api/v1')
).replace(/\/+$/, '');

export const API_TIMEOUT_MS = 20000;

// Send the web app's /pos (new sale) and order edit routes to the native POS screens.
// On unless EXPO_PUBLIC_NATIVE_POS is "0": `eas update` bundles don't get the build profile's env,
// so an update published without the variable must not switch the native POS off.
export const NATIVE_POS_ENABLED = process.env.EXPO_PUBLIC_NATIVE_POS !== '0';
