import { router } from 'expo-router';

import { webBridge } from '../../services/webBridge';

// Close the native screens and show this page of the web app underneath
export const showWebPage = (path: string) => {
  webBridge.navigate(path);
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
};

// The token is missing or was rejected (401), so send the user to the web login under this screen
export const goToWebLogin = () => showWebPage('/login');

// Back to the previous screen, or to `fallback` when opened from a deep link with nothing behind it
export const goBackOr = (fallback: '/' | '/pos') => {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
};
