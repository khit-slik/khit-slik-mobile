import type { PosOrderDetail, PosProduct } from '../../services/pos/types';
import { buildUpdateOrderPayload, computeTotals, orderToDraft } from '../../features/pos/lib';
import { useCartStore, useOrderEditCartStore } from '../cartStore';

// No shelf stock left, but the order holds 2
const oil: PosProduct = { _id: 'oil', productName: 'Oil', sellingPrice: 1000, availableQuantity: 0 };

const order: PosOrderDetail = {
  _id: 'order1',
  orderNumber: 'INV/0001',
  ordersProducts: [{ inventoryId: { _id: 'oil' }, quantity: 2, unitPrice: 950 }],
  subTotal: 1900,
  discount: 0,
  finalAmount: 1900,
  paidAmount: 1900,
  paymentType: 'paid',
  paymentMethod: 'cash',
};

const store = () => useOrderEditCartStore.getState();

beforeEach(() => {
  useCartStore.getState().reset();
  store().reset();
  store().startEdit(orderToDraft(order, new Map([['oil', oil]])).draft);
});

describe('order edit cart', () => {
  it('is separate from the new-sale cart', () => {
    expect(store().items).toHaveLength(1);
    expect(store().editingOrder?._id).toBe('order1');
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('can use the stock the order already holds, and no more', () => {
    expect(store().setQty('oil', 2)).toBeUndefined();
    expect(store().setQty('oil', 3)).toBe('EXCEEDS_STOCK');
  });

  it('takes fresh stock from the grid but keeps the sold price', () => {
    store().refreshStock([{ ...oil, availableQuantity: 5, sellingPrice: 1200 }]);
    expect(store().items[0].product.availableQuantity).toBe(5);
    expect(store().items[0].product.sellingPrice).toBe(950);
    expect(store().setQty('oil', 7)).toBeUndefined();
  });

  it('keeps the saved destination and counts the fee once when editing an order', () => {
    const savedOrder: PosOrderDetail = {
      ...order,
      creditPersonId: 'cp1',
      deliveryRegion: 'yangon',
      deliveryTownship: 'hlaing',
      deliveryFee: 500,
      finalAmount: 2500,
      paidAmount: 2500,
    };
    store().startEdit(orderToDraft(savedOrder, new Map([['oil', oil]])).draft);
    store().openCheckout();
    store().setCustomer({ _id: 'cp1', region: 'mandalay' });

    const state = store();
    const totals = computeTotals(state);
    expect(totals).toMatchObject({ markupAmount: 100, deliveryFee: 500, total: 2500 });
    expect(buildUpdateOrderPayload({ ...state, totals })).toMatchObject({
      creditPersonId: 'cp1',
      deliveryRegion: 'yangon',
      deliveryTownship: 'hlaing',
      deliveryFee: 500,
      finalAmount: 2500,
      paidAmount: 2500,
    });
  });

  it('saving clears the order being edited', () => {
    store().openCheckout();
    const sale = store().completeSale(order, null);
    expect(sale.items).toHaveLength(1);
    expect(store().editingOrder).toBeNull();
    expect(store().items).toEqual([]);
    expect(store().lastSale).toBe(sale);
  });
});
