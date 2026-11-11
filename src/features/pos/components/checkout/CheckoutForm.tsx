import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { CreditPersona } from '../../../../services/pos/types';
import { PaymentOption, useCart, useCartTotals } from '../../../../store/cartStore';
import { toast } from '../../../../store/toastStore';
import { useCreditPersonas } from '../../hooks/usePosData';
import {
  CHECKOUT_ERROR_MESSAGES,
  CheckoutInput,
  getChangeAmount,
  isFoc,
  markupPercentOf,
  PriceMode,
  SELECTABLE_PAYMENT_METHODS,
  validateCheckout,
} from '../../lib';
import { colors, formatMMK, TABLET_MIN_WIDTH } from '../../theme';
import OrderDateField from '../OrderDateField';
import AddCustomerSheet from './AddCustomerSheet';
import CustomerPicker, { customerLabel } from './CustomerPicker';
import DiscountCalculatorSheet from './DiscountCalculatorSheet';
import OptionCard from './OptionCard';

const PAYMENT_OPTIONS: { id: PaymentOption; label: string }[] = [
  { id: 'paid', label: 'ပေးချေပြီး' },
  { id: 'credit', label: 'မပေးချေရသေး (အကြွေး)' },
  { id: 'foc', label: 'အခမဲ့ (FOC)' },
];

const PRICE_MODES: { id: PriceMode; label: string }[] = [
  { id: 'normal', label: 'ရိုးရိုးပေးချေမယ်' },
  { id: 'discount', label: 'လျှော့ဈေး (Discount)' },
  { id: 'markup', label: 'Mark Up' },
];

const digitsOnly = (text: string) => Number(text.replace(/[^0-9]/g, '')) || 0;

interface Props {
  title: string;
  submitLabel: string;
  // Saves the order. Returns the message to show when that failed; on success it moves on by itself.
  onSubmit: (input: CheckoutInput, customer: CreditPersona | null) => Promise<string | null>;
  // Back to the product grid under this popup
  onClose: () => void;
  // A customer to offer even when the list leaves them out (the edited order's, if blacklisted since)
  extraCustomer?: CreditPersona | null;
}

// The checkout popup over the product grid, for whichever cart CartStoreContext provides
export default function CheckoutForm({ title, submitLabel, onSubmit, onClose: close, extraCustomer }: Props) {
  const cart = useCart((state) => state);
  const totals = useCartTotals();
  const { personas: listed, isLoading: personasLoading, addPersona } = useCreditPersonas();
  const personas = useMemo(
    () => (extraCustomer && !listed.some((p) => p._id === extraCustomer._id) ? [extraCustomer, ...listed] : listed),
    [listed, extraCustomer],
  );

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  // Remounts the discount field when the calculator sets a value
  const [discountFieldKey, setDiscountFieldKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;

  const closeCheckout = cart.closeCheckout;
  useEffect(() => closeCheckout, [closeCheckout]);

  // Nothing to check out (e.g. the screen was restored after the cart was cleared): close the popup
  const isEmpty = cart.items.length === 0 && !isSubmitting;
  useEffect(() => {
    if (isEmpty) close();
  }, [isEmpty, close]);
  if (isEmpty) return null;

  const foc = isFoc(cart.paymentMethod);
  const selectedCustomer = personas.find((p) => p._id === cart.creditPersonId) ?? null;
  const activeOption: PaymentOption = foc ? 'foc' : cart.paymentType;

  const input: CheckoutInput = {
    items: cart.items,
    totals,
    paymentType: cart.paymentType,
    paymentMethod: cart.paymentMethod,
    paidAmount: cart.paidAmount,
    creditPersonId: cart.creditPersonId,
    note: cart.note,
    orderDate: cart.orderDate,
  };
  const validationError = validateCheckout(input);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (validationError) {
      toast.error(CHECKOUT_ERROR_MESSAGES[validationError]);
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    const errorMessage = await onSubmit(input, selectedCustomer);
    submittingRef.current = false;
    // On success the popup stays busy until it is replaced, so it doesn't close itself on the emptied cart
    if (errorMessage) {
      setIsSubmitting(false);
      toast.error(errorMessage);
    }
  };

  const handleAddNewCustomer = () => {
    setIsPickerOpen(false);
    // iOS can't present a modal while another is still closing
    setTimeout(() => setIsAddCustomerOpen(true), Platform.OS === 'ios' ? 350 : 0);
  };

  const handleCustomerCreated = (persona: CreditPersona) => {
    addPersona(persona);
    cart.setCreditPersonId(persona._id);
    setIsAddCustomerOpen(false);
  };

  return (
    <SafeAreaView style={styles.overlay} edges={['top', 'bottom', 'left', 'right']}>
      {/* Tapping outside the card closes it; the cart is kept */}
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={[styles.card, { maxWidth: isTablet ? 640 : '95%' }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.summaryPill}>
                ပစ္စည်းများ: {totals.itemCount} ခု | စုစုပေါင်း: {formatMMK(totals.subtotal)}
              </Text>
            </View>
            <TouchableOpacity onPress={close} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Section label="ပေးချေမှု အမျိုးအစား:">
              <View style={styles.optionGrid}>
                {PAYMENT_OPTIONS.map((option) => (
                  <OptionCard
                    key={option.id}
                    label={option.label}
                    active={activeOption === option.id}
                    onPress={() => cart.selectPaymentOption(option.id)}
                  />
                ))}
              </View>
            </Section>

            <Section label="ဘောင်ချာ ရက်စွဲ">
              <OrderDateField value={cart.orderDate} onChange={cart.setOrderDate} />
            </Section>

            <Section
              label="အကြွေးပေးသူ"
              hint={cart.paymentType === 'credit' ? undefined : '(မထည့်လည်းရ)'}
              required={cart.paymentType === 'credit'}
            >
              <View style={styles.customerRow}>
                <TouchableOpacity style={styles.customerField} onPress={() => setIsPickerOpen(true)}>
                  <Ionicons name="person-outline" size={18} color={colors.textMuted} />
                  <Text
                    style={[styles.customerText, !selectedCustomer && styles.placeholder]}
                    numberOfLines={1}
                  >
                    {selectedCustomer ? customerLabel(selectedCustomer) : 'အမည် သို့မဟုတ် ဖုန်းဖြင့် ရှာမယ်...'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                </TouchableOpacity>
                {!!cart.creditPersonId && (
                  <TouchableOpacity style={styles.clearCustomer} onPress={() => cart.setCreditPersonId('')}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
                {/* Straight to the new-customer form, as on the web and offline-pos checkouts */}
                <TouchableOpacity
                  style={styles.addCustomer}
                  onPress={() => setIsAddCustomerOpen(true)}
                  activeOpacity={0.85}
                  accessibilityLabel="အသစ်ထည့်မယ်"
                >
                  <Ionicons name="person-add-outline" size={17} color="#ffffff" />
                  {/* Phones keep the short label so the customer name still fits */}
                  <Text style={styles.addCustomerText}>{isTablet ? 'အသစ်ထည့်မယ်' : 'အသစ်'}</Text>
                </TouchableOpacity>
              </View>
            </Section>

            <Section label="ပေးချေမှု နည်းလမ်း:" note={foc ? 'FOC အတွက် ရွေးရန်မလိုပါ' : undefined}>
              <View style={styles.optionGrid}>
                {SELECTABLE_PAYMENT_METHODS.map((method) => (
                  <OptionCard
                    key={method.id}
                    label={method.label}
                    active={cart.paymentMethod === method.id}
                    disabled={foc}
                    onPress={() => cart.setPaymentMethod(method.id)}
                  />
                ))}
              </View>
            </Section>

            <Section
              label="ဈေးနှုန်း အမျိုးအစား:"
              note={foc ? 'FOC အတွက် လျှော့ဈေး သတ်မှတ်၍မရပါ' : undefined}
            >
              <View style={styles.optionGrid}>
                {PRICE_MODES.map((mode) => (
                  <OptionCard
                    key={mode.id}
                    label={mode.label}
                    active={cart.priceMode === mode.id}
                    disabled={foc}
                    onPress={() => cart.setPriceMode(mode.id)}
                  />
                ))}
              </View>
            </Section>

            {!foc && cart.priceMode === 'discount' && (
              <Section label="လျှော့ဈေး (%)">
                <View style={styles.inputRow}>
                  <TextInput
                    key={discountFieldKey}
                    style={[styles.input, styles.flex]}
                    defaultValue={cart.discountPercent ? String(Number(cart.discountPercent.toFixed(2))) : ''}
                    onChangeText={(text) => cart.setDiscountPercent(Math.min(100, Number(text) || 0))}
                    placeholder="0"
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity style={styles.calculatorButton} onPress={() => setIsCalculatorOpen(true)}>
                    <Ionicons name="calculator-outline" size={16} color={colors.primary} />
                    <Text style={styles.calculatorText}>MMK</Text>
                  </TouchableOpacity>
                </View>
              </Section>
            )}

            {!foc && cart.priceMode === 'markup' && (
              <Section
                label="Mark Up Amount (MMK)"
                note={
                  cart.markupAmount > 0
                    ? `${markupPercentOf(cart.markupAmount, totals.subtotal).toFixed(2)}%`
                    : undefined
                }
              >
                <TextInput
                  style={styles.input}
                  value={cart.markupAmount ? String(cart.markupAmount) : ''}
                  onChangeText={(text) => cart.setMarkupAmount(digitsOnly(text))}
                  placeholder="0"
                  keyboardType="number-pad"
                />
              </Section>
            )}

            <Section label="ပေးချေမှု ပမာဏ">
              <TextInput
                style={[styles.input, styles.paidInput, foc && styles.inputDisabled]}
                value={foc ? '0' : cart.paidAmount ? String(cart.paidAmount) : ''}
                onChangeText={(text) => cart.setPaidAmount(digitsOnly(text))}
                editable={!foc}
                placeholder={`ပမာဏ ရိုက်ထည့်ပါ (${formatMMK(totals.total)})`}
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
              />
            </Section>

            <View style={styles.summary}>
              <SummaryRow label="စုစုပေါင်း (Subtotal)" value={formatMMK(totals.subtotal)} />
              {totals.discountAmount > 0 && (
                <SummaryRow label="လျှော့ဈေး" value={`- ${formatMMK(totals.discountAmount)}`} />
              )}
              {totals.markupAmount > 0 && (
                <SummaryRow label="Mark Up" value={`+ ${formatMMK(totals.markupAmount)}`} />
              )}
              <SummaryRow label="ကျသင့်ငွေ" value={formatMMK(totals.total)} strong />
              {cart.paymentType === 'paid' && !foc && (
                <SummaryRow label="ပြန်အမ်းငွေ" value={formatMMK(getChangeAmount(cart.paidAmount, totals.total))} />
              )}
              {cart.paymentType === 'credit' && (
                <SummaryRow
                  label="ကျန်ငွေ (အကြွေး)"
                  value={formatMMK(Math.max(0, totals.total - cart.paidAmount))}
                />
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {validationError && validationError !== 'EMPTY_CART' && (
              <Text style={styles.validation}>{CHECKOUT_ERROR_MESSAGES[validationError]}</Text>
            )}
            <View style={styles.footerButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={close}>
                <Text style={styles.cancelText}>မလုပ်တော့ပါ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, (!!validationError || isSubmitting) && styles.saveDisabled]}
                onPress={handleSubmit}
                disabled={!!validationError || isSubmitting}
              >
                <Text style={styles.saveText}>{submitLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <CustomerPicker
        visible={isPickerOpen}
        personas={personas}
        isLoading={personasLoading}
        selectedId={cart.creditPersonId}
        onSelect={cart.setCreditPersonId}
        onAddNew={handleAddNewCustomer}
        onClose={() => setIsPickerOpen(false)}
      />
      <AddCustomerSheet
        visible={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onCreated={handleCustomerCreated}
      />
      <DiscountCalculatorSheet
        visible={isCalculatorOpen}
        subtotal={totals.subtotal}
        onApply={(percent) => {
          cart.setDiscountPercent(percent);
          setDiscountFieldKey((k) => k + 1);
        }}
        onClose={() => setIsCalculatorOpen(false)}
      />

      <Modal visible={isSubmitting} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.processingBackdrop}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingText}>လုပ်ဆောင်နေပါသည်...</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Section({
  label,
  hint,
  note,
  required,
  children,
}: {
  label: string;
  hint?: string;
  note?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
          {!!hint && <Text style={styles.hint}> {hint}</Text>}
        </Text>
        {!!note && <Text style={styles.note}>{note}</Text>}
      </View>
      {children}
    </View>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, strong && styles.summaryStrong]}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryStrongValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  // Dimmed product grid shows through around the card
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  avoider: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  card: {
    width: '100%',
    maxHeight: '100%',
    borderRadius: 24,
    backgroundColor: colors.background,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  scroll: {
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerText: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  summaryPill: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.borderSoft,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
  },
  body: {
    padding: 16,
    gap: 20,
    paddingBottom: 32,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  required: {
    color: colors.danger,
  },
  hint: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textFaint,
  },
  note: {
    fontSize: 11,
    color: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  customerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customerField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: colors.surface,
  },
  customerIcon: {
    fontSize: 15,
  },
  customerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  placeholder: {
    fontWeight: '400',
    color: colors.textFaint,
  },
  chevron: {
    fontSize: 14,
    color: colors.textMuted,
  },
  clearCustomer: {
    width: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearCustomerText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  addCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  addCustomerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputDisabled: {
    backgroundColor: colors.borderSoft,
    color: colors.textFaint,
  },
  paidInput: {
    fontSize: 18,
    paddingVertical: 15,
  },
  calculatorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
  },
  calculatorText: {
    color: colors.primary,
    fontWeight: '700',
  },
  summary: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  summaryStrong: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  summaryStrongValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: 10,
  },
  validation: {
    fontSize: 12,
    color: colors.danger,
    textAlign: 'center',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  processingBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  processingCard: {
    padding: 28,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 14,
  },
  processingText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
});
