import { createContext, useContext, useMemo } from 'react';
import { create, useStore } from 'zustand';

import type { PosProduct } from '../services/pos/types';
import type { PreOrder } from '../services/preOrder/types';
import {
  addPreOrderItem,
  changePreOrderQty,
  computePreOrderTotals,
  emptyPreOrderForm,
  PreOrderCustomer,
  PreOrderDelivery,
  PreOrderDraft,
  PreOrderForm,
  PreOrderItem,
  PreOrderPriceMode,
  PreOrderTotals,
  removePreOrderItem,
  setPreOrderPrice,
  setPreOrderQty,
} from '../features/preOrder/lib';
import type { PaymentMethod } from '../features/pos/lib';

// What was saved, kept after the form is cleared for the success screen and the voucher
export interface SavedPreOrder {
  order: PreOrder;
  items: PreOrderItem[];
  totals: PreOrderTotals;
  customer: PreOrderCustomer | null;
  paymentMethod: PaymentMethod;
  isEdit: boolean;
  savedAt: string;
}

export interface PreOrderState extends PreOrderForm {
  // The saved pre-order this form is changing, and what its customer has paid so far; null when new
  editing: { order: PreOrder; alreadyPaid: number } | null;
  lastSaved: SavedPreOrder | null;
  // Goes up with every save, so the product grid reloads stock
  saveCount: number;

  addProduct: (product: PosProduct) => void;
  changeQty: (productId: string, delta: number) => void;
  setQty: (productId: string, qty: number) => void;
  setPrice: (productId: string, price: number) => void;
  removeItem: (productId: string) => void;
  clearItems: () => void;
  // Newly loaded products: lines take their current stock (their prices stay as they are)
  refreshStock: (products: PosProduct[]) => void;

  setCustomer: (customer: PreOrderCustomer | null) => void;
  setPriceMode: (mode: PreOrderPriceMode) => void;
  setDiscountAmount: (amount: number) => void;
  setDeposit: (amount: number) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setExpectedDate: (date: string) => void;
  setNote: (note: string) => void;
  setDelivery: (changes: Partial<PreOrderDelivery>) => void;

  // Fill the form from a saved pre-order, replacing whatever was in it
  startEdit: (order: PreOrder, draft: PreOrderDraft) => void;
  completeSave: (order: PreOrder) => SavedPreOrder;
  reset: () => void;
}

const money = (value: number) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

export const createPreOrderStore = () =>
  create<PreOrderState>((set, get) => ({
    ...emptyPreOrderForm(),
    editing: null,
    lastSaved: null,
    saveCount: 0,

    addProduct: (product) => set({ items: addPreOrderItem(get().items, product) }),
    changeQty: (productId, delta) => set({ items: changePreOrderQty(get().items, productId, delta) }),
    setQty: (productId, qty) => set({ items: setPreOrderQty(get().items, productId, qty) }),
    setPrice: (productId, price) => set({ items: setPreOrderPrice(get().items, productId, price) }),
    removeItem: (productId) => set({ items: removePreOrderItem(get().items, productId) }),
    clearItems: () => set({ items: [] }),
    refreshStock: (products) => {
      const fresh = new Map(products.map((product) => [product._id, product]));
      const { items } = get();
      if (!items.some((item) => fresh.has(item.product._id))) return;
      set({
        items: items.map((item) => {
          const product = fresh.get(item.product._id);
          return product
            ? {
                ...item,
                product: {
                  ...item.product,
                  availableQuantity: product.availableQuantity,
                  quantity: product.quantity,
                  stockShop: product.stockShop,
                },
              }
            : item;
        }),
      });
    },

    setCustomer: (customer) => set({ customer }),
    setPriceMode: (priceMode) => set(priceMode === 'normal' ? { priceMode, discountAmount: 0 } : { priceMode }),
    setDiscountAmount: (amount) => set({ discountAmount: money(amount) }),
    setDeposit: (amount) => set({ deposit: money(amount) }),
    setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
    setExpectedDate: (expectedDate) => set({ expectedDate }),
    setNote: (note) => set({ note }),
    setDelivery: (changes) => {
      const delivery = { ...get().delivery, ...changes };
      if (changes.fee !== undefined) delivery.fee = money(changes.fee);
      set({ delivery });
    },

    startEdit: (order, draft) =>
      set({ ...emptyPreOrderForm(), ...draft.form, editing: { order, alreadyPaid: draft.alreadyPaid } }),

    // The pre-order was saved: remember it and start a fresh form
    completeSave: (order) => {
      const state = get();
      const saved: SavedPreOrder = {
        order,
        items: state.items,
        totals: computePreOrderTotals(state, state.editing?.alreadyPaid ?? null),
        customer: state.customer,
        paymentMethod: state.paymentMethod,
        isEdit: !!state.editing,
        savedAt: new Date().toISOString(),
      };
      set({ ...emptyPreOrderForm(), editing: null, lastSaved: saved, saveCount: state.saveCount + 1 });
      return saved;
    },

    // Empty form (the last save is kept)
    reset: () => set({ ...emptyPreOrderForm(), editing: null }),
  }));

export type PreOrderStore = ReturnType<typeof createPreOrderStore>;

// A new pre-order, and a separate form for editing a saved one so one in progress is kept
export const usePreOrderStore = createPreOrderStore();
export const usePreOrderEditStore = createPreOrderStore();

// Which form the shared pre-order components work on
export const PreOrderStoreContext = createContext<PreOrderStore>(usePreOrderStore);

export const usePreOrderStoreApi = () => useContext(PreOrderStoreContext);

export const usePreOrder = <T>(selector: (state: PreOrderState) => T) => useStore(usePreOrderStoreApi(), selector);

export const usePreOrderTotals = () => {
  const items = usePreOrder((state) => state.items);
  const priceMode = usePreOrder((state) => state.priceMode);
  const discountAmount = usePreOrder((state) => state.discountAmount);
  const deposit = usePreOrder((state) => state.deposit);
  const delivery = usePreOrder((state) => state.delivery);
  const alreadyPaid = usePreOrder((state) => state.editing?.alreadyPaid ?? null);
  return useMemo(
    () => computePreOrderTotals({ items, priceMode, discountAmount, deposit, delivery }, alreadyPaid),
    [items, priceMode, discountAmount, deposit, delivery, alreadyPaid],
  );
};
