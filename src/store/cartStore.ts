import { createContext, useContext, useMemo } from 'react';
import { create, useStore } from 'zustand';

import { YANGON_REGION_CODE } from '../features/preOrder/lib/preOrder';
import type { CreditPersona, PosOrder, PosOrderDetail, PosProduct } from '../services/pos/types';
import {
  getFinalPaidAmount,
  Totals,
  addItem,
  applyWholesaleTier,
  CartError,
  CartItem,
  CartResult,
  changeQty,
  computeTotals,
  getInitialPaidAmount,
  hasNoUpfrontPayment,
  isCod,
  getTodayDateString,
  isFoc,
  isCashdownKpayModeLocked,
  isOrderPaymentFormLocked,
  OrderEditDraft,
  OriginalQuantities,
  PAYMENT_METHODS,
  PaymentMethod,
  PaymentMode,
  PaymentType,
  PriceMode,
  removeItem,
  resolvePaymentMode,
  setItemQty,
  withFreshStock,
} from '../features/pos/lib';

// Business payment modes for regular POS orders
export type PaymentOption = 'paid' | 'credit' | 'foc';
export type PaymentForm = 'cod' | 'cash_down';

// What was sold, kept after the cart is cleared for the success screen and the receipt
export interface CompletedSale {
  order: PosOrder;
  items: CartItem[];
  totals: Totals;
  paymentMode?: PaymentMode;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  customer: CreditPersona | null;
  note: string;
  orderDate: string;
  completedAt: string;
}

export interface CartState {
  items: CartItem[];
  originalQuantities: OriginalQuantities;
  priceMode: PriceMode;
  discountPercent: number;
  markupAmount: number;
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
  isCheckoutOpen: boolean;
  // The saved order this cart is changing; null when making a new sale
  editingOrder: PosOrderDetail | null;
  lastSale: CompletedSale | null;
  // Goes up with every sale, so the product grid knows to reload stock
  saleCount: number;

  // Cart actions return the problem to show, if any
  addProduct: (product: PosProduct) => CartError | undefined;
  changeQty: (productId: string, delta: number) => CartError | undefined;
  setQty: (productId: string, qty: number) => CartError | undefined;
  applyWholesaleTier: (product: PosProduct, tierQuantity: number) => CartError | undefined;
  removeItem: (productId: string) => void;
  // Empties the cart but keeps the chosen payment options
  clearItems: () => void;
  // Newly loaded products: cart lines take their current stock (their prices stay as they are)
  refreshStock: (products: PosProduct[]) => void;
  // Fill the cart from a saved order, replacing whatever was in it
  startEdit: (draft: OrderEditDraft) => void;

  setPriceMode: (mode: PriceMode) => void;
  setDiscountPercent: (percent: number) => void;
  setMarkupAmount: (amount: number) => void;
  selectPaymentMode: (mode: PaymentMode) => void;
  selectPaymentOption: (option: PaymentOption) => void;
  selectPaymentForm: (form: PaymentForm) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setPaidAmount: (amount: number) => void;
  setCustomer: (customer: Pick<CreditPersona, '_id' | 'region' | 'township'> | null) => void;
  setDeliveryRegion: (region: string) => void;
  setDeliveryTownship: (township: string) => void;
  setDeliveryFee: (fee: number) => void;
  setNote: (note: string) => void;
  setOrderDate: (date: string) => void;

  openCheckout: () => void;
  closeCheckout: () => void;
  completeSale: (order: PosOrder, customer: CreditPersona | null) => CompletedSale;
  reset: () => void;
}

type CartData = Pick<
  CartState,
  | 'items'
  | 'originalQuantities'
  | 'priceMode'
  | 'discountPercent'
  | 'markupAmount'
  | 'paymentMode'
  | 'paymentType'
  | 'paymentMethod'
  | 'paidAmount'
  | 'creditPersonId'
  | 'deliveryRegion'
  | 'deliveryTownship'
  | 'deliveryFee'
  | 'note'
  | 'orderDate'
  | 'isCheckoutOpen'
  | 'editingOrder'
>;

const initialData = (): CartData => ({
  items: [],
  originalQuantities: {},
  priceMode: 'normal',
  discountPercent: 0,
  markupAmount: 0,
  paymentMode: null,
  paymentType: 'paid',
  paymentMethod: PAYMENT_METHODS.COD,
  paidAmount: 0,
  creditPersonId: '',
  deliveryRegion: '',
  deliveryTownship: '',
  deliveryFee: 0,
  note: '',
  orderDate: getTodayDateString(),
  isCheckoutOpen: false,
  editingOrder: null,
});

const totalOf = (state: Pick<CartData, 'items' | 'priceMode' | 'discountPercent' | 'markupAmount' | 'deliveryFee'>) =>
  computeTotals(state).total;

// Syncs paidAmount to confirmed rules:
// - COD (Option B): paidAmount = finalAmount
// - FOC: paidAmount = 0
// - Cashdown: full payment required when checkout opens or total grows
const withSyncedPaidAmount = (state: CartData): CartData => {
  const mode = state.paymentMode ?? resolvePaymentMode(state);
  if (mode === 'foc' || isFoc(state.paymentMethod)) {
    return { ...state, paidAmount: 0 };
  }
  if (mode === 'cod' || isCod(state.paymentMethod)) {
    return { ...state, paidAmount: Math.ceil(totalOf(state)) };
  }
  if (mode === 'cashdown' && state.isCheckoutOpen) {
    const total = Math.ceil(totalOf(state));
    if (state.paidAmount < total) {
      return { ...state, paidAmount: total };
    }
  }
  return state;
};

export const createCartStore = () => create<CartState>((set, get) => {
  const applyCartResult = (result: CartResult) => {
    set({ items: result.items });
    // Leaving the cart empty also closes checkout, like the web POS's cart modal
    if (result.items.length === 0) set({ isCheckoutOpen: false });
    return result.error;
  };

  const update = (patch: Partial<CartData>) => {
    set(withSyncedPaidAmount({ ...get(), ...patch }));
  };

  const modeFields = (
    mode: PaymentMode,
  ): Pick<CartData, 'paymentMode' | 'paymentType' | 'paymentMethod' | 'paidAmount' | 'priceMode' | 'discountPercent' | 'markupAmount'> => {
    const state = get();
    if (mode === 'cod') {
      return {
        paymentMode: 'cod',
        paymentType: 'paid',
        paymentMethod: PAYMENT_METHODS.COD,
        paidAmount: Math.ceil(totalOf(state)),
        priceMode: state.priceMode,
        discountPercent: state.discountPercent,
        markupAmount: state.markupAmount,
      };
    }
    if (mode === 'cashdown') {
      return {
        paymentMode: 'cashdown',
        paymentType: 'credit',
        paymentMethod: PAYMENT_METHODS.KBZ_PAY,
        paidAmount: Math.max(Math.ceil(totalOf(state)), state.paidAmount || 0),
        priceMode: state.priceMode,
        discountPercent: state.discountPercent,
        markupAmount: state.markupAmount,
      };
    }
    return {
      paymentMode: 'foc',
      paymentType: 'paid',
      paymentMethod: PAYMENT_METHODS.FOC,
      paidAmount: 0,
      priceMode: 'normal',
      discountPercent: 0,
      markupAmount: 0,
    };
  };

  const paymentFor = (form: PaymentForm): Pick<CartData, 'paymentMode' | 'paymentType' | 'paymentMethod' | 'paidAmount'> => {
    const fields = modeFields(form === 'cod' ? 'cod' : 'cashdown');
    return {
      paymentMode: fields.paymentMode,
      paymentType: fields.paymentType,
      paymentMethod: fields.paymentMethod,
      paidAmount: fields.paidAmount,
    };
  };

  return {
    ...initialData(),
    lastSale: null,
    saleCount: 0,

    addProduct: (product) => applyCartResult(addItem(get().items, product, get().originalQuantities)),
    changeQty: (productId, delta) =>
      applyCartResult(changeQty(get().items, productId, delta, get().originalQuantities)),
    setQty: (productId, qty) =>
      applyCartResult(setItemQty(get().items, productId, qty, get().originalQuantities)),
    applyWholesaleTier: (product, tierQuantity) =>
      applyCartResult(applyWholesaleTier(get().items, product, tierQuantity, get().originalQuantities)),
    removeItem: (productId) => {
      applyCartResult({ items: removeItem(get().items, productId) });
    },
    clearItems: () => {
      applyCartResult({ items: [] });
    },
    refreshStock: (products) => {
      const fresh = new Map(products.map((product) => [product._id, product]));
      const { items } = get();
      if (!items.some((item) => fresh.has(item.product._id))) return;
      set({
        items: items.map((item) => {
          const product = fresh.get(item.product._id);
          return product ? { ...item, product: withFreshStock(item.product, product) } : item;
        }),
      });
    },
    startEdit: (draft) => set({ ...initialData(), ...draft, editingOrder: draft.order }),

    setPriceMode: (priceMode) => {
      if (isFoc(get().paymentMethod)) return;
      if (priceMode === 'normal') update({ priceMode, discountPercent: 0, markupAmount: 0 });
      else if (priceMode === 'discount') update({ priceMode, markupAmount: 0 });
      else update({ priceMode, discountPercent: 0 });
    },
    setDiscountPercent: (percent) => update({ discountPercent: Number(percent) || 0 }),
    setMarkupAmount: (amount) => update({ markupAmount: Number(amount) || 0 }),

    selectPaymentMode: (mode) => {
      const state = get();
      if (isOrderPaymentFormLocked(state.editingOrder)) return;
      if (isCashdownKpayModeLocked(state.editingOrder) && mode !== 'cashdown') return;
      if (mode === 'cod' && state.deliveryRegion && state.deliveryRegion !== YANGON_REGION_CODE) return;
      update(modeFields(mode));
    },
    selectPaymentOption: (option) => {
      const state = get();
      if (isOrderPaymentFormLocked(state.editingOrder)) return;
      const targetMode = option === 'foc' ? 'foc' : option === 'credit' ? 'cashdown' : 'cod';
      if (isCashdownKpayModeLocked(state.editingOrder) && targetMode !== 'cashdown') return;
      if (option === 'foc') {
        update(modeFields('foc'));
      } else if (option === 'credit') {
        update(modeFields('cashdown'));
      } else {
        update(modeFields('cod'));
      }
    },
    selectPaymentForm: (form) => {
      const state = get();
      if (isOrderPaymentFormLocked(state.editingOrder)) return;
      if (isCashdownKpayModeLocked(state.editingOrder) && form !== 'cash_down') return;
      if (form === 'cod' && state.deliveryRegion && state.deliveryRegion !== YANGON_REGION_CODE) return;
      update(paymentFor(form));
    },
    setPaymentMethod: (paymentMethod) => {
      const state = get();
      if (state.paymentMode === 'cashdown' && paymentMethod !== PAYMENT_METHODS.KBZ_PAY) return;
      if (hasNoUpfrontPayment(state.paymentMethod) || hasNoUpfrontPayment(paymentMethod)) return;
      update({ paymentMethod });
    },
    setPaidAmount: (amount) => {
      const state = get();
      if (state.paymentMode === 'cod' || state.paymentMode === 'foc' || hasNoUpfrontPayment(state.paymentMethod)) return;
      const value = Number(amount);
      set({ paidAmount: Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0 });
    },
    setCustomer: (customer) => {
      const creditPersonId = customer?._id ?? '';
      // Keep a manual override or the saved order's destination when the same customer is reselected.
      const state = get();
      if (creditPersonId === state.creditPersonId) return;
      const customerDetails = {
        creditPersonId,
        deliveryRegion: customer?.region || '',
        deliveryTownship: customer?.region === YANGON_REGION_CODE ? customer?.township || '' : '',
      };
      if (!state.editingOrder) {
        if (!customer) {
          update({ ...customerDetails, paymentMode: null, paidAmount: 0 });
          return;
        }
        if (customer.region === YANGON_REGION_CODE) {
          update({ ...customerDetails, ...modeFields('cod') });
          return;
        }
        if (customer.region) {
          update({ ...customerDetails, ...modeFields('cashdown') });
          return;
        }
        // Empty customer region: allow both COD and Cashdown without silently defaulting
        update({ ...customerDetails, paymentMode: null, paidAmount: 0 });
        return;
      }
      set(customerDetails);
    },
    setDeliveryRegion: (deliveryRegion) => {
      if (deliveryRegion !== get().deliveryRegion) {
        // Decision 1: never auto-switch paymentMode when region changes outside Yangon; user must switch manually.
        set({ deliveryRegion, deliveryTownship: '' });
      }
    },
    setDeliveryTownship: (deliveryTownship) => set({ deliveryTownship }),
    setDeliveryFee: (deliveryFee) => {
      if (Number.isFinite(deliveryFee) && deliveryFee >= 0) update({ deliveryFee });
    },
    setNote: (note) => set({ note }),
    setOrderDate: (orderDate) => set({ orderDate }),

    openCheckout: () => {
      const state = get();
      if (state.items.length === 0) return;
      set({
        isCheckoutOpen: true,
        paidAmount: getInitialPaidAmount({
          paymentMode: state.paymentMode,
          paymentType: state.paymentType,
          paymentMethod: state.paymentMethod,
          paidAmount: state.paidAmount,
          total: totalOf(state),
        }),
      });
    },
    closeCheckout: () => set({ isCheckoutOpen: false }),

    // The order was saved: remember it and start a fresh cart
    completeSale: (order, customer) => {
      const state = get();
      const totals = computeTotals(state);
      const mode = state.paymentMode ?? resolvePaymentMode(state) ?? 'cod';
      const sale: CompletedSale = {
        order,
        items: state.items,
        totals,
        paymentMode: mode,
        paymentType: mode === 'cashdown' ? 'credit' : 'paid',
        paymentMethod: state.paymentMethod,
        paidAmount: getFinalPaidAmount(state.paymentMethod, state.paidAmount, totals.total, mode),
        customer,
        note: state.note,
        orderDate: state.orderDate,
        completedAt: new Date().toISOString(),
      };
      set({ ...initialData(), lastSale: sale, saleCount: state.saleCount + 1 });
      return sale;
    },

    // Empty cart and default options, with today's date (the last sale is kept)
    reset: () => set(initialData()),
  };
});

export type CartStore = ReturnType<typeof createCartStore>;

// The new-sale cart, and a separate one for editing a saved order so a sale in progress is kept
export const useCartStore = createCartStore();
export const useOrderEditCartStore = createCartStore();

// Which cart the shared POS components (product grid, cart sheet, checkout form) work on
export const CartStoreContext = createContext<CartStore>(useCartStore);

export const useCartStoreApi = () => useContext(CartStoreContext);

export const useCart = <T>(selector: (state: CartState) => T) => useStore(useCartStoreApi(), selector);

// Totals for the current cart; memoised so components don't re-render on unrelated changes
export const useCartTotals = () => {
  const items = useCart((state) => state.items);
  const priceMode = useCart((state) => state.priceMode);
  const discountPercent = useCart((state) => state.discountPercent);
  const markupAmount = useCart((state) => state.markupAmount);
  const deliveryFee = useCart((state) => state.deliveryFee);
  return useMemo(
    () => computeTotals({ items, priceMode, discountPercent, markupAmount, deliveryFee }),
    [items, priceMode, discountPercent, markupAmount, deliveryFee],
  );
};
