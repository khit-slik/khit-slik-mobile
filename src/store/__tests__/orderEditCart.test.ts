import type { PosOrderDetail, PosProduct } from '../../services/pos/types';
import { orderToDraft } from '../../features/pos/lib';
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

  it('saving clears the order being edited', () => {
    store().openCheckout();
    const sale = store().completeSale(order, null);
    expect(sale.items).toHaveLength(1);
    expect(store().editingOrder).toBeNull();
    expect(store().items).toEqual([]);
    expect(store().lastSale).toBe(sale);
  });
});
