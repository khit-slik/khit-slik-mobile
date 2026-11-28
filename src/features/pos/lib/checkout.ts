import type { CreateOrderRequest } from '../../../services/pos/types';
import { YANGON_REGION_CODE } from '../../preOrder/lib/preOrder';
import type { CartItem, Totals } from './pricing';
import { isCod, PAYMENT_METHODS, PaymentMethod, toApiPaymentMethod } from './paymentMethods';

export type PaymentType = 'paid' | 'credit' | 'foc';
export type PaymentMode = 'cod' | 'cashdown' | 'foc';

export type CheckoutError =
  | 'EMPTY_CART'
  | 'PAID_LESS_THAN_TOTAL'
  | 'CUSTOMER_REQUIRED'
  | 'PAYMENT_MODE_REQUIRED'
  | 'COD_REGION_INVALID'
  | 'CASHDOWN_FULL_PAYMENT_REQUIRED'
  | 'CREDIT_PAID_EXCEEDS_TOTAL';

export interface CheckoutInput {
  items: CartItem[];
  totals: Totals;
  inheritedTax?: number;
  paymentMode?: PaymentMode | null;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  creditPersonId: string;
  deliveryRegion: string;
  deliveryTownship: string;
  note: string;
  // YYYY-MM-DD, as picked on the checkout screen
  orderDate: string;
}

export const isFoc = (paymentMethod?: PaymentMethod | string) =>
  paymentMethod === PAYMENT_METHODS.FOC ||
  (typeof paymentMethod === 'string' && paymentMethod.trim().toLowerCase() === 'foc');

// Derive regular-order category from stored fields: check FOC first (paymentType or legacy paymentMethod), then paid vs credit.
export const resolveOrderCategory = ({
  paymentMethod,
  paymentType,
}: {
  paymentMethod?: PaymentMethod | string;
  paymentType?: PaymentType | string;
}): PaymentMode | null => {
  if (paymentType === 'foc' || isFoc(paymentMethod)) return 'foc';
  if (paymentType === 'paid') return 'cod';
  if (paymentType === 'credit') return 'cashdown';
  return null;
};

export const resolvePaymentMode = ({
  paymentMode,
  paymentMethod,
  paymentType,
}: {
  paymentMode?: PaymentMode | string | null;
  paymentMethod?: PaymentMethod | string;
  paymentType?: PaymentType;
}): PaymentMode | null => {
  const rawMode = typeof paymentMode === 'string' ? paymentMode.trim().toLowerCase() : null;
  if (rawMode === 'cod' || rawMode === 'cashdown' || rawMode === 'foc') return rawMode;
  return resolveOrderCategory({ paymentMethod, paymentType });
};

export const hasNoUpfrontPayment = (method: PaymentMethod) => isFoc(method) || isCod(method);

export const getFinalPaidAmount = (
  paymentMethod: PaymentMethod,
  paidAmount: number,
  total = 0,
  paymentMode?: PaymentMode | null,
) => {
  const mode = resolvePaymentMode({ paymentMode, paymentMethod });
  if (mode === 'foc' || isFoc(paymentMethod)) return 0;
  if (mode === 'cod' || isCod(paymentMethod)) return Math.ceil(total);
  return paidAmount;
};

// Paid amount to prefill when the checkout screen opens
export const getInitialPaidAmount = ({
  paymentMode,
  paymentType,
  paymentMethod,
  paidAmount,
  total,
}: {
  paymentMode?: PaymentMode | null;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  total: number;
}) => {
  const mode = resolvePaymentMode({ paymentMode, paymentMethod, paymentType });
  if (mode === 'foc' || isFoc(paymentMethod)) return 0;
  if (mode === 'cod' || isCod(paymentMethod)) return Math.ceil(total);
  return Math.max(Math.ceil(total), paidAmount || 0);
};

// Checks customer-first, payment mode, region compatibility, and full Cashdown payment
export const validateCheckout = ({
  items,
  totals,
  paymentMode,
  paymentType,
  paymentMethod,
  paidAmount,
  creditPersonId,
  deliveryRegion,
}: CheckoutInput): CheckoutError | null => {
  if (items.length === 0) return 'EMPTY_CART';
  if (!creditPersonId || creditPersonId.trim() === '') return 'CUSTOMER_REQUIRED';

  const rawUiMode = typeof paymentMode === 'string' ? paymentMode.trim().toLowerCase() : null;
  const mode =
    rawUiMode === 'cod' || rawUiMode === 'cashdown' || rawUiMode === 'foc'
      ? rawUiMode
      : null;
  if (!mode) return 'PAYMENT_MODE_REQUIRED';

  if (mode === 'cod' && deliveryRegion && deliveryRegion !== YANGON_REGION_CODE) {
    return 'COD_REGION_INVALID';
  }

  if (mode === 'cashdown') {
    if (paidAmount < totals.total) return 'CASHDOWN_FULL_PAYMENT_REQUIRED';
  }

  return null;
};

export const buildCreateOrderPayload = (input: CheckoutInput): CreateOrderRequest => {
  const { items, totals, paymentMode, paymentType, paymentMethod, paidAmount, creditPersonId, note, orderDate } =
    input;
  const mode = resolvePaymentMode({ paymentMode, paymentMethod, paymentType }) ?? 'cod';
  const apiPaymentType: PaymentType =
    mode === 'cashdown' ? 'credit' : mode === 'foc' ? 'foc' : 'paid';
  const resolvedMethod =
    mode === 'cod' ? PAYMENT_METHODS.COD : mode === 'foc' ? PAYMENT_METHODS.FOC : PAYMENT_METHODS.KBZ_PAY;
  return {
    ordersProducts: items.map((item) => ({
      inventoryId: item.product._id,
      quantity: item.qty,
    })),
    subTotal: totals.subtotal,
    discount: totals.discountAmount,
    finalAmount: totals.total,
    deliveryRegion: input.deliveryRegion || null,
    deliveryTownship: input.deliveryRegion === YANGON_REGION_CODE ? input.deliveryTownship || null : null,
    deliveryFee: totals.deliveryFee,
    paidAmount: getFinalPaidAmount(resolvedMethod, paidAmount, totals.total, mode),
    paymentType: apiPaymentType,
    note,
    paymentMethod: toApiPaymentMethod(resolvedMethod),
    // Midnight UTC of the picked day, the same value the web POS sends
    orderDate: new Date(orderDate).toISOString(),
    ...(creditPersonId ? { creditPersonId } : {}),
  };
};

// Today on the device's own calendar. The web POS uses the UTC date, which in Myanmar (UTC+6:30)
// is still yesterday before 6:30 in the morning.
export const getTodayDateString = (now: Date = new Date()) => {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};
