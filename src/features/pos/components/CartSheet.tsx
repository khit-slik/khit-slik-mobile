import React from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useCart, useCartTotals } from '../../../store/cartStore';
import { dialog } from '../../../store/dialogStore';
import { toast } from '../../../store/toastStore';
import { CART_ERROR_MESSAGES, CartError, CartItem, getAvailableStock, getSafeQty, getUnitPrice } from '../lib';
import { colors, formatMMK, formatNumber } from '../theme';
import BottomSheet from './BottomSheet';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

const showError = (error: CartError | undefined) => {
  if (error) toast.error(CART_ERROR_MESSAGES[error]);
};

function CartRow({ item }: { item: CartItem }) {
  const changeQty = useCart((state) => state.changeQty);
  const setQty = useCart((state) => state.setQty);
  const removeItem = useCart((state) => state.removeItem);
  const originalQuantities = useCart((state) => state.originalQuantities);

  const qty = getSafeQty(item.qty);
  const price = getUnitPrice(item.product, qty || 1);

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={2}>
          {item.product.productName}
        </Text>
        <Text style={styles.rowPrice}>
          {formatNumber(price)} × {qty} = <Text style={styles.rowLineTotal}>{formatMMK(price * qty)}</Text>
        </Text>
        <Text style={styles.rowStock}>လက်ကျန်: {formatNumber(getAvailableStock(item.product, originalQuantities))}</Text>
      </View>

      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepButton} onPress={() => showError(changeQty(item.product._id, -1))}>
          <Ionicons name="remove" size={18} color={colors.text} />
        </TouchableOpacity>
        <TextInput
          // Remount when the quantity changes elsewhere so the field shows the new value
          key={item.qty}
          style={styles.qtyInput}
          defaultValue={String(item.qty)}
          keyboardType="number-pad"
          selectTextOnFocus
          onEndEditing={(e) => showError(setQty(item.product._id, parseInt(e.nativeEvent.text, 10) || 1))}
        />
        <TouchableOpacity style={styles.stepButton} onPress={() => showError(changeQty(item.product._id, 1))}>
          <Ionicons name="add" size={18} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.removeButton} onPress={() => removeItem(item.product._id)} hitSlop={6}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CartSheet({ visible, onClose, onCheckout }: Props) {
  const items = useCart((state) => state.items);
  const clearItems = useCart((state) => state.clearItems);
  const totals = useCartTotals();

  const confirmClearAll = () => {
    dialog.confirm({
      title: 'ခြင်းတောင်း ရှင်းလင်းမည်',
      message: 'ခြင်းတောင်းထဲရှိ ပစ္စည်းအားလုံးကို ဖယ်ရှားမှာ သေချာပါသလား?',
      confirmText: 'အားလုံးဖျက်မည်',
      tone: 'danger',
      onConfirm: clearItems,
    });
  };

  return (
    <BottomSheet
      visible={visible}
      title="ရွေးထားတဲ့ ပစ္စည်းစာရင်း"
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
            <Text style={styles.checkoutText}>ငွေရှင်းမယ်</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <FlatList
        data={items}
        keyExtractor={(item) => item.product._id}
        renderItem={({ item }) => <CartRow item={item} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>လက်တလော ရွေးချယ်ထားတဲ့ပစ္စည်းများ မရှိသေးပါ</Text>
        }
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  rowPrice: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  rowLineTotal: {
    fontWeight: '700',
    color: colors.primary,
  },
  rowStock: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 2,
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
  stepText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  qtyInput: {
    width: 44,
    paddingVertical: 4,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  divider: {
    width: 1,
    height: 22,
    marginHorizontal: 2,
    backgroundColor: colors.border,
  },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    fontSize: 16,
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
