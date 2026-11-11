import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import PosAuthGate from '../../features/pos/components/PosAuthGate';
import PosCatalog from '../../features/pos/components/PosCatalog';
import { loadOrderForEdit } from '../../features/pos/loadOrderForEdit';
import { goBackOr } from '../../features/pos/navigation';
import { colors } from '../../features/pos/theme';
import { ORDER_EDIT_TUTORIALS } from '../../features/tutorials/tutorialVideos';
import { CartStoreContext, useOrderEditCartStore } from '../../store/cartStore';
import { dialog } from '../../store/dialogStore';
import { toast } from '../../store/toastStore';

// Back to the web page the edit was opened from, dropping the changes
const leave = () => {
  useOrderEditCartStore.getState().reset();
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

export default function OrderEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PosAuthGate>
      <CartStoreContext.Provider value={useOrderEditCartStore}>
        <OrderEdit key={id} orderId={id} />
      </CartStoreContext.Provider>
    </PosAuthGate>
  );
}

function OrderEdit({ orderId }: { orderId: string }) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const orderNumber = useOrderEditCartStore((state) => state.editingOrder?.orderNumber);

  useEffect(() => {
    let cancelled = false;
    loadOrderForEdit(orderId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoad({ status: 'failed', message: result.message });
        return;
      }
      useOrderEditCartStore.getState().startEdit(result.draft);
      if (result.missingLines > 0) {
        toast.error(`ဖျက်ထားသော ပစ္စည်း ${result.missingLines} ခုကို ဘောင်ချာမှ ဖယ်ထားပါသည်`);
      }
      setLoad({ status: 'ready' });
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, attempt]);

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
        <Text style={styles.message}>ဘောင်ချာ အချက်အလက်များ ရယူနေပါသည်...</Text>
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
    <PosCatalog
      navTitle="ဘောင်ချာ ပြင်ဆင်မယ်"
      navSubtitle="Edit Order (POS)"
      pageTitle="Edit Voucher"
      pageSubtitle={`ဘောင်ချာ ${orderNumber || ''} ၏ ပစ္စည်းများကို ပြင်ဆင်ပါ`}
      onBack={confirmLeave}
      onCheckout={() => router.push('/order-edit/checkout')}
      tutorials={ORDER_EDIT_TUTORIALS}
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
