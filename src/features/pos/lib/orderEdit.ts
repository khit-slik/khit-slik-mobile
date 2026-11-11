import type { OrderLine, PersonRef, PosOrderDetail, PosProduct, UpdateOrderRequest } from '../../../services/pos/types';
import type { OriginalQuantities } from './cart';
import { buildCreateOrderPayload, CheckoutInput, getTodayDateString, isFoc, PaymentType } from './checkout';
import { fromApiPaymentMethod, PaymentMethod } from './paymentMethods';
import { CartItem, getSafeQty, getUnitPrice, PriceMode } from './pricing';

// Everything the cart needs to pick up a saved order where it was left
export interface OrderEditDraft {
  order: PosOrderDetail;
  items: CartItem[];
  originalQuantities: OriginalQuantities;
  priceMode: PriceMode;
  discountPercent: number;
  markupAmount: number;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  creditPersonId: string;
  note: string;
  orderDate: string;
}

const refId = (ref: { _id: string } | string | null | undefined) =>
  (typeof ref === 'object' && ref ? ref._id : ref) || '';

export const getLineProductId = (line: OrderLine) => refId(line.inventoryId);

// The order's customer; older orders may only have customerId set
export const getOrderCustomerId = (order: PosOrderDetail) =>
  refId(order.creditPersonId) || refId(order.customerId);

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

// The discount is stored as an amount; the cart works in percent of the subtotal.
// An order whose total is above its subtotal was marked up.
const toPricing = (order: PosOrderDetail, foc: boolean) => {
  const subtotal = order.subTotal || 0;
  const discount = order.discount || 0;
  const finalAmount = order.finalAmount ?? subtotal - discount;
  if (foc) return { priceMode: 'normal' as const, discountPercent: 0, markupAmount: 0 };
  if (subtotal > 0 && discount > 0) {
    return { priceMode: 'discount' as const, discountPercent: (discount / subtotal) * 100, markupAmount: 0 };
  }
  if (finalAmount > subtotal) {
    return { priceMode: 'markup' as const, discountPercent: 0, markupAmount: finalAmount - subtotal };
  }
  return { priceMode: 'normal' as const, discountPercent: 0, markupAmount: 0 };
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

  const paymentMethod = fromApiPaymentMethod(order.paymentMethod);
  const foc = isFoc(paymentMethod);
  return {
    draft: {
      order,
      items,
      originalQuantities,
      ...toPricing(order, foc),
      paymentType: order.paymentType === 'credit' ? 'credit' : 'paid',
      paymentMethod,
      paidAmount: foc ? 0 : order.paidAmount || 0,
      creditPersonId: getOrderCustomerId(order),
      note: order.note || '',
      orderDate: order.createdAt ? getTodayDateString(new Date(order.createdAt)) : getTodayDateString(),
    },
    missingLines,
  };
};

// Same fields as a new sale, plus each line's price
export const buildUpdateOrderPayload = (input: CheckoutInput): UpdateOrderRequest => ({
  ...buildCreateOrderPayload(input),
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
