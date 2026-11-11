import type { PosProduct } from '../../../../services/pos/types';
import type { PreOrder } from '../../../../services/preOrder/types';
import { PAYMENT_METHODS } from '../../../pos/lib';
import {
  addPreOrderItem,
  buildPreOrderCreatePayload,
  buildPreOrderUpdatePayload,
  changePreOrderQty,
  computePreOrderTotals,
  emptyPreOrderForm,
  PreOrderForm,
  preOrderToDraft,
  removePreOrderItem,
  setPreOrderPrice,
  setPreOrderQty,
  toMMDateKey,
  validatePreOrder,
} from '../preOrder';

const product = (id: string, overrides: Partial<PosProduct> = {}): PosProduct => ({
  _id: id,
  productName: `Product ${id}`,
  sellingPrice: 1000,
  quantity: 0,
  ...overrides,
});

const tiered = product('t', { sellingPrice: 1000, wholesalePrices: [{ quantity: 10, price: 800 }] });

const form = (overrides: Partial<PreOrderForm> = {}): PreOrderForm => ({
  ...emptyPreOrderForm(),
  customer: { kind: 'persona', id: '64b000000000000000000001', name: 'Ko Aung', phone: '0911' },
  ...overrides,
});

describe('pre-order cart', () => {
  it('adds out-of-stock products and counts up on repeat taps', () => {
    let items = addPreOrderItem([], product('a', { quantity: 0 }));
    items = addPreOrderItem(items, product('a', { quantity: 0 }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ qty: 2, unitPrice: 1000, priceEdited: false });
  });

  it('has no stock limit on the quantity', () => {
    const items = setPreOrderQty(addPreOrderItem([], product('a', { quantity: 1 })), 'a', 50);
    expect(items[0].qty).toBe(50);
  });

  it('keeps the quantity at 1 or more', () => {
    const items = addPreOrderItem([], product('a'));
    expect(changePreOrderQty(items, 'a', -1)[0].qty).toBe(1);
    expect(setPreOrderQty(items, 'a', 0)[0].qty).toBe(1);
    expect(setPreOrderQty(items, 'a', 3.7)[0].qty).toBe(3);
  });

  it('follows the wholesale tier until a price is typed', () => {
    let items = setPreOrderQty(addPreOrderItem([], tiered), 't', 10);
    expect(items[0].unitPrice).toBe(800);
    items = setPreOrderPrice(items, 't', 900);
    items = setPreOrderQty(items, 't', 20);
    expect(items[0]).toMatchObject({ unitPrice: 900, priceEdited: true, qty: 20 });
  });

  it('removes a line', () => {
    const items = addPreOrderItem(addPreOrderItem([], product('a')), product('b'));
    expect(removePreOrderItem(items, 'a').map((item) => item.product._id)).toEqual(['b']);
  });
});

describe('computePreOrderTotals', () => {
  it('gives the balance after the deposit (50,000 with 10,000 down leaves 40,000)', () => {
    const items = setPreOrderQty(addPreOrderItem([], product('a', { sellingPrice: 5000 })), 'a', 10);
    const totals = computePreOrderTotals(form({ items, deposit: 10000 }));
    expect(totals).toMatchObject({ subtotal: 50000, total: 50000, paid: 10000, balance: 40000, itemCount: 10 });
  });

  it('takes the discount off the goods only and adds the delivery fee', () => {
    const items = setPreOrderQty(addPreOrderItem([], product('a')), 'a', 10);
    const totals = computePreOrderTotals(
      form({ items, priceMode: 'discount', discountAmount: 2000, delivery: { region: 'yangon', township: '', fee: 3000 } }),
    );
    expect(totals).toMatchObject({ subtotal: 10000, discountAmount: 2000, deliveryFee: 3000, total: 11000 });
  });

  it('ignores the discount in normal price mode', () => {
    const items = addPreOrderItem([], product('a'));
    expect(computePreOrderTotals(form({ items, discountAmount: 500 })).discountAmount).toBe(0);
  });

  it('uses what was already paid when editing', () => {
    const items = addPreOrderItem([], product('a'));
    expect(computePreOrderTotals(form({ items, deposit: 999 }), 300)).toMatchObject({ paid: 300, balance: 700 });
  });
});

describe('validatePreOrder', () => {
  const items = addPreOrderItem([], product('a'));

  it('needs products and a customer', () => {
    expect(validatePreOrder(form({ items: [] }))).toMatch(/ပစ္စည်း/);
    expect(validatePreOrder(form({ items, customer: null }))).toMatch(/ဝယ်သူ/);
    expect(validatePreOrder(form({ items, customer: { kind: 'typed', name: 'A', phone: ' ' } }))).toMatch(/ဖုန်း/);
  });

  it('refuses a deposit above the total', () => {
    expect(validatePreOrder(form({ items, deposit: 1001 }))).toMatch(/စရံငွေ/);
    expect(validatePreOrder(form({ items, deposit: 1000 }))).toBeNull();
  });

  it('refuses a discount above the subtotal', () => {
    expect(validatePreOrder(form({ items, priceMode: 'discount', discountAmount: 2000 }))).toMatch(/လျှော့ဈေး/);
  });

  it('refuses an edited total below what was already paid', () => {
    expect(validatePreOrder(form({ items }), 1500)).toMatch(/ပေးပြီးငွေ/);
    expect(validatePreOrder(form({ items }), 1000)).toBeNull();
  });
});

describe('payloads', () => {
  it('sends typed prices only, the API payment method and the deposit', () => {
    let items = addPreOrderItem(addPreOrderItem([], product('a')), product('b'));
    items = setPreOrderPrice(items, 'b', 1500);
    const payload = buildPreOrderCreatePayload(
      form({
        items,
        deposit: 500,
        paymentMethod: PAYMENT_METHODS.KBZ_PAY,
        expectedDate: '2026-12-01',
        note: '  call first ',
        delivery: { region: 'mandalay', township: 'kept-out', fee: 0 },
      }),
    );
    expect(payload).toEqual({
      ordersProducts: [
        { inventoryId: 'a', quantity: 1 },
        { inventoryId: 'b', quantity: 1, unitPrice: 1500 },
      ],
      discount: 0,
      paymentMethod: 'kpay',
      expectedDate: '2026-12-01',
      note: 'call first',
      deliveryRegion: 'mandalay',
      deliveryTownship: null,
      deliveryFee: 0,
      creditPersonId: '64b000000000000000000001',
      paidAmount: 500,
    });
  });

  it('sends a typed customer by name and phone, and no deposit on update', () => {
    const payload = buildPreOrderUpdatePayload(
      form({
        items: addPreOrderItem([], product('a')),
        customer: { kind: 'typed', name: ' Ma Hla ', phone: ' 0922 ', address: '' },
        delivery: { region: 'yangon', township: 'kamayut', fee: 2000 },
      }),
    );
    expect(payload).toMatchObject({
      customerName: 'Ma Hla',
      customerPhone: '0922',
      deliveryTownship: 'kamayut',
      deliveryFee: 2000,
    });
    expect(payload).not.toHaveProperty('paidAmount');
    expect(payload).not.toHaveProperty('customerAddress');
    expect(payload).not.toHaveProperty('creditPersonId');
  });
});

describe('preOrderToDraft', () => {
  const saved: PreOrder = {
    _id: 'po1',
    orderNumber: 'PO-1',
    ordersProducts: [
      { inventoryId: { _id: 'a', productName: 'Oil' }, quantity: 2, unitPrice: 900, stock: 1 },
      { inventoryId: 'gone', quantity: 1, unitPrice: 300, stock: null },
      { inventoryId: { _id: 'a', productName: 'Oil' }, quantity: 1, unitPrice: 900 },
    ],
    discount: 100,
    paidAmount: 1000,
    paymentMethod: 'wavepay',
    expectedDate: '2026-11-30T00:00:00.000Z',
    creditPersonId: { _id: 'c1', name: 'Ko Aung', phone: '0911' },
    deliveryRegion: 'yangon',
    deliveryTownship: 'kamayut',
    deliveryFee: 500,
    note: 'n',
  };

  it('keeps saved prices, merges repeated lines and reads fresh products', () => {
    const fresh = new Map([['a', product('a', { productName: 'Oil', sellingPrice: 1000, quantity: 7 })]]);
    const { form: draft, alreadyPaid } = preOrderToDraft(saved, fresh);
    expect(alreadyPaid).toBe(1000);
    expect(draft.items.map((item) => [item.product._id, item.qty, item.unitPrice, item.priceEdited])).toEqual([
      ['a', 3, 900, true],
      ['gone', 1, 300, true],
    ]);
    expect(draft.items[0].product.quantity).toBe(7);
    expect(draft).toMatchObject({
      customer: { kind: 'persona', id: 'c1', name: 'Ko Aung' },
      priceMode: 'discount',
      discountAmount: 100,
      paymentMethod: PAYMENT_METHODS.WAVE_PAY,
      expectedDate: '2026-11-30',
      delivery: { region: 'yangon', township: 'kamayut', fee: 500 },
    });
  });

  it('brings back a typed customer', () => {
    const { form: draft } = preOrderToDraft(
      { ...saved, creditPersonId: null, customerName: 'Ma Hla', customerPhone: '0922' },
      new Map(),
    );
    expect(draft.customer).toEqual({ kind: 'typed', name: 'Ma Hla', phone: '0922', address: undefined });
  });
});

describe('toMMDateKey', () => {
  it('reads the date in Myanmar time', () => {
    expect(toMMDateKey('2026-11-11T18:00:00.000Z')).toBe('2026-11-12');
    expect(toMMDateKey('2026-11-11T17:00:00.000Z')).toBe('2026-11-11');
    expect(toMMDateKey('not a date')).toBe('');
  });
});
