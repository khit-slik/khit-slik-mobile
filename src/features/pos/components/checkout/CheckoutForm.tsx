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
import { useCart, useCartTotals } from '../../../../store/cartStore';
import { toast } from '../../../../store/toastStore';
import { YANGON_REGION_CODE } from '../../../preOrder/lib/preOrder';
import { useMyanmarLocations } from '../../../preOrder/hooks/useMyanmarLocations';
import { useCreditPersonas } from '../../hooks/usePosData';
import {
  CHECKOUT_ERROR_MESSAGES,
  CheckoutInput,
  getChangeAmount,
  hasNoUpfrontPayment,
  isCod,
  isFoc,
  isCashdownKpayModeLocked,
  isOrderPaymentFormLocked,
  PAYMENT_METHODS,
  PaymentMode,
  PriceMode,
  resolvePaymentMode,
  validateCheckout,
} from '../../lib';
import { colors, formatMMK, TABLET_MIN_WIDTH } from '../../theme';
import OptionPickerSheet from '../OptionPickerSheet';
import OrderDateField from '../OrderDateField';
import AddCustomerSheet from './AddCustomerSheet';
import CustomerPicker, { customerLabel } from './CustomerPicker';
import DiscountCalculatorSheet from './DiscountCalculatorSheet';
import OptionCard from './OptionCard';

const PAYMENT_MODE_OPTIONS: { id: PaymentMode; label: string }[] = [
  { id: 'cod', label: 'COD' },
  { id: 'cashdown', label: 'Cashdown' },
  { id: 'foc', label: 'FOC' },
];

const PRICE_MODES: { id: PriceMode; label: string }[] = [
  { id: 'normal', label: 'ရိုးရိုးပေးချေမယ်' },
  { id: 'discount', label: 'လျှော့ဈေး (Discount)' },
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

  const { regions, yangonTownships, regionLabel, townshipLabel } = useMyanmarLocations();
  const [isRegionPickerOpen, setIsRegionPickerOpen] = useState(false);
  const [isTownshipPickerOpen, setIsTownshipPickerOpen] = useState(false);
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

  const activeMode =
    cart.paymentMode ??
    resolvePaymentMode({
      paymentMethod: cart.paymentMethod,
      paymentType: cart.paymentType,
    });
  const foc = activeMode === 'foc' || isFoc(cart.paymentMethod);
  const cod = activeMode === 'cod' || isCod(cart.paymentMethod);
  const cashdown = activeMode === 'cashdown';
  const isNonYangonRegion = Boolean(
    cart.deliveryRegion && cart.deliveryRegion !== YANGON_REGION_CODE,
  );
  const codAllowed = !isNonYangonRegion;
  const codRegionConflict = cod && isNonYangonRegion;
  const paymentFormLocked = isOrderPaymentFormLocked(cart.editingOrder);
  const kpayModeLocked = isCashdownKpayModeLocked(cart.editingOrder);
  const noUpfrontPayment = cod || foc || hasNoUpfrontPayment(cart.paymentMethod);
  const selectedCustomer = personas.find((p) => p._id === cart.creditPersonId) ?? null;

  const input: CheckoutInput = {
    items: cart.items,
    totals,
    ...(cart.editingOrder && !foc && cart.inheritedTax > 0 ? { inheritedTax: cart.inheritedTax } : {}),
    paymentMode: activeMode,
    paymentType: cashdown ? 'credit' : foc ? 'foc' : 'paid',
    paymentMethod: cod ? PAYMENT_METHODS.COD : foc ? PAYMENT_METHODS.FOC : PAYMENT_METHODS.KBZ_PAY,
    paidAmount: cart.paidAmount,
    creditPersonId: cart.creditPersonId,
    deliveryRegion: cart.deliveryRegion,
    deliveryTownship: cart.deliveryTownship,
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
    cart.setCustomer(persona);
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
                ပစ္စည်းများ: {totals.itemCount} ခု | စုစုပေါင်း: {formatMMK(totals.total)}
              </Text>
            </View>
            <TouchableOpacity onPress={close} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Section label="Customer" required>
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
                  <TouchableOpacity style={styles.clearCustomer} onPress={() => cart.setCustomer(null)}>
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
              {!!selectedCustomer?.address && (
                <Text style={styles.hint}>လိပ်စာ: {selectedCustomer.address}</Text>
              )}
            </Section>

            <Section label="ဘောင်ချာ ရက်စွဲ">
              <OrderDateField value={cart.orderDate} onChange={cart.setOrderDate} />
            </Section>

            <Section label="ပို့ဆောင်ရန်" hint="(မထည့်လည်းရ)">
              <View style={isTablet ? styles.inputRow : styles.deliveryFields}>
                <TouchableOpacity
                  style={[styles.customerField, !isTablet && styles.deliveryRegionField]}
                  onPress={() => setIsRegionPickerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="တိုင်း/ပြည်နယ် ရွေးပါ"
                  accessibilityValue={{ text: cart.deliveryRegion ? regionLabel(cart.deliveryRegion) : 'မရွေးပါ' }}
                >
                  <Ionicons name="location-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.customerText, !cart.deliveryRegion && styles.placeholder]} numberOfLines={1}>
                    {cart.deliveryRegion ? regionLabel(cart.deliveryRegion) : 'တိုင်း/ပြည်နယ် ရွေးပါ'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                </TouchableOpacity>
                {cart.deliveryRegion === YANGON_REGION_CODE && (
                  <TouchableOpacity
                    style={[styles.customerField, !isTablet && styles.deliveryRegionField]}
                    onPress={() => setIsTownshipPickerOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="မြို့နယ် ရွေးပါ"
                  >
                    <Ionicons name="navigate-outline" size={18} color={colors.textMuted} />
                    <Text style={[styles.customerText, !cart.deliveryTownship && styles.placeholder]} numberOfLines={1}>
                      {cart.deliveryTownship ? townshipLabel(cart.deliveryTownship) : 'မြို့နယ် ရွေးပါ'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
                <View style={[styles.deliveryFeeField, isTablet && styles.flex]}>
                  <TextInput
                    style={[styles.input, styles.deliveryFeeInput]}
                    value={cart.deliveryFee ? String(cart.deliveryFee) : ''}
                    onChangeText={(text) => {
                      if (/^\d*$/.test(text) && Number.isSafeInteger(Number(text))) cart.setDeliveryFee(Number(text));
                    }}
                    placeholder="ပို့ခ"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="number-pad"
                    accessibilityLabel="ပို့ခ (ကျပ်)"
                  />
                  <Text style={styles.deliveryFeeUnit}>ကျပ်</Text>
                </View>
              </View>
            </Section>

            <Section
              label="ပေးချေမှု ပုံစံ"
              note={
                paymentFormLocked
                  ? 'ပေးချေမှု ပုံစံ ပြောင်းလို့မရပါ။'
                  : kpayModeLocked
                    ? 'KPay ငွေလွှဲ မှတ်တမ်းရှိပြီးသား Cashdown အော်ဒါကို COD သို့မဟုတ် FOC သို့ ပြောင်းလို့မရပါ။'
                    : !codAllowed
                      ? 'ရန်ကုန်တိုင်းပြင်ပအတွက် Cashdown (KPay) သာ ရပါမယ်'
                      : !cart.deliveryRegion && !activeMode
                        ? 'တိုင်း/ပြည်နယ် မရှိသေးပါ — COD သို့မဟုတ် Cashdown ရွေးပါ'
                        : undefined
              }
            >
              <View style={styles.optionGrid}>
                {PAYMENT_MODE_OPTIONS.map((option) => (
                  <OptionCard
                    key={option.id}
                    label={option.label}
                    active={activeMode === option.id}
                    disabled={
                      paymentFormLocked ||
                      (kpayModeLocked && option.id !== 'cashdown') ||
                      (option.id === 'cod' && !codAllowed)
                    }
                    onPress={() => {
                      if (kpayModeLocked && option.id !== 'cashdown') {
                        toast.error('Finance အတည်ပြုရန် စောင့်နေသော Cashdown အော်ဒါကို COD သို့မဟုတ် FOC သို့ ပြောင်းလို့မရပါ');
                        return;
                      }
                      cart.selectPaymentMode(option.id);
                    }}
                  />
                ))}
              </View>
              {codRegionConflict && (
                <Text style={styles.validation}>
                  ရန်ကုန်တိုင်းပြင်ပ ဒေသသို့ ပြောင်းလဲထားသောကြောင့် Cashdown သို့ ကိုယ်တိုင်ပြောင်းလဲပါ။
                </Text>
              )}
            </Section>

            {cashdown && (
              <Section label="ပေးချေမှု နည်းလမ်း:">
                <View style={styles.optionGrid}>
                  <OptionCard
                    label="KBZPay"
                    active={true}
                    onPress={() => cart.setPaymentMethod(PAYMENT_METHODS.KBZ_PAY)}
                  />
                </View>
              </Section>
            )}

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

            <Section label={cod ? "COD ငွေပမာဏ (ကျသင့်ငွေအပြည့်)" : "ပေးချေမှု ပမာဏ"}>
              <TextInput
                style={[styles.input, styles.paidInput, (noUpfrontPayment || !activeMode) && styles.inputDisabled]}
                value={cod ? String(Math.ceil(totals.total)) : foc ? '0' : cart.paidAmount ? String(cart.paidAmount) : ''}
                onChangeText={(text) => cart.setPaidAmount(digitsOnly(text))}
                editable={!noUpfrontPayment && !!activeMode}
                placeholder={`ပမာဏ ရိုက်ထည့်ပါ (${formatMMK(totals.total)})`}
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
              />
            </Section>

            <Section label="မှတ်ချက်" hint="(မထည့်လည်းရ)">
              <TextInput
                style={[styles.input, styles.noteInput]}
                accessibilityLabel="မှတ်ချက် (မထည့်လည်းရ)"
                value={cart.note}
                onChangeText={cart.setNote}
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
            </Section>

            <View style={styles.summary}>
              <SummaryRow label="စုစုပေါင်း (Subtotal)" value={formatMMK(totals.subtotal)} />
              {totals.discountAmount > 0 && (
                <SummaryRow label="လျှော့ဈေး" value={`- ${formatMMK(totals.discountAmount)}`} />
              )}
              {!!cart.editingOrder && !foc && totals.markupAmount > 0 && (
                <SummaryRow label="ယခင် Mark Up (ပြင်ဆင်၍မရပါ)" value={`+ ${formatMMK(totals.markupAmount)}`} />
              )}
              {!!cart.editingOrder && !foc && cart.inheritedTax > 0 && (
                <SummaryRow label="အခွန်" value={`+ ${formatMMK(cart.inheritedTax)}`} />
              )}
              {totals.deliveryFee > 0 && (
                <SummaryRow label="ပို့ခ" value={`+ ${formatMMK(totals.deliveryFee)}`} />
              )}
              <SummaryRow label="ကျသင့်ငွေ" value={formatMMK(totals.total)} strong />
              {cashdown && cart.paidAmount > totals.total && (
                <SummaryRow label="ပြန်အမ်းငွေ" value={formatMMK(getChangeAmount(cart.paidAmount, totals.total))} />
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
        onSelect={(id) => cart.setCustomer(personas.find((persona) => persona._id === id) ?? null)}
        onAddNew={handleAddNewCustomer}
        onClose={() => setIsPickerOpen(false)}
      />
      <AddCustomerSheet
        visible={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onCreated={handleCustomerCreated}
        allowLocation
      />
      <OptionPickerSheet
        visible={isRegionPickerOpen}
        title="တိုင်း/ပြည်နယ်"
        options={[{ value: '', label: 'မရွေးပါ' }, ...regions.map((region) => ({ value: region.code, label: region.my }))]}
        selected={cart.deliveryRegion}
        onSelect={cart.setDeliveryRegion}
        onClose={() => setIsRegionPickerOpen(false)}
      />
      <OptionPickerSheet
        visible={isTownshipPickerOpen}
        title="မြို့နယ်"
        options={[{ value: '', label: 'မရွေးပါ' }, ...yangonTownships.map((t) => ({ value: t.code, label: t.my }))]}
        selected={cart.deliveryTownship}
        onSelect={cart.setDeliveryTownship}
        onClose={() => setIsTownshipPickerOpen(false)}
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
      </View>
      {!!note && <Text style={styles.note}>{note}</Text>}
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
    alignSelf: 'flex-start',
    maxWidth: '100%',
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
  deliveryFields: {
    gap: 8,
  },
  deliveryRegionField: {
    flex: 0,
  },
  deliveryFeeField: {
    justifyContent: 'center',
  },
  deliveryFeeInput: {
    paddingRight: 60,
  },
  deliveryFeeUnit: {
    position: 'absolute',
    right: 14,
    fontSize: 13,
    color: colors.textMuted,
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
  noteInput: {
    minHeight: 72,
    fontWeight: '400',
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
