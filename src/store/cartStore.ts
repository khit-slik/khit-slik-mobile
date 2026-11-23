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
  OrderEditDraft,
  OriginalQuantities,
  PAYMENT_METHODS,
  PaymentMethod,
  PaymentType,
  PriceMode,
  removeItem,
  setItemQty,
  withFreshStock,
} from '../features/pos/lib';

// The three payment choices on the checkout screen; FOC is a paid order with method FOC
export type PaymentOption = 'paid' | 'credit' | 'foc';
export type PaymentForm = 'cod' | 'cash_down';

// What was sold, kept after the cart is cleared for the success screen and the receipt
export interface CompletedSale {
  order: PosOrder;
  items: CartItem[];
  totals: Totals;
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
  selectPaymentOption: (option: PaymentOption) => void;
  selectPaymentForm: (form: PaymentForm) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setPaidAmount: (amount: number) => void;
  setCustomer: (customer: Pick<CreditPersona, '_id' | 'region' | 'township'> | null) => void;
  setDeliveryRegion: (region: string) => void;
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
  paymentType: 'paid',
  paymentMethod: PAYMENT_METHODS.CASH,
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

// A regular paid order follows its total while checkout is open.
const withSyncedPaidAmount = (state: CartData): CartData => {
  if (hasNoUpfrontPayment(state.paymentMethod)) {
    return { ...state, paidAmount: 0 };
  }
  if (!state.isCheckoutOpen || state.paymentType !== 'paid') {
    return state;
  }
  return { ...state, paidAmount: Math.ceil(totalOf(state)) };
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

  const paymentFor = (form: PaymentForm): Pick<CartData, 'paymentType' | 'paymentMethod' | 'paidAmount'> => {
    const cod = form === 'cod';
    return {
      paymentType: cod ? 'credit' : 'paid',
      paymentMethod: cod ? PAYMENT_METHODS.COD : PAYMENT_METHODS.CASH,
      paidAmount: cod ? 0 : Math.ceil(totalOf(get())),
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

    selectPaymentOption: (option) => {
      if (option === 'paid') {
        const state = get();
        set({
          paymentType: 'paid',
          paymentMethod: PAYMENT_METHODS.CASH,
          paidAmount: Math.ceil(totalOf(state)),
        });
      } else if (option === 'credit') {
        if (isCod(get().paymentMethod)) return;
        set({ paymentType: 'credit', paymentMethod: PAYMENT_METHODS.CASH, paidAmount: 0 });
      } else {
        set({
          paymentType: 'paid',
          paymentMethod: PAYMENT_METHODS.FOC,
          paidAmount: 0,
          priceMode: 'normal',
          discountPercent: 0,
          markupAmount: 0,
        });
      }
    },
    selectPaymentForm: (form) => {
      const state = get();
      if (state.editingOrder || isFoc(state.paymentMethod) || isCod(state.paymentMethod) === (form === 'cod')) return;
      update(paymentFor(form));
    },
    setPaymentMethod: (paymentMethod) => {
      if (hasNoUpfrontPayment(get().paymentMethod) || hasNoUpfrontPayment(paymentMethod)) return;
      update({ paymentMethod });
    },
    setPaidAmount: (amount) => {
      if (hasNoUpfrontPayment(get().paymentMethod)) return;
      const value = Number(amount);
      set({ paidAmount: Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0 });
    },
    setCustomer: (customer) => {
      const creditPersonId = customer?._id ?? '';
      // Keep a manual override or the saved order's destination when the same customer is reselected.
      const state = get();
      if (creditPersonId === state.creditPersonId) return;
      const cod = isCod(state.paymentMethod);
      const customerDetails = {
        creditPersonId,
        deliveryRegion: customer?.region || '',
        deliveryTownship: customer?.region ? customer.township || '' : '',
      };
      if (!state.editingOrder && !isFoc(state.paymentMethod) && (state.paymentType === 'paid' || cod)) {
        const isYangon = customer?.region === YANGON_REGION_CODE;
        if (isYangon !== cod) {
          update({ ...customerDetails, ...paymentFor(isYangon ? 'cod' : 'cash_down') });
          return;
        }
      }
      set(customerDetails);
    },
    setDeliveryRegion: (deliveryRegion) => {
      if (deliveryRegion !== get().deliveryRegion) set({ deliveryRegion, deliveryTownship: '' });
    },
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
      const sale: CompletedSale = {
        order,
        items: state.items,
        totals: computeTotals(state),
        paymentType: state.paymentType,
        paymentMethod: state.paymentMethod,
        paidAmount: getFinalPaidAmount(state.paymentMethod, state.paidAmount),
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
