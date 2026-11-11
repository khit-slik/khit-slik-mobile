import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import AnimatedSplash from '../components/AnimatedSplash';
import AppDialog from '../components/AppDialog';
import GlobalReceiptCapturer from '../components/GlobalReceiptCapturer';
import Toast from '../components/Toast';
import { APP_FONTS } from '../fonts';
import { notificationService } from '../services/notificationService';
import { printerService } from '../services/printerService';
import { useAuthStore } from '../store/authStore';

// Keep the native splash up until AnimatedSplash is drawn and takes over
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Not awaited: screens render at once; receipts printed later pick the font up
  useFonts(APP_FONTS);

  // Restore saved token and printer preferences, then reconnect to the saved printer
  useEffect(() => {
    useAuthStore.getState().hydrate();
    printerService
      .loadSavedConfig()
      .then(() => printerService.ensureConnected())
      .catch(() => {});
  }, []);

  // Low-stock notifications: channels, permission, and opening the notification page on tap
  useEffect(() => {
    notificationService.init();
    const subscription = notificationService.listenForTaps();
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* fade_from_bottom on every phone instead of each maker's default; the web app's page
          transition (Autoshop-Frontend index.css) copies its timing so the two feel the same */}
      <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="printer" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="notification-settings" />
        <Stack.Screen name="pos/index" />
        {/* Popups over the product grid, which stays visible (dimmed) underneath */}
        <Stack.Screen name="pos/checkout" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen
          name="pos/success"
          options={{ presentation: 'transparentModal', animation: 'fade', gestureEnabled: false }}
        />
        {/* Editing a saved order: the same grid and popups, on a cart of its own.
            No swipe back, so the changes are only dropped through the leave prompt. */}
        <Stack.Screen name="order-edit/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="order-edit/checkout" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen
          name="order-edit/success"
          options={{ presentation: 'transparentModal', animation: 'fade', gestureEnabled: false }}
        />
        {/* Pre-orders: the POS grid and popups on a pre-order form of their own, new and edit */}
        <Stack.Screen name="pre-order/index" />
        <Stack.Screen name="pre-order/checkout" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen
          name="pre-order/success"
          options={{ presentation: 'transparentModal', animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen name="pre-order-edit/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen
          name="pre-order-edit/checkout"
          options={{ presentation: 'transparentModal', animation: 'fade' }}
        />
        <Stack.Screen
          name="pre-order-edit/success"
          options={{ presentation: 'transparentModal', animation: 'fade', gestureEnabled: false }}
        />
      </Stack>
      <AnimatedSplash />
      <Toast />
      <AppDialog />

      {/* Draws receipts off screen for image-mode printing, from any screen */}
      <GlobalReceiptCapturer />
    </SafeAreaProvider>
  );
}
