import type { PosOrderDetail, PosProduct } from '../../../../services/pos/types';
import { CheckoutInput, getTodayDateString } from '../checkout';
import {
  buildUpdateOrderPayload,
  getOrderCustomerId,
  getOriginalQuantities,
  getProductsWithLessStock,
  getTouchedProductIds,
  isCashdownKpayModeLocked,
  isOrderEditLocked,
  isOrderPaymentFormLocked,
  orderToDraft,
  withFreshStock,
} from '../orderEdit';
import { PAYMENT_METHODS } from '../paymentMethods';
import { computeTotals } from '../pricing';

const oil: PosProduct = {
  _id: 'oil',
  productName: 'Oil',
  sellingPrice: 1000,
  availableQuantity: 4,
  wholesalePrices: [{ quantity: 10, price: 900 }],
};
const filter: PosProduct = { _id: 'filter', productName: 'Filter', sellingPrice: 500, availableQuantity: 0 };

const order = (overrides: Partial<PosOrderDetail> = {}): PosOrderDetail => ({
  _id: 'order1',
  orderNumber: 'INV/0001',
  ordersProducts: [
    { inventoryId: { _id: 'oil', productName: 'Oil' }, quantity: 2, unitPrice: 1000 },
    { inventoryId: { _id: 'filter', productName: 'Filter' }, quantity: 1, unitPrice: 500 },
  ],
  subTotal: 2500,
  discount: 0,
  finalAmount: 2500,
  paidAmount: 2500,
  paymentType: 'paid',
  paymentMethod: 'cod',
  note: 'deliver tomorrow',
  createdAt: '2026-10-20T08:30:00.000Z',
  ...overrides,
});

const fresh = new Map([
  ['oil', oil],
  ['filter', filter],
]);

describe('getOriginalQuantities', () => {
  it('adds up duplicate lines and skips lines without a product', () => {
    expect(
      getOriginalQuantities(
        order({
          ordersProducts: [
            { inventoryId: 'oil', quantity: 2 },
            { inventoryId: { _id: 'oil' }, quantity: 3 },
            { inventoryId: null, quantity: 1 },
          ],
        }),
      ),
    ).toEqual({ oil: 5 });
  });
});

describe('orderToDraft', () => {
  it('fills the cart and payment options from the order', () => {
    const { draft, missingLines } = orderToDraft(order(), fresh);
    expect(missingLines).toBe(0);
    expect(draft.items).toEqual([
      { product: oil, qty: 2 },
      { product: filter, qty: 1 },
    ]);
    expect(draft.originalQuantities).toEqual({ oil: 2, filter: 1 });
    expect(draft.priceMode).toBe('normal');
    expect(draft.paymentType).toBe('paid');
    expect(draft.paymentMode).toBe('cod');
    expect(draft.paymentMethod).toBe(PAYMENT_METHODS.COD);
    expect(draft.paidAmount).toBe(2500);
    expect(draft.note).toBe('deliver tomorrow');
    expect(draft.orderDate).toBe(getTodayDateString(new Date('2026-10-20T08:30:00.000Z')));
  });

  it('turns the discount amount back into the same percent', () => {
    const { draft } = orderToDraft(order({ discount: 250, finalAmount: 2250 }), fresh);
    expect(draft.priceMode).toBe('discount');
    const totals = computeTotals(draft);
    expect(totals.discountAmount).toBe(250);
    expect(totals.total).toBe(2250);
  });

  it('carries historical markup as read-only legacyMarkup without treating tax, delivery, or rounding as markup', () => {
    // Use non-wholesale product (1000 MMK) so qty 10 -> 10,000 MMK exact
    const silk: PosProduct = { _id: 'silk', productName: 'Silk', sellingPrice: 1000, availableQuantity: 20 };
    const silkMap = new Map([['silk', silk]]);
    // Plan fixture: subTotal 10,000 + deliveryFee 1,200, finalAmount 11,700 => legacyMarkup 500
    const { draft } = orderToDraft(
      order({
        ordersProducts: [{ inventoryId: { _id: 'silk', productName: 'Silk' }, quantity: 10, unitPrice: 1000 }],
        subTotal: 10000,
        discount: 0,
        deliveryFee: 1200,
        finalAmount: 11700,
        paidAmount: 11700,
      }),
      silkMap,
    );
    expect(draft.priceMode).toBe('normal');
    expect(draft.legacyMarkup).toBe(500);
    expect(draft.inheritedTax).toBe(0);
    expect(computeTotals(draft)).toMatchObject({
      subtotal: 10000,
      markupAmount: 500,
      deliveryFee: 1200,
      total: 11700,
    });

    // Increasing goods to 12,000 keeps 500 MMK legacy adjustment => 13,700
    const updatedTotals = computeTotals({
      ...draft,
      items: [{ product: silk, qty: 12 }],
    });
    expect(updatedTotals).toMatchObject({ subtotal: 12000, markupAmount: 500, deliveryFee: 1200, total: 13700 });

    // Tax + delivery order (no markup): subTotal 10,000 + tax 500 + delivery 1,200 = 11,700 => legacyMarkup 0
    const taxed = orderToDraft(
      order({
        ordersProducts: [{ inventoryId: { _id: 'silk', productName: 'Silk' }, quantity: 10, unitPrice: 1000 }],
        subTotal: 10000,
        tax: 500,
        deliveryFee: 1200,
        finalAmount: 11700,
        paidAmount: 11700,
      }),
      silkMap,
    ).draft;
    expect(taxed.legacyMarkup).toBe(0);
    expect(taxed.inheritedTax).toBe(500);
    expect(computeTotals(taxed).total).toBe(11700);
    expect(
      buildUpdateOrderPayload({
        ...taxed,
        totals: computeTotals(taxed),
        note: 'note only edit',
      }),
    ).toMatchObject({ tax: 500, finalAmount: 11700 });

    // Sub-kyat rounding drift never creates legacy markup
    const rounded = orderToDraft(
      order({ subTotal: 1000, discount: 333.4, finalAmount: 667 }),
      fresh,
    ).draft;
    expect(rounded.legacyMarkup).toBe(0);
  });

  it('keeps FOC orders free for both canonical and legacy FOC shapes', () => {
    const legacy = orderToDraft(order({ paymentType: 'paid', paymentMethod: 'foc', paidAmount: 0, discount: 100 }), fresh);
    expect(legacy.draft.paymentMode).toBe('foc');
    expect(legacy.draft.paymentType).toBe('foc');
    expect(legacy.draft.paymentMethod).toBe(PAYMENT_METHODS.FOC);
    expect(legacy.draft.priceMode).toBe('normal');
    expect(legacy.draft.paidAmount).toBe(0);

    const canonical = orderToDraft(order({ paymentType: 'foc', paymentMethod: 'foc', paidAmount: 0 }), fresh);
    expect(canonical.draft.paymentMode).toBe('foc');
    expect(canonical.draft.paymentType).toBe('foc');
    expect(canonical.draft.paymentMethod).toBe(PAYMENT_METHODS.FOC);
    expect(canonical.draft.paidAmount).toBe(0);
  });

  it('takes the credit customer from creditPersonId, or customerId on older orders', () => {
    const credit = order({ paymentType: 'credit', paymentMethod: 'kpay', paidAmount: 1000, creditPersonId: { _id: 'cp1', name: 'Ko Aung' } });
    expect(orderToDraft(credit, fresh).draft.creditPersonId).toBe('cp1');
    expect(orderToDraft(credit, fresh).draft.paymentType).toBe('credit');
    expect(getOrderCustomerId(order({ creditPersonId: null, customerId: 'cp2' }))).toBe('cp2');
  });

  it('keeps the sold price when it differs from today', () => {
    const repriced = order({
      ordersProducts: [{ inventoryId: { _id: 'oil' }, quantity: 2, unitPrice: 950 }],
    });
    const [line] = orderToDraft(repriced, fresh).draft.items;
    expect(line.product.sellingPrice).toBe(950);
    expect(line.product.availableQuantity).toBe(4);
  });

  it('uses today’s product as it is when the price matches, wholesale tier included', () => {
    const wholesale = order({
      ordersProducts: [{ inventoryId: { _id: 'oil' }, quantity: 10, unitPrice: 900 }],
    });
    expect(orderToDraft(wholesale, fresh).draft.items[0].product).toBe(oil);
  });

  it('falls back to the order’s details for a product that could not be loaded', () => {
    const { draft, missingLines } = orderToDraft(
      order({
        ordersProducts: [
          { inventoryId: { _id: 'gone', productName: 'Old belt', productCode: 'B1' }, quantity: 1, unitPrice: 700 },
          { inventoryId: null, quantity: 1, unitPrice: 100 },
        ],
      }),
      new Map(),
    );
    expect(missingLines).toBe(1);
    expect(draft.items).toEqual([
      {
        product: { _id: 'gone', productName: 'Old belt', productCode: 'B1', SKU: undefined, sellingPrice: 700, availableQuantity: 0 },
        qty: 1,
      },
    ]);
  });
});

describe('withFreshStock', () => {
  it('takes only the stock fields', () => {
    const cartProduct = { ...oil, sellingPrice: 950 };
    expect(withFreshStock(cartProduct, { ...oil, availableQuantity: 1, sellingPrice: 1200 })).toEqual({
      ...cartProduct,
      availableQuantity: 1,
    });
  });
});

describe('buildUpdateOrderPayload', () => {
  const items = [{ product: oil, qty: 10 }];
  const input = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
    items,
    totals: computeTotals({ items, priceMode: 'normal', discountPercent: 0 }),
    paymentType: 'paid',
    paymentMethod: PAYMENT_METHODS.CASH,
    paidAmount: 9000,
    creditPersonId: '',
    deliveryRegion: '',
    deliveryTownship: '',
    note: '',
    orderDate: '2026-10-23',
    ...overrides,
  });

  it('sends each line’s price, wholesale tier included', () => {
    expect(
      buildUpdateOrderPayload(input({ paymentMode: 'cashdown', paymentMethod: PAYMENT_METHODS.KBZ_PAY, paymentType: 'credit' })).ordersProducts,
    ).toEqual([{ inventoryId: 'oil', quantity: 10, unitPrice: 900 }]);
  });

  it('sends null to take the customer off', () => {
    expect(buildUpdateOrderPayload(input()).creditPersonId).toBeNull();
    expect(buildUpdateOrderPayload(input({ creditPersonId: 'cp1' })).creditPersonId).toBe('cp1');
  });

  it('records nothing paid for FOC', () => {
    expect(buildUpdateOrderPayload(input({ paymentMode: 'foc', paymentMethod: PAYMENT_METHODS.FOC })).paidAmount).toBe(0);
  });

  it('sends COD under Option B (paid, paidAmount = finalAmount) when updating the order', () => {
    expect(
      buildUpdateOrderPayload(input({ paymentMode: 'cod', paymentMethod: PAYMENT_METHODS.COD, paidAmount: 0 })),
    ).toMatchObject({
      paymentMethod: 'cod',
      paymentType: 'paid',
      paidAmount: 9000,
    });
  });
});

describe('stock changed by the edit', () => {
  const original = { oil: 2, filter: 1 };
  const items = [
    { product: oil, qty: 3 },
    { product: { ...filter, _id: 'belt' }, qty: 1 },
  ];

  it('finds products the edit took more of', () => {
    expect(getProductsWithLessStock(items, original)).toEqual(['oil', 'belt']);
    expect(getProductsWithLessStock([{ product: oil, qty: 2 }], original)).toEqual([]);
  });

  it('includes products taken off the order', () => {
    expect(getTouchedProductIds(items, original).sort()).toEqual(['belt', 'filter', 'oil']);
  });
});

describe('isOrderEditLocked / isOrderPaymentFormLocked', () => {
  it('allows COD at packing and Cashdown at finance_pending, while locking Cashdown at packing and Ready to Ship/Delivered/Cancelled', () => {
    expect(isOrderEditLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'finance_pending' }))).toBe(false);
    expect(isOrderPaymentFormLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'finance_pending' }))).toBe(false);
    expect(isOrderEditLocked(order({ paymentType: 'paid', paymentMethod: 'cod', workflowStatus: 'packing' }))).toBe(false);
    expect(isOrderPaymentFormLocked(order({ paymentType: 'paid', paymentMethod: 'cod', workflowStatus: 'packing' }))).toBe(false);
    expect(isOrderEditLocked(order({ paymentType: 'paid', paymentMethod: 'cod', workflowStatus: 'finance_approved' }))).toBe(true);
    expect(isOrderEditLocked(order({ paymentType: 'paid', paymentMethod: 'cod', workflowStatus: 'delivered' }))).toBe(true);
    expect(isOrderEditLocked(order({ paymentType: 'paid', paymentMethod: 'cod', workflowStatus: 'packing', orderStatus: 'cancelled' }))).toBe(true);
    expect(isOrderEditLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'packing' }))).toBe(true);
    expect(isOrderEditLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'finance_approved' }))).toBe(true);
    expect(isOrderEditLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'delivered' }))).toBe(true);
    expect(isOrderEditLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'finance_pending', orderStatus: 'cancelled' }))).toBe(true);
  });

  it('blocks Cashdown mode switching while awaiting Finance or when any KPay record or partial/verified status exists', () => {
    expect(
      isCashdownKpayModeLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'finance_pending', hasKpayTransactions: false, paymentVerificationStatus: 'unverified' })),
    ).toBe(true);
    expect(
      isCashdownKpayModeLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'finance_adjustment', hasKpayTransactions: false, paymentVerificationStatus: 'unverified' })),
    ).toBe(true);
    expect(
      isCashdownKpayModeLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: undefined, hasKpayTransactions: false, paymentVerificationStatus: 'unverified' })),
    ).toBe(false);
    expect(
      isCashdownKpayModeLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'finance_pending', hasKpayTransactions: true, paymentVerificationStatus: 'unverified' })),
    ).toBe(true);
    expect(
      isCashdownKpayModeLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'finance_pending', paymentVerificationStatus: 'partial' })),
    ).toBe(true);
    expect(
      isCashdownKpayModeLocked(order({ paymentType: 'credit', paymentMethod: 'kpay', workflowStatus: 'packing', paymentVerificationStatus: 'verified' })),
    ).toBe(true);
  });
});
