import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '../../../store/authStore';
import { goToWebLogin } from '../navigation';
import { colors } from '../theme';

// Shows its children once a saved token is restored; otherwise a spinner, or a way to the web login
export default function PosAuthGate({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const isHydrated = useAuthStore((state) => state.isHydrated);

  if (!isHydrated) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.loginText}>Login မဝင်ရသေးပါ။ Web app မှာ login အရင်ဝင်ပါ။</Text>
        <TouchableOpacity onPress={goToWebLogin} style={styles.loginButton}>
          <Text style={styles.loginButtonText}>Login ဝင်မယ်</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  loginText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.danger,
    textAlign: 'center',
  },
  loginButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  loginButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
