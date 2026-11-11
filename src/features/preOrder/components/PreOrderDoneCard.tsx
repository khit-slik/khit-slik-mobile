import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { getErrorMessage } from '../../../services/api/client';
import type { SavedPreOrder } from '../../../store/preOrderStore';
import { usePrinterStore } from '../../../store/printerStore';
import { colors, formatMMK, TABLET_MIN_WIDTH } from '../../pos/theme';
import { printPreOrder } from '../printPreOrder';

type PrintStatus = 'idle' | 'printing' | 'printed' | 'failed';

interface Props {
  saved: SavedPreOrder;
  title: string;
  subtitle: string;
  // Close the popup
  onExit: () => void;
  // Show the web pre-order list
  onViewList: () => void;
}

// Result of a saved pre-order, over the product grid. Printing the voucher is up to the cashier.
export default function PreOrderDoneCard({ saved, title, subtitle, onExit, onViewList }: Props) {
  const { order, totals, customer } = saved;
  const expected = order.expectedDate ? String(order.expectedDate).slice(0, 10) : '';

  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;

  const connectedPrinter = usePrinterStore((state) => state.connectedPrinter);
  const [printStatus, setPrintStatus] = useState<PrintStatus>('idle');
  const [printError, setPrintError] = useState('');
  // Set when printing failed for want of a printer: print on return from the printer page, if connected
  const printAfterSettingsRef = useRef(false);

  const runPrint = useCallback(async () => {
    setPrintStatus('printing');
    try {
      await printPreOrder(saved);
      setPrintStatus('printed');
      setPrintError('');
    } catch (err) {
      setPrintStatus('failed');
      if (usePrinterStore.getState().connectedPrinter) {
        setPrintError(getErrorMessage(err, 'ပုံနှိပ်၍ မရပါ'));
      } else {
        setPrintError('ပရင်တာ မချိတ်ရသေးပါ။ ချိတ်ပြီးရင် အလိုလို ထုတ်ပေးပါမယ်။');
        printAfterSettingsRef.current = true;
        router.push('/printer');
      }
    }
  }, [saved]);

  useFocusEffect(
    useCallback(() => {
      if (!printAfterSettingsRef.current) return;
      printAfterSettingsRef.current = false;
      if (usePrinterStore.getState().connectedPrinter) runPrint();
    }, [runPrint]),
  );

  const printing = printStatus === 'printing';
  const printLabel =
    printStatus === 'printed' ? 'ထပ်ထုတ်မယ်' : printStatus === 'failed' ? 'ပြန်ကြိုးစားမယ်' : 'ဘောင်ချာထုတ်မယ်';

  return (
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
            <Row label="Pre-order အမှတ်" value={order.orderNumber || order._id} valueStyle={styles.invoice} />
            {customer && <Row label="ဝယ်သူ" value={customer.name} />}
            {!!expected && <Row label="ပစ္စည်းရမယ့်ရက်" value={expected} />}
            <View style={styles.divider} />
            <Row label="ကျသင့်ငွေ" value={formatMMK(totals.total)} valueStyle={styles.total} />
            <Row label={saved.isEdit ? 'ပေးပြီးငွေ' : 'စရံငွေ'} value={formatMMK(totals.paid)} valueStyle={styles.paid} />
            <Row
              label="ကျန်ငွေ"
              value={formatMMK(Math.max(0, totals.balance))}
              valueStyle={totals.balance > 0 ? styles.due : styles.paid}
            />
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
              onPress={runPrint}
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

          <TouchableOpacity onPress={onViewList} style={styles.listLink} hitSlop={8}>
            <Text style={styles.link}>Pre-order စာရင်း ကြည့်မယ်</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.primary} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, valueStyle }: { label: string; value: string; valueStyle?: object }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueStyle]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxHeight: '90%',
    borderRadius: 24,
    backgroundColor: colors.background,
    overflow: 'hidden',
    elevation: 12,
  },
  body: {
    padding: 20,
    gap: 16,
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
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 19,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  rowValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  invoice: {
    color: colors.primary,
  },
  total: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
  },
  paid: {
    color: colors.success,
  },
  due: {
    fontWeight: '800',
    color: colors.warning,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
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
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  printedText: {
    fontSize: 13,
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
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBusy: {
    opacity: 0.7,
  },
  printText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  listLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
});
