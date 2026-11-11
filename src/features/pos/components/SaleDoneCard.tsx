import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { getErrorMessage } from '../../../services/api/client';
import type { CompletedSale } from '../../../store/cartStore';
import { usePrinterStore } from '../../../store/printerStore';
import { getChangeAmount, getPaymentLabel, isFoc } from '../lib';
import { printSale } from '../printSale';
import { colors, formatMMK, TABLET_MIN_WIDTH } from '../theme';

type PrintStatus = 'idle' | 'printing' | 'printed' | 'failed';

// Saves already auto-printed, so coming back to this screen doesn't print them again.
// Keyed by save, not order: an edited order prints again.
const autoPrintedSaves = new Set<string>();

type PrintOutcome = { ok: true } | { ok: false; message: string; needsPrinter: boolean };

const attemptPrint = async (sale: CompletedSale): Promise<PrintOutcome> => {
  try {
    await printSale(sale);
    return { ok: true };
  } catch (err) {
    if (usePrinterStore.getState().connectedPrinter) {
      return { ok: false, message: getErrorMessage(err, 'ပုံနှိပ်၍ မရပါ'), needsPrinter: false };
    }
    return {
      ok: false,
      message: 'ပရင်တာ မချိတ်ရသေးပါ။ ချိတ်ပြီးရင် အလိုလို ထုတ်ပေးပါမယ်။',
      needsPrinter: true,
    };
  }
};

interface Props {
  sale: CompletedSale;
  title: string;
  subtitle: string;
  // Close the popup
  onExit: () => void;
  // Show the web orders list
  onViewOrders: () => void;
}

// Result of a saved order with its receipt printing, shown over the product grid
export default function SaleDoneCard({ sale, title, subtitle, onExit, onViewOrders }: Props) {
  const { order, totals, paymentType, paymentMethod, paidAmount, customer } = sale;
  const invoiceNumber = order.orderNumber || order._id;
  const foc = isFoc(paymentMethod);
  const change = paymentType === 'paid' && !foc ? getChangeAmount(paidAmount, totals.total) : 0;
  const due = paymentType === 'credit' ? Math.max(0, totals.total - paidAmount) : 0;

  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;

  const autoPrint = usePrinterStore((state) => state.autoPrint);
  const connectedPrinter = usePrinterStore((state) => state.connectedPrinter);
  const saveKey = `${order._id}:${sale.completedAt}`;
  const shouldAutoPrint = autoPrint && !autoPrintedSaves.has(saveKey);
  const [printStatus, setPrintStatus] = useState<PrintStatus>(shouldAutoPrint ? 'printing' : 'idle');
  const [printError, setPrintError] = useState('');
  // Set when printing failed for want of a printer: print on return from the printer page, if connected
  const printAfterSettingsRef = useRef(false);

  const applyOutcome = useCallback((outcome: PrintOutcome) => {
    setPrintStatus(outcome.ok ? 'printed' : 'failed');
    setPrintError(outcome.ok ? '' : outcome.message);
    if (!outcome.ok && outcome.needsPrinter) {
      printAfterSettingsRef.current = true;
      router.push('/printer');
    }
  }, []);

  const runPrint = useCallback(() => {
    attemptPrint(sale).then(applyOutcome);
  }, [sale, applyOutcome]);

  useEffect(() => {
    if (!shouldAutoPrint) return;
    autoPrintedSaves.add(saveKey);
    attemptPrint(sale).then(applyOutcome);
  }, [shouldAutoPrint, saveKey, sale, applyOutcome]);

  useFocusEffect(
    useCallback(() => {
      if (!printAfterSettingsRef.current) return;
      printAfterSettingsRef.current = false;
      if (!usePrinterStore.getState().connectedPrinter) return;
      setPrintStatus('printing');
      runPrint();
    }, [runPrint]),
  );

  const handlePrint = () => {
    setPrintStatus('printing');
    runPrint();
  };

  const printing = printStatus === 'printing';
  const printLabel =
    printStatus === 'printed' ? 'ထပ်ထုတ်မယ်' : printStatus === 'failed' ? 'ပြန်ကြိုးစားမယ်' : 'Print ထုတ်မယ်';

  return (
    // No tap-outside close here: the receipt may still need printing
    <SafeAreaView style={styles.overlay} edges={['top', 'bottom', 'left', 'right']}>
      <View style={[styles.card, { maxWidth: isTablet ? 540 : '95%' }]}>
        <ScrollView contentContainerStyle={styles.body} bounces={false}>
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark" size={32} color={colors.success} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
          </View>

          <View style={styles.details}>
            <Row label="ဘောင်ချာ အမှတ်" value={invoiceNumber} valueStyle={styles.invoice} />
            <View style={styles.divider} />
            <Row label="စုစုပေါင်း ကျသင့်ငွေ" value={formatMMK(totals.total)} valueStyle={styles.total} />
            <Row label="ပေးချေမှု" value={getPaymentLabel(sale)} />
            {!foc && <Row label="ပေးချေသောငွေ" value={formatMMK(paidAmount)} valueStyle={styles.paid} />}
            {due > 0 && (
              <Row label="ကျန်ငွေ (အကြွေး)" value={formatMMK(due)} labelStyle={styles.dueLabel} valueStyle={styles.due} />
            )}
            {change > 0 && <Row label="ပြန်အမ်းငွေ" value={formatMMK(change)} valueStyle={styles.change} />}
            {customer && <Row label="ဝယ်သူ" value={customer.name} />}
          </View>

          <View style={styles.printStatusRow}>
            <View style={styles.printerInfo}>
              <Ionicons name="print-outline" size={16} color={colors.textMuted} />
              <Text style={styles.printerName} numberOfLines={1}>
                {connectedPrinter ? connectedPrinter.name || connectedPrinter.address : 'ပရင်တာ မချိတ်ရသေးပါ'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/printer')} hitSlop={8}>
              <Text style={styles.link}>Settings</Text>
            </TouchableOpacity>
          </View>
          {printStatus === 'printed' && <Text style={styles.printedText}>ပုံနှိပ်ပြီးပါပြီ</Text>}
          {printStatus === 'failed' && !!printError && <Text style={styles.printErrorText}>{printError}</Text>}

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.exitButton} onPress={onExit} activeOpacity={0.8}>
              <Text style={styles.exitText}>ပြန်ထွက်မယ်</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printButton, printing && styles.buttonBusy]}
              onPress={handlePrint}
              disabled={printing}
              activeOpacity={0.85}
            >
              {printing ? (
                <>
                  <ActivityIndicator color="#ffffff" />
                  <Text style={styles.printText}>ပုံနှိပ်နေပါသည်...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="print-outline" size={18} color="#ffffff" />
                  <Text style={styles.printText}>{printLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onViewOrders} style={styles.ordersLink} hitSlop={8}>
            <Text style={styles.link}>အော်ဒါများ ကြည့်မယ်</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.primary} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  labelStyle,
  valueStyle,
}: {
  label: string;
  value: string;
  labelStyle?: object;
  valueStyle?: object;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, labelStyle]}>{label}</Text>
      <Text style={[styles.rowValue, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Dimmed product grid shows through around the card
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  card: {
    width: '100%',
    maxHeight: '92%',
    borderRadius: 24,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  body: {
    padding: 20,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.success,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  details: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.background,
    gap: 10,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  invoice: {
    fontWeight: '700',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  total: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  paid: {
    fontWeight: '700',
    color: colors.success,
  },
  dueLabel: {
    color: colors.danger,
  },
  due: {
    fontWeight: '700',
    color: colors.danger,
  },
  change: {
    fontWeight: '700',
    color: colors.warning,
  },
  printStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  printerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  printerName: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
  },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  printedText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
    textAlign: 'center',
  },
  printErrorText: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  exitButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  exitText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  printButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  buttonBusy: {
    opacity: 0.7,
  },
  printText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  ordersLink: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
});
