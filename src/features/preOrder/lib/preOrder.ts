import type { CreditPersona, PosProduct } from '../../../services/pos/types';
import type {
  PreOrder,
  PreOrderCreatePayload,
  PreOrderCustomerPayload,
  PreOrderUpdatePayload,
} from '../../../services/preOrder/types';
import {
  fromApiPaymentMethod,
  getSafeQty,
  getShelfStock,
  getUnitPrice,
  PAYMENT_METHODS,
  PaymentMethod,
  toApiPaymentMethod,
} from '../../pos/lib';

// Pre-order rules from khit-slik-frontend pages/PreOrderCreate.tsx: no stock limit (the goods aren't
// in yet), a price per line that follows the wholesale tiers until the cashier types one, a required
// customer, an optional deposit, expected date and delivery.

export const YANGON_REGION_CODE = 'yangon';

export interface PreOrderItem {
  product: PosProduct;
  qty: number;
  unitPrice: number;
  // Typed by the cashier (or kept from the saved pre-order): sent to the backend as is
  priceEdited: boolean;
}

export type PreOrderCustomer =
  | { kind: 'persona'; id: string; name: string; phone: string; address?: string }
  // Older pre-orders saved with only a typed name and phone come back like this when edited
  | { kind: 'typed'; name: string; phone: string; address?: string };

export interface PreOrderDelivery {
  region: string;
  township: string;
  fee: number;
}

export type PreOrderPriceMode = 'normal' | 'discount';

export interface PreOrderForm {
  items: PreOrderItem[];
  customer: PreOrderCustomer | null;
  priceMode: PreOrderPriceMode;
  discountAmount: number;
  // Create only: the deposit taken now
  deposit: number;
  paymentMethod: PaymentMethod;
  // YYYY-MM-DD, or '' for none
  expectedDate: string;
  note: string;
  delivery: PreOrderDelivery;
}

export interface PreOrderTotals {
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  // Goods less the discount, plus the delivery fee
  total: number;
  // Create: the deposit. Edit: what the customer has paid so far.
  paid: number;
  balance: number;
}

const MYANMAR_OFFSET_MS = 6.5 * 60 * 60 * 1000;

// YYYY-MM-DD in Myanmar time (Asia/Yangon has no daylight saving)
export const toMMDateKey = (date: string | Date) => {
  const time = new Date(date).getTime();
  if (Number.isNaN(time)) return '';
  return new Date(time + MYANMAR_OFFSET_MS).toISOString().slice(0, 10);
};

export const emptyPreOrderForm = (): PreOrderForm => ({
  items: [],
  customer: null,
  priceMode: 'normal',
  discountAmount: 0,
  deposit: 0,
  paymentMethod: PAYMENT_METHODS.CASH,
  expectedDate: '',
  note: '',
  delivery: { region: '', township: '', fee: 0 },
});

const wholeNumber = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

// A line not priced by hand shows the list price for its quantity (wholesale tier once reached),
// the same price the backend charges
const withListPrice = (item: PreOrderItem): PreOrderItem =>
  item.priceEdited ? item : { ...item, unitPrice: getUnitPrice(item.product, Math.max(1, item.qty)) };

const updateItem = (items: PreOrderItem[], productId: string, change: (item: PreOrderItem) => PreOrderItem) =>
  items.map((item) => (item.product._id === productId ? change(item) : item));

export const getPreOrderQty = (items: PreOrderItem[], productId: string) =>
  items.find((item) => item.product._id === productId)?.qty ?? 0;

// Tap on a product: add one, or one more. Out-of-stock products can be pre-ordered too.
export const addPreOrderItem = (items: PreOrderItem[], product: PosProduct): PreOrderItem[] => {
  if (items.some((item) => item.product._id === product._id)) {
    return updateItem(items, product._id, (item) => withListPrice({ ...item, qty: item.qty + 1 }));
  }
  return [...items, { product, qty: 1, unitPrice: getUnitPrice(product, 1), priceEdited: false }];
};

// Typed or picked (wholesale tier) quantity; below 1 becomes 1
export const setPreOrderQty = (items: PreOrderItem[], productId: string, qty: number): PreOrderItem[] =>
  updateItem(items, productId, (item) => withListPrice({ ...item, qty: Math.max(1, wholeNumber(qty)) }));

// The +/- buttons; never below 1 (removing is its own button)
export const changePreOrderQty = (items: PreOrderItem[], productId: string, delta: number): PreOrderItem[] =>
  updateItem(items, productId, (item) => withListPrice({ ...item, qty: Math.max(1, item.qty + delta) }));

export const setPreOrderPrice = (items: PreOrderItem[], productId: string, price: number): PreOrderItem[] =>
  updateItem(items, productId, (item) => ({
    ...item,
    unitPrice: Number.isFinite(price) && price > 0 ? price : 0,
    priceEdited: true,
  }));

export const removePreOrderItem = (items: PreOrderItem[], productId: string): PreOrderItem[] =>
  items.filter((item) => item.product._id !== productId);

export const computePreOrderTotals = (
  form: Pick<PreOrderForm, 'items' | 'priceMode' | 'discountAmount' | 'deposit' | 'delivery'>,
  alreadyPaid: number | null = null,
): PreOrderTotals => {
  const itemCount = form.items.reduce((sum, item) => sum + getSafeQty(item.qty), 0);
  const subtotal = form.items.reduce((sum, item) => sum + getSafeQty(item.qty) * (item.unitPrice || 0), 0);
  const wantedDiscount = form.priceMode === 'discount' ? Math.max(0, form.discountAmount || 0) : 0;
  const discountAmount = Math.min(wantedDiscount, subtotal);
  const deliveryFee = Math.max(0, form.delivery.fee || 0);
  const total = subtotal - discountAmount + deliveryFee;
  const paid = alreadyPaid ?? Math.max(0, form.deposit || 0);
  return { itemCount, subtotal, discountAmount, deliveryFee, total, paid, balance: total - paid };
};

// The stock shown on a pre-order line, for information only
export const getPreOrderStock = (item: PreOrderItem) => getShelfStock(item.product);

// Returns the message to show, or null when the pre-order can be saved.
// alreadyPaid is set when editing (the deposit can't change there).
export const validatePreOrder = (form: PreOrderForm, alreadyPaid: number | null = null): string | null => {
  if (form.items.length === 0) return 'ပစ္စည်း အနည်းဆုံး တစ်ခု ရွေးပါ';
  for (const item of form.items) {
    if (getSafeQty(item.qty) < 1) return `${item.product.productName} ၏ အရေအတွက် 1 နှင့်အထက် ဖြစ်ရပါမည်`;
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      return `${item.product.productName} ၏ ဈေးနှုန်း မှန်ကန်စွာ ထည့်ပါ`;
    }
  }
  if (!form.customer) return 'ဝယ်သူ (Customer) ရွေးပါ';
  if (form.customer.kind === 'typed' && (!form.customer.name.trim() || !form.customer.phone.trim())) {
    return 'ဖောက်သည် အမည်နှင့် ဖုန်းနံပါတ် ထည့်ပါ';
  }

  const totals = computePreOrderTotals(form, alreadyPaid);
  if (form.priceMode === 'discount' && form.discountAmount > totals.subtotal) return 'လျှော့ဈေး မှန်ကန်စွာ ထည့်ပါ';
  if (alreadyPaid !== null) {
    // The backend refuses a total below what has already been paid
    if (totals.total < alreadyPaid) {
      return `ကျသင့်ငွေသည် ပေးပြီးငွေ ${Math.round(alreadyPaid).toLocaleString('en-US')} MMK ထက် မနည်းရပါ`;
    }
    return null;
  }
  if (totals.paid > totals.total) return 'စရံငွေသည် စုစုပေါင်းထက် မများရပါ';
  return null;
};

const customerPayload = (customer: PreOrderCustomer): PreOrderCustomerPayload =>
  customer.kind === 'persona'
    ? { creditPersonId: customer.id }
    : {
        customerName: customer.name.trim(),
        customerPhone: customer.phone.trim(),
        ...(customer.address?.trim() ? { customerAddress: customer.address.trim() } : {}),
      };

// PATCH body; call only after validatePreOrder passed (a customer is set)
export const buildPreOrderUpdatePayload = (form: PreOrderForm): PreOrderUpdatePayload => {
  const totals = computePreOrderTotals(form);
  return {
    // A price goes along only when typed (or kept from the saved pre-order); otherwise the backend
    // prices the line, wholesale tier included
    ordersProducts: form.items.map((item) => ({
      inventoryId: item.product._id,
      quantity: getSafeQty(item.qty),
      ...(item.priceEdited ? { unitPrice: item.unitPrice } : {}),
    })),
    discount: totals.discountAmount,
    paymentMethod: toApiPaymentMethod(form.paymentMethod),
    expectedDate: form.expectedDate || null,
    note: form.note.trim(),
    deliveryRegion: form.delivery.region || null,
    deliveryTownship: form.delivery.region === YANGON_REGION_CODE ? form.delivery.township || null : null,
    deliveryFee: totals.deliveryFee,
    ...customerPayload(form.customer!),
  };
};

// POST body: the update body plus the deposit
export const buildPreOrderCreatePayload = (form: PreOrderForm): PreOrderCreatePayload => ({
  ...buildPreOrderUpdatePayload(form),
  paidAmount: computePreOrderTotals(form).paid,
});

export const personaToCustomer = (persona: CreditPersona): PreOrderCustomer => ({
  kind: 'persona',
  id: persona._id,
  name: persona.name,
  phone: persona.phone,
  address: persona.address,
});

export const preOrderCustomerLabel = (customer: PreOrderCustomer) =>
  `${customer.name}${customer.phone ? ` - ${customer.phone}` : ''}`;

const lineProductId = (line: PreOrder['ordersProducts'][number]) =>
  typeof line.inventoryId === 'object' && line.inventoryId ? line.inventoryId._id : line.inventoryId || '';

export const getPreOrderProductIds = (order: PreOrder) =>
  Array.from(new Set((order.ordersProducts || []).map(lineProductId).filter(Boolean)));

export interface PreOrderDraft {
  form: PreOrderForm;
  alreadyPaid: number;
}

// A saved pre-order as a form. Lines keep their saved prices; products read again (`products`)
// give current stock and tiers, and a product that can't be read keeps what the pre-order holds.
export const preOrderToDraft = (order: PreOrder, products: Map<string, PosProduct>): PreOrderDraft => {
  const items: PreOrderItem[] = [];
  for (const line of order.ordersProducts || []) {
    const id = lineProductId(line);
    if (!id) continue;
    const qty = getSafeQty(line.quantity);
    const existing = items.find((item) => item.product._id === id);
    // The backend merges repeated lines; do the same
    if (existing) {
      existing.qty += qty;
      continue;
    }
    const populated = typeof line.inventoryId === 'object' ? line.inventoryId : null;
    const unitPrice = line.unitPrice ?? 0;
    const product: PosProduct = products.get(id) ?? {
      _id: id,
      productName: populated?.productName || 'Unknown Product',
      productCode: populated?.productCode,
      SKU: populated?.SKU,
      sellingPrice: unitPrice,
      quantity: typeof line.stock === 'number' ? line.stock : 0,
    };
    items.push({ product, qty: Math.max(1, qty), unitPrice, priceEdited: true });
  }

  const person = order.creditPersonId || order.customerId;
  const personId = typeof person === 'object' && person ? person._id : person || '';
  const personRef = typeof person === 'object' && person ? person : null;
  const customer: PreOrderCustomer | null = personId
    ? {
        kind: 'persona',
        id: personId,
        name: personRef?.name || order.customerName || 'ဖောက်သည်',
        phone: personRef?.phone || order.customerPhone || '',
        address: personRef?.address || order.customerAddress,
      }
    : order.customerName || order.customerPhone
      ? { kind: 'typed', name: order.customerName || '', phone: order.customerPhone || '', address: order.customerAddress }
      : null;

  const discount = order.discount || 0;
  return {
    alreadyPaid: order.paidAmount || 0,
    form: {
      items,
      customer,
      priceMode: discount > 0 ? 'discount' : 'normal',
      discountAmount: discount,
      deposit: 0,
      paymentMethod: fromApiPaymentMethod(order.paymentMethod),
      expectedDate: order.expectedDate ? toMMDateKey(order.expectedDate) : '',
      note: order.note || '',
      delivery: {
        region: order.deliveryRegion || '',
        township: order.deliveryTownship || '',
        fee: order.deliveryFee || 0,
      },
    },
  };
};
