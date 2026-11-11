import React from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { dialog } from '../../../store/dialogStore';
import { usePreOrder, usePreOrderTotals } from '../../../store/preOrderStore';
import BottomSheet from '../../pos/components/BottomSheet';
import { colors, formatMMK, formatNumber } from '../../pos/theme';
import { getPreOrderStock, PreOrderItem } from '../lib';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

const digitsOnly = (text: string) => Number(text.replace(/[^0-9]/g, '')) || 0;

function PreOrderRow({ item }: { item: PreOrderItem }) {
  const changeQty = usePreOrder((state) => state.changeQty);
  const setQty = usePreOrder((state) => state.setQty);
  const setPrice = usePreOrder((state) => state.setPrice);
  const removeItem = usePreOrder((state) => state.removeItem);

  const id = item.product._id;
  const stock = getPreOrderStock(item);
  const short = item.qty > stock;

  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={2}>
            {item.product.productName}
          </Text>
          <Text style={[styles.rowStock, short && styles.rowShort]}>
            လက်ကျန် {formatNumber(stock)}
            {short ? ` · ${formatNumber(item.qty - stock)} ခု မှာရန်` : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.removeButton} onPress={() => removeItem(id)} hitSlop={6}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <View style={styles.rowBottom}>
        <View style={styles.priceField}>
          <Text style={styles.priceLabel}>ဈေးနှုန်း</Text>
          <TextInput
            // Remount when the price changes elsewhere (a wholesale tier reached) so it shows the new value
            key={`${item.unitPrice}:${item.priceEdited}`}
            style={styles.priceInput}
            defaultValue={String(item.unitPrice)}
            keyboardType="number-pad"
            selectTextOnFocus
            onEndEditing={(e) => {
              const price = digitsOnly(e.nativeEvent.text);
              if (price !== item.unitPrice) setPrice(id, price);
            }}
          />
        </View>

        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepButton} onPress={() => changeQty(id, -1)}>
            <Ionicons name="remove" size={18} color={colors.text} />
          </TouchableOpacity>
          <TextInput
            key={item.qty}
            style={styles.qtyInput}
            defaultValue={String(item.qty)}
            keyboardType="number-pad"
            selectTextOnFocus
            onEndEditing={(e) => setQty(id, parseInt(e.nativeEvent.text, 10) || 1)}
          />
          <TouchableOpacity style={styles.stepButton} onPress={() => changeQty(id, 1)}>
            <Ionicons name="add" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.lineTotal}>
        {formatNumber(item.unitPrice)} × {item.qty} = <Text style={styles.lineTotalValue}>{formatMMK(item.unitPrice * item.qty)}</Text>
      </Text>
    </View>
  );
}

// The pre-order's lines: quantity without a stock limit, and a price the cashier can change
export default function PreOrderCartSheet({ visible, onClose, onCheckout }: Props) {
  const items = usePreOrder((state) => state.items);
  const clearItems = usePreOrder((state) => state.clearItems);
  const totals = usePreOrderTotals();

  const confirmClearAll = () => {
    dialog.confirm({
      title: 'ပစ္စည်းစာရင်း ရှင်းလင်းမည်',
      message: 'မှာမယ့် ပစ္စည်းအားလုံးကို ဖယ်ရှားမှာ သေချာပါသလား?',
      confirmText: 'အားလုံးဖျက်မည်',
      tone: 'danger',
      onConfirm: clearItems,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      title="မှာမယ့် ပစ္စည်းစာရင်း"
      onClose={onClose}
      headerRight={
        items.length > 0 ? (
          <TouchableOpacity style={styles.clearAll} onPress={confirmClearAll} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={14} color={colors.danger} />
            <Text style={styles.clearAllText}>အားလုံးဖျက်မည်</Text>
          </TouchableOpacity>
        ) : null
      }
      footer={
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text style={styles.footerCount}>ပစ္စည်းများ {formatNumber(totals.itemCount)} ခု</Text>
            <Text style={styles.footerTotal}>
              <Text style={styles.footerLabel}>စုစုပေါင်း : </Text>
              {formatMMK(totals.subtotal)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.checkoutButton, items.length === 0 && styles.checkoutDisabled]}
            onPress={onCheckout}
            disabled={items.length === 0}
            activeOpacity={0.85}
          >
            <Text style={styles.checkoutText}>Pre-order ဘောင်ချာ ဖွင့်မယ်</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <FlatList
        data={items}
        keyExtractor={(item) => item.product._id}
        renderItem={({ item }) => <PreOrderRow item={item} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>မှာမယ့် ပစ္စည်း မရှိသေးပါ</Text>}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  row: {
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  rowStock: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 3,
  },
  rowShort: {
    color: colors.warning,
    fontWeight: '700',
  },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  priceField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  priceLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  priceInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'right',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.background,
  },
  stepButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    width: 44,
    paddingVertical: 4,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  lineTotal: {
    fontSize: 12,
    color: colors.textMuted,
  },
  lineTotalValue: {
    fontWeight: '700',
    color: colors.primary,
  },
  clearAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.dangerSoft,
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  empty: {
    textAlign: 'center',
    color: colors.textFaint,
    paddingVertical: 40,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: 14,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerCount: {
    fontSize: 13,
    color: colors.textMuted,
  },
  footerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  footerTotal: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.primary,
  },
  checkoutButton: {
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  checkoutDisabled: {
    opacity: 0.5,
  },
  checkoutText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
