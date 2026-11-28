import type { OrderLine, PersonRef, PosOrderDetail, PosProduct, UpdateOrderRequest } from '../../../services/pos/types';
import type { OriginalQuantities } from './cart';
import {
  buildCreateOrderPayload,
  CheckoutInput,
  getTodayDateString,
  isFoc,
  PaymentMode,
  PaymentType,
  resolveOrderCategory,
} from './checkout';
import { fromApiPaymentMethod, isCod, PAYMENT_METHODS, PaymentMethod } from './paymentMethods';
import { CartItem, getSafeQty, getUnitPrice, PriceMode } from './pricing';

// Everything the cart needs to pick up a saved order where it was left
export interface OrderEditDraft {
  order: PosOrderDetail;
  items: CartItem[];
  originalQuantities: OriginalQuantities;
  priceMode: PriceMode;
  discountPercent: number;
  legacyMarkup: number;
  inheritedTax: number;
  paymentMode: PaymentMode | null;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  creditPersonId: string;
  deliveryRegion: string;
  deliveryTownship: string;
  deliveryFee: number;
  note: string;
  orderDate: string;
}

const refId = (ref: { _id: string } | string | null | undefined) =>
  (typeof ref === 'object' && ref ? ref._id : ref) || '';

export const getLineProductId = (line: OrderLine) => refId(line.inventoryId);

// The order's customer; older orders may only have customerId set
export const getOrderCustomerId = (order: PosOrderDetail) =>
  refId(order.creditPersonId) || refId(order.customerId);

const LOCKED_WORKFLOW_STATUSES = [
  'packing',
  'packed',
  'pack_checked',
  'finance_adjustment',
  'finance_approved',
  'delivered',
];

export const isRegularCodEditableAtPacking = (order: PosOrderDetail | null) =>
  Boolean(
    order &&
      order.isPreOrder !== true &&
      resolveOrderCategory(order) === 'cod' &&
      order.workflowStatus === 'packing',
  );

export const isOrderEditLocked = (order: PosOrderDetail | null) =>
  order !== null &&
  (order.isPreOrder === true ||
    order.orderStatus === 'cancelled' ||
    (!isRegularCodEditableAtPacking(order) &&
      order.workflowStatus != null &&
      LOCKED_WORKFLOW_STATUSES.includes(order.workflowStatus)));

export const isCashdownKpayModeLocked = (order: PosOrderDetail | null) =>
  order !== null &&
  order.isPreOrder !== true &&
  resolveOrderCategory(order) === 'cashdown' &&
  (order.workflowStatus === 'finance_pending' ||
    order.workflowStatus === 'finance_adjustment' ||
    order.hasKpayTransactions === true ||
    order.paymentVerificationStatus === 'partial' ||
    order.paymentVerificationStatus === 'verified');

export const isOrderPaymentFormLocked = (order: PosOrderDetail | null) =>
  isOrderEditLocked(order);

export const getOrderCustomer = (order: PosOrderDetail): PersonRef | null => {
  const ref = order.creditPersonId || order.customerId;
  return typeof ref === 'object' && ref?._id ? ref : null;
};

// inventoryId -> quantity in the saved order; duplicate lines add up, as the backend merges them
export const getOriginalQuantities = (order: PosOrderDetail): OriginalQuantities => {
  const quantities: OriginalQuantities = {};
  for (const line of order.ordersProducts || []) {
    const id = getLineProductId(line);
    if (id) quantities[id] = (quantities[id] || 0) + getSafeQty(line.quantity);
  }
  return quantities;
};

// Stock fields come from the fresh copy; name, price and tiers stay as the cart line has them
export const withFreshStock = (product: PosProduct, fresh: PosProduct): PosProduct => ({
  ...product,
  availableQuantity: fresh.availableQuantity,
  quantity: fresh.quantity,
  stockShop: fresh.stockShop,
});

// A line keeps the price it was sold at. When today's pricing still gives that price the product is used
// as it is, so wholesale tiers keep working; otherwise the sold price becomes its selling price.
const toCartProduct = (line: OrderLine, qty: number, fresh: PosProduct | undefined): PosProduct => {
  const inventory = typeof line.inventoryId === 'object' ? line.inventoryId : null;
  const soldPrice = line.unitPrice;
  if (fresh) {
    if (soldPrice == null || getUnitPrice(fresh, qty) === soldPrice) return fresh;
    return { ...fresh, sellingPrice: soldPrice };
  }
  // Couldn't load the product: keep what the order says, with no stock beyond what it already holds
  return {
    _id: getLineProductId(line),
    productName: inventory?.productName || 'Unknown Product',
    productCode: inventory?.productCode,
    SKU: inventory?.SKU,
    sellingPrice: soldPrice || 0,
    availableQuantity: 0,
  };
};

// Reconcile historical markup above saved checkout baseline (subTotal - discount + tax + deliveryFee).
// Rounding residue (< 1 MMK) never generates an adjustment.
const toPricing = (order: PosOrderDetail, foc: boolean) => {
  const subtotal = Number(order.subTotal) || 0;
  const discount = Number(order.discount) || 0;
  const tax = Math.max(0, Number(order.tax) || 0);
  const deliveryFee = Math.max(0, Number(order.deliveryFee) || 0);
  if (foc) {
    return { priceMode: 'normal' as const, discountPercent: 0, legacyMarkup: 0, inheritedTax: 0 };
  }
  const baseline = Math.max(0, subtotal - discount) + tax + deliveryFee;
  const excess = order.finalAmount == null ? 0 : Number(order.finalAmount) - baseline;
  const legacyMarkup = excess >= 1 ? Math.round(excess) : 0;

  if (subtotal > 0 && discount > 0) {
    return {
      priceMode: 'discount' as const,
      discountPercent: (discount / subtotal) * 100,
      legacyMarkup,
      inheritedTax: tax,
    };
  }
  return { priceMode: 'normal' as const, discountPercent: 0, legacyMarkup, inheritedTax: tax };
};

// Lines whose product is gone from the order (deleted inventory) are left out and counted
export const orderToDraft = (
  order: PosOrderDetail,
  freshProducts: Map<string, PosProduct>,
): { draft: OrderEditDraft; missingLines: number } => {
  const originalQuantities = getOriginalQuantities(order);
  const items: CartItem[] = [];
  let missingLines = 0;
  for (const line of order.ordersProducts || []) {
    const id = getLineProductId(line);
    if (!id) {
      missingLines += 1;
      continue;
    }
    if (items.some((item) => item.product._id === id)) continue;
    const qty = originalQuantities[id];
    items.push({ product: toCartProduct(line, qty, freshProducts.get(id)), qty });
  }

  const mode = resolveOrderCategory(order);
  const paymentMethod =
    mode === 'cod'
      ? PAYMENT_METHODS.COD
      : mode === 'foc'
        ? PAYMENT_METHODS.FOC
        : mode === 'cashdown'
          ? PAYMENT_METHODS.KBZ_PAY
          : fromApiPaymentMethod(order.paymentMethod);
  const foc = isFoc(paymentMethod);
  const cod = isCod(paymentMethod);
  return {
    draft: {
      order,
      items,
      originalQuantities,
      ...toPricing(order, foc),
      paymentMode: mode,
      paymentType: mode === 'cashdown' ? 'credit' : mode === 'foc' ? 'foc' : 'paid',
      paymentMethod,
      paidAmount: foc ? 0 : cod ? Math.ceil(order.finalAmount ?? order.paidAmount ?? 0) : order.paidAmount || 0,
      creditPersonId: getOrderCustomerId(order),
      deliveryRegion: order.deliveryRegion ?? '',
      deliveryTownship: order.deliveryTownship ?? '',
      deliveryFee: order.deliveryFee ?? 0,
      note: order.note || '',
      orderDate: order.createdAt ? getTodayDateString(new Date(order.createdAt)) : getTodayDateString(),
    },
    missingLines,
  };
};

// Same fields as a new sale, plus each line's price
export const buildUpdateOrderPayload = (input: CheckoutInput): UpdateOrderRequest => ({
  ...buildCreateOrderPayload(input),
  ...(input.inheritedTax && input.inheritedTax > 0 ? { tax: input.inheritedTax } : {}),
  ordersProducts: input.items.map((item) => ({
    inventoryId: item.product._id,
    quantity: item.qty,
    unitPrice: getUnitPrice(item.product, getSafeQty(item.qty) || 1),
  })),
  // Clearing the customer has to be sent, or the backend keeps the old one
  creditPersonId: input.creditPersonId.trim() || null,
});

// Products whose stock went down because of the edit: added, or a higher quantity than before
export const getProductsWithLessStock = (items: CartItem[], originalQuantities: OriginalQuantities) =>
  items
    .filter((item) => getSafeQty(item.qty) > (originalQuantities[item.product._id] || 0))
    .map((item) => item.product._id);

// Every product the edit may have changed the stock of, removed ones included
export const getTouchedProductIds = (items: CartItem[], originalQuantities: OriginalQuantities) => [
  ...new Set([...items.map((item) => item.product._id), ...Object.keys(originalQuantities)]),
];
