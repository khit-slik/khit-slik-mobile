import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import PosAuthGate from '../../features/pos/components/PosAuthGate';
import { goBackOr } from '../../features/pos/navigation';
import { colors } from '../../features/pos/theme';
import PreOrderCatalog from '../../features/preOrder/components/PreOrderCatalog';
import { loadPreOrderForEdit } from '../../features/preOrder/loadPreOrderForEdit';
import { dialog } from '../../store/dialogStore';
import { PreOrderStoreContext, usePreOrderEditStore } from '../../store/preOrderStore';

// Back to the web page the edit was opened from, dropping the changes
const leave = () => {
  usePreOrderEditStore.getState().reset();
  goBackOr('/');
};

const confirmLeave = () => {
  dialog.confirm({
    title: 'ပြင်ဆင်မှု ပယ်ဖျက်မည်',
    message: 'ပြင်ဆင်ထားတာတွေကို မသိမ်းဘဲ ထွက်မှာ သေချာပါသလား?',
    cancelText: 'ဆက်ပြင်မယ်',
    confirmText: 'ထွက်မည်',
    tone: 'danger',
    onConfirm: leave,
  });
};

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'failed'; message: string };

export default function PreOrderEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PosAuthGate>
      <PreOrderStoreContext.Provider value={usePreOrderEditStore}>
        <PreOrderEdit key={id} preOrderId={id} />
      </PreOrderStoreContext.Provider>
    </PosAuthGate>
  );
}

function PreOrderEdit({ preOrderId }: { preOrderId: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const orderNumber = usePreOrderEditStore((state) => state.editing?.order.orderNumber);

  useEffect(() => {
    let cancelled = false;
    loadPreOrderForEdit(preOrderId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoad({ status: 'failed', message: result.message });
        return;
      }
      usePreOrderEditStore.getState().startEdit(result.order, result.draft);
      setLoad({ status: 'ready' });
    });
    return () => {
      cancelled = true;
    };
  }, [preOrderId, attempt]);

  // Android back asks first, like the back button, so changes aren't dropped by accident
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        confirmLeave();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );

  const retry = () => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  if (load.status === 'loading') {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.message}>Pre-order အချက်အလက်များ ရယူနေပါသည်...</Text>
      </SafeAreaView>
    );
  }

  if (load.status === 'failed') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.error}>{load.message}</Text>
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.secondaryButton} onPress={leave}>
            <Text style={styles.secondaryText}>ပြန်ထွက်မယ်</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={retry}>
            <Text style={styles.primaryText}>ပြန်ကြိုးစားမယ်</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <PreOrderCatalog
      navTitle="Pre-order ပြင်ဆင်မယ်"
      navSubtitle="Edit pre-order"
      pageTitle="Pre-order ပြင်ဆင်ခြင်း"
      pageSubtitle={`Pre-order ${orderNumber || ''} ၏ ပစ္စည်းများကို ပြင်ဆင်ပါ`}
      onBack={confirmLeave}
      onCheckout={() => router.push('/pre-order-edit/checkout')}
    />
  );
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
  message: {
    fontSize: 14,
    color: colors.textMuted,
  },
  error: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.danger,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  secondaryText: {
    color: colors.primary,
    fontWeight: '700',
  },
  primaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
