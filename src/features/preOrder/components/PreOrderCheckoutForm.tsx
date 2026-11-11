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

import type { CreditPersona } from '../../../services/pos/types';
import { usePreOrder, usePreOrderTotals } from '../../../store/preOrderStore';
import { toast } from '../../../store/toastStore';
import AddCustomerSheet from '../../pos/components/checkout/AddCustomerSheet';
import CustomerPicker from '../../pos/components/checkout/CustomerPicker';
import OptionCard from '../../pos/components/checkout/OptionCard';
import OptionPickerSheet from '../../pos/components/OptionPickerSheet';
import { useCreditPersonas } from '../../pos/hooks/usePosData';
import { getTodayDateString, SELECTABLE_PAYMENT_METHODS } from '../../pos/lib';
import { colors, formatMMK, TABLET_MIN_WIDTH } from '../../pos/theme';
import { useMyanmarLocations } from '../hooks/useMyanmarLocations';
import {
  personaToCustomer,
  preOrderCustomerLabel,
  PreOrderForm,
  PreOrderPriceMode,
  validatePreOrder,
  YANGON_REGION_CODE,
} from '../lib';
import ExpectedDateField from './ExpectedDateField';

const PRICE_MODES: { id: PreOrderPriceMode; label: string }[] = [
  { id: 'normal', label: 'ရိုးရိုးပေးချေမယ်' },
  { id: 'discount', label: 'လျှော့ဈေး (Discount)' },
];

const digitsOnly = (text: string) => Number(text.replace(/[^0-9]/g, '')) || 0;

type Picker = 'customer' | 'addCustomer' | 'region' | 'township' | null;

interface Props {
  title: string;
  submitLabel: string;
  // Saves the pre-order. Returns the message to show when that failed; on success it moves on by itself.
  onSubmit: (form: PreOrderForm) => Promise<string | null>;
  // Back to the product grid under this popup
  onClose: () => void;
}

// The pre-order checkout popup (web: PreOrderCheckoutModal): customer required, a deposit instead of
// full payment, an optional expected date and delivery, for whichever form PreOrderStoreContext provides
export default function PreOrderCheckoutForm({ title, submitLabel, onSubmit, onClose: close }: Props) {
  const form = usePreOrder((state) => state);
  const totals = usePreOrderTotals();
  const alreadyPaid = form.editing?.alreadyPaid ?? null;
  const isEdit = alreadyPaid !== null;

  const { personas: listed, isLoading: personasLoading, addPersona } = useCreditPersonas();
  const { regions, yangonTownships, regionLabel, townshipLabel } = useMyanmarLocations();

  // The pre-order's own customer stays selectable even if the list leaves them out (blacklisted since)
  const personas = useMemo(() => {
    const customer = form.customer;
    if (customer?.kind !== 'persona' || listed.some((p) => p._id === customer.id)) return listed;
    const own: CreditPersona = {
      _id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      blacklist: false,
      blacklistReason: null,
      blacklistDate: null,
      createdAt: '',
      updatedAt: '',
    };
    return [own, ...listed];
  }, [listed, form.customer]);

  const [picker, setPicker] = useState<Picker>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;

  // Nothing to save (the screen was restored after the form was cleared): close the popup
  const isEmpty = form.items.length === 0 && !isSubmitting;
  useEffect(() => {
    if (isEmpty) close();
  }, [isEmpty, close]);
  if (isEmpty) return null;

  const validationError = validatePreOrder(form, alreadyPaid);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (validationError) {
      toast.error(validationError);
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    const errorMessage = await onSubmit(form);
    submittingRef.current = false;
    // On success the popup stays busy until it is replaced, so it doesn't close itself on the emptied form
    if (errorMessage) {
      setIsSubmitting(false);
      toast.error(errorMessage);
    }
  };

  // iOS can't present a modal while another is still closing
  const openAfterClose = (next: Picker) => {
    setPicker(null);
    setTimeout(() => setPicker(next), Platform.OS === 'ios' ? 350 : 0);
  };

  const choosePersona = (persona: CreditPersona) => {
    form.setCustomer(personaToCustomer(persona));
    // A customer brings their own region / township (it can still be changed here)
    if (persona.region) form.setDelivery({ region: persona.region, township: persona.township || '' });
  };

  const handleSelectCustomer = (id: string) => {
    const persona = personas.find((p) => p._id === id);
    if (persona) choosePersona(persona);
  };

  const handleCustomerCreated = (persona: CreditPersona) => {
    addPersona(persona);
    choosePersona(persona);
    setPicker(null);
  };

  const regionOptions = [{ value: '', label: 'မရွေးပါ' }, ...regions.map((r) => ({ value: r.code, label: r.my }))];
  const townshipOptions = [
    { value: '', label: 'မရွေးပါ' },
    ...yangonTownships.map((t) => ({ value: t.code, label: t.my })),
  ];
  const isYangon = form.delivery.region === YANGON_REGION_CODE;
  const selectedId = form.customer?.kind === 'persona' ? form.customer.id : '';

  return (
    <SafeAreaView style={styles.overlay} edges={['top', 'bottom', 'left', 'right']}>
      {/* Tapping outside the card closes it; the form is kept */}
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
            <Section label="ဝယ်သူ" required>
              <View style={styles.customerRow}>
                <TouchableOpacity style={styles.selectField} onPress={() => setPicker('customer')}>
                  <Ionicons name="person-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.selectText, !form.customer && styles.placeholder]} numberOfLines={1}>
                    {form.customer ? preOrderCustomerLabel(form.customer) : 'အမည် သို့မဟုတ် ဖုန်းဖြင့် ရှာမယ်...'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                </TouchableOpacity>
                {!!form.customer && (
                  <TouchableOpacity style={styles.squareButton} onPress={() => form.setCustomer(null)}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.addCustomer}
                  onPress={() => setPicker('addCustomer')}
                  activeOpacity={0.85}
                  accessibilityLabel="အသစ်ထည့်မယ်"
                >
                  <Ionicons name="person-add-outline" size={17} color="#ffffff" />
                  <Text style={styles.addCustomerText}>{isTablet ? 'အသစ်ထည့်မယ်' : 'အသစ်'}</Text>
                </TouchableOpacity>
              </View>
            </Section>

            <Section label="ပစ္စည်းရမယ့်ရက်" hint="(မထည့်လည်းရ)">
              <ExpectedDateField
                value={form.expectedDate}
                onChange={form.setExpectedDate}
                minDate={isEdit ? undefined : getTodayDateString()}
              />
            </Section>

            <Section label="ပို့ဆောင်ရန်" hint="(မထည့်လည်းရ)">
              <TouchableOpacity style={styles.selectField} onPress={() => setPicker('region')}>
                <Ionicons name="location-outline" size={18} color={colors.textMuted} />
                <Text style={[styles.selectText, !form.delivery.region && styles.placeholder]} numberOfLines={1}>
                  {form.delivery.region ? regionLabel(form.delivery.region) : 'တိုင်း/ပြည်နယ် ရွေးပါ'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {isYangon && (
                <TouchableOpacity style={styles.selectField} onPress={() => setPicker('township')}>
                  <Ionicons name="map-outline" size={18} color={colors.textMuted} />
                  <Text style={[styles.selectText, !form.delivery.township && styles.placeholder]} numberOfLines={1}>
                    {form.delivery.township ? townshipLabel(form.delivery.township) : 'မြို့နယ် ရွေးပါ'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={form.delivery.fee ? String(form.delivery.fee) : ''}
                  onChangeText={(text) => form.setDelivery({ fee: digitsOnly(text) })}
                  placeholder="ပို့ခ"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                />
                <Text style={styles.unit}>ကျပ်</Text>
              </View>
            </Section>

            <Section label="ပေးချေမှု နည်းလမ်း:">
              <View style={styles.optionGrid}>
                {SELECTABLE_PAYMENT_METHODS.map((method) => (
                  <OptionCard
                    key={method.id}
                    label={method.label}
                    active={form.paymentMethod === method.id}
                    onPress={() => form.setPaymentMethod(method.id)}
                  />
                ))}
              </View>
            </Section>

            <Section label="ဈေးနှုန်း အမျိုးအစား:">
              <View style={styles.optionGrid}>
                {PRICE_MODES.map((mode) => (
                  <OptionCard
                    key={mode.id}
                    label={mode.label}
                    active={form.priceMode === mode.id}
                    onPress={() => form.setPriceMode(mode.id)}
                  />
                ))}
              </View>
            </Section>

            {form.priceMode === 'discount' && (
              <Section label="လျှော့ဈေး (MMK)">
                <TextInput
                  style={styles.input}
                  value={form.discountAmount ? String(form.discountAmount) : ''}
                  onChangeText={(text) => form.setDiscountAmount(digitsOnly(text))}
                  placeholder="0"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                />
              </Section>
            )}

            {isEdit ? (
              <Section label="ပေးပြီးငွေ" note="ငွေထပ်လက်ခံရန် Pre-order စာရင်းမှ 'ငွေလက်ခံမယ်'">
                <Text style={[styles.input, styles.paidInput, styles.inputDisabled]}>{formatMMK(totals.paid)}</Text>
              </Section>
            ) : (
              <Section label="စရံငွေ (Deposit)" hint="(0 လည်းရ)">
                <TextInput
                  style={[styles.input, styles.paidInput]}
                  value={form.deposit ? String(form.deposit) : ''}
                  onChangeText={(text) => form.setDeposit(digitsOnly(text))}
                  placeholder={`ပမာဏ ရိုက်ထည့်ပါ (${formatMMK(totals.total)} အထိ)`}
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                />
              </Section>
            )}

            <View style={styles.summary}>
              <SummaryRow label="စုစုပေါင်း (Subtotal)" value={formatMMK(totals.subtotal)} />
              {totals.discountAmount > 0 && (
                <SummaryRow label="လျှော့ဈေး" value={`- ${formatMMK(totals.discountAmount)}`} />
              )}
              {totals.deliveryFee > 0 && <SummaryRow label="ပို့ခ" value={`+ ${formatMMK(totals.deliveryFee)}`} />}
              <SummaryRow label="ကျသင့်ငွေ" value={formatMMK(totals.total)} strong />
              <SummaryRow label={isEdit ? 'ပေးပြီးငွေ' : 'စရံငွေ'} value={formatMMK(totals.paid)} />
              <SummaryRow
                label="ကျန်ငွေ"
                value={formatMMK(totals.balance)}
                valueStyle={totals.balance > 0 ? styles.balanceDue : totals.balance < 0 ? styles.balanceOver : styles.balancePaid}
              />
            </View>

            <Section label="မှတ်ချက်">
              <TextInput
                style={[styles.input, styles.noteInput]}
                value={form.note}
                onChangeText={form.setNote}
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
            </Section>
          </ScrollView>

          <View style={styles.footer}>
            {validationError && <Text style={styles.validation}>{validationError}</Text>}
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
        visible={picker === 'customer'}
        personas={personas}
        isLoading={personasLoading}
        selectedId={selectedId}
        onSelect={handleSelectCustomer}
        onAddNew={() => openAfterClose('addCustomer')}
        onClose={() => setPicker(null)}
      />
      <AddCustomerSheet
        visible={picker === 'addCustomer'}
        onClose={() => setPicker(null)}
        onCreated={handleCustomerCreated}
      />
      <OptionPickerSheet
        visible={picker === 'region'}
        title="တိုင်း/ပြည်နယ်"
        options={regionOptions}
        selected={form.delivery.region}
        onSelect={(region) => form.setDelivery({ region, township: '' })}
        onClose={() => setPicker(null)}
      />
      <OptionPickerSheet
        visible={picker === 'township'}
        title="မြို့နယ်"
        options={townshipOptions}
        selected={form.delivery.township}
        onSelect={(township) => form.setDelivery({ township })}
        onClose={() => setPicker(null)}
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

function SummaryRow({
  label,
  value,
  strong,
  valueStyle,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueStyle?: object;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, strong && styles.summaryStrong]}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryStrongValue, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
    flexShrink: 1,
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
  selectField: {
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
  selectText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  placeholder: {
    fontWeight: '400',
    color: colors.textFaint,
  },
  squareButton: {
    width: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unit: {
    fontSize: 13,
    color: colors.textMuted,
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
    overflow: 'hidden',
  },
  inputDisabled: {
    backgroundColor: colors.borderSoft,
    color: colors.textMuted,
  },
  paidInput: {
    fontSize: 18,
    paddingVertical: 15,
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
  balanceDue: {
    fontWeight: '800',
    color: colors.warning,
  },
  balanceOver: {
    fontWeight: '800',
    color: colors.danger,
  },
  balancePaid: {
    fontWeight: '800',
    color: colors.success,
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
