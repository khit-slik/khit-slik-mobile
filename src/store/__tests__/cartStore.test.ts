import type { PosOrderDetail, PosProduct } from '../../services/pos/types';
import { orderToDraft, PAYMENT_METHODS } from '../../features/pos/lib';
import { useCartStore } from '../cartStore';

const oil: PosProduct = { _id: 'oil', productName: 'Oil', sellingPrice: 1000, availableQuantity: 5 };
const filter: PosProduct = { _id: 'filter', productName: 'Filter', sellingPrice: 333, availableQuantity: 0 };

const store = () => useCartStore.getState();

// subtotal 3000
const fillCart = () => {
  store().addProduct(oil);
  store().addProduct(oil);
  store().addProduct(oil);
};

beforeEach(() => {
  store().reset();
});

describe('cart actions', () => {
  it('returns the problem to show', () => {
    expect(store().addProduct(oil)).toBeUndefined();
    expect(store().addProduct(filter)).toBe('OUT_OF_STOCK');
    expect(store().setQty('oil', 9)).toBe('EXCEEDS_STOCK');
    expect(store().items[0].qty).toBe(5);
    expect(store().changeQty('oil', 1)).toBe('EXCEEDS_STOCK');
  });

  it('removing the last item closes checkout', () => {
    fillCart();
    store().openCheckout();
    store().removeItem('oil');
    expect(store().items).toEqual([]);
    expect(store().isCheckoutOpen).toBe(false);
  });

  it('clearing the cart keeps the payment options', () => {
    fillCart();
    store().selectPaymentOption('credit');
    store().setCustomer({ _id: 'cp1' });
    store().clearItems();
    expect(store().items).toEqual([]);
    expect(store()).toMatchObject({ paymentType: 'credit', creditPersonId: 'cp1', isCheckoutOpen: false });
  });

  it('cannot open checkout with an empty cart', () => {
    store().openCheckout();
    expect(store().isCheckoutOpen).toBe(false);
  });
});

describe('checkout delivery', () => {
  it('fills the saved location for the selected customer without changing the fee', () => {
    store().setDeliveryFee(500);
    store().setCustomer({ _id: 'cp1', region: 'yangon', township: 'hlaing' });
    expect(store()).toMatchObject({
      creditPersonId: 'cp1',
      deliveryRegion: 'yangon',
      deliveryTownship: 'hlaing',
      deliveryFee: 500,
    });

    store().setCustomer({ _id: 'cp2' });
    expect(store()).toMatchObject({ deliveryRegion: '', deliveryTownship: '', deliveryFee: 500 });
  });

  it('defaults a new Yangon customer to COD (Option B), non-Yangon to Cashdown, and keeps empty-region unselected', () => {
    fillCart();
    store().openCheckout();
    const customer = { _id: 'yangon-customer', region: 'yangon', township: 'ygn-hlaing' };
    store().setCustomer(customer);
    store().setDeliveryFee(500);
    expect(store()).toMatchObject({
      paymentMode: 'cod',
      paymentMethod: PAYMENT_METHODS.COD,
      paymentType: 'paid',
      paidAmount: 3500,
      deliveryTownship: 'ygn-hlaing',
    });

    store().selectPaymentMode('cashdown');
    expect(store()).toMatchObject({ paymentMode: 'cashdown', paymentMethod: PAYMENT_METHODS.KBZ_PAY, paymentType: 'credit', paidAmount: 3500 });

    store().setCustomer({ _id: 'mandalay-customer', region: 'mandalay' });
    expect(store()).toMatchObject({ paymentMode: 'cashdown', paymentMethod: PAYMENT_METHODS.KBZ_PAY, paymentType: 'credit', paidAmount: 3500 });

    // Empty-region customer does not assume Yangon or Mandalay
    store().setCustomer({ _id: 'empty-customer', region: '' });
    expect(store().paymentMode).toBeNull();

    // Selecting COD on empty region then switching region to Mandalay does not auto-switch mode
    store().selectPaymentMode('cod');
    expect(store().paymentMode).toBe('cod');
    store().setDeliveryRegion('mandalay');
    expect(store().paymentMode).toBe('cod');
    // User manually switches to Cashdown
    store().selectPaymentMode('cashdown');
    expect(store().paymentMode).toBe('cashdown');
  });

  it('supports Cashdown and FOC selection cleanly', () => {
    store().reset();
    fillCart();
    store().selectPaymentMode('cashdown');
    expect(store()).toMatchObject({ paymentMode: 'cashdown', paymentMethod: PAYMENT_METHODS.KBZ_PAY, paymentType: 'credit' });
    store().selectPaymentMode('foc');
    expect(store()).toMatchObject({ paymentMode: 'foc', paymentMethod: PAYMENT_METHODS.FOC, paymentType: 'foc', paidAmount: 0 });
  });

  it('keeps a manual region when the same customer is reselected', () => {
    const customer = { _id: 'cp1', region: 'yangon', township: 'hlaing' };
    store().setCustomer(customer);
    store().setDeliveryRegion('mandalay');
    store().setCustomer(customer);
    expect(store()).toMatchObject({ deliveryRegion: 'mandalay', deliveryTownship: '' });
  });

  it('updates the paid total and resets delivery after a new sale', () => {
    fillCart();
    store().setCustomer({ _id: 'cp1', region: 'yangon', township: 'ygn-hlaing' });
    store().openCheckout();
    store().setDeliveryRegion('mandalay');
    store().selectPaymentMode('cashdown');
    store().setDeliveryFee(500);
    expect(store().paidAmount).toBe(3500);

    const sale = store().completeSale({ _id: 'o1', orderNumber: 'INV/0001' }, null);
    expect(sale.totals).toMatchObject({ subtotal: 3000, deliveryFee: 500, total: 3500 });
    expect(store()).toMatchObject({ deliveryRegion: '', deliveryTownship: '', deliveryFee: 0 });
  });
});

describe('price mode', () => {
  it('switching mode clears the other mode’s value', () => {
    fillCart();
    store().setPriceMode('discount');
    store().setDiscountPercent(10);
    store().setPriceMode('markup');
    expect(store().discountPercent).toBe(0);
    store().setMarkupAmount(500);
    store().setPriceMode('normal');
    expect(store().markupAmount).toBe(0);
  });
});

describe('paid amount', () => {
  it('opening checkout prefills the total for COD and Cashdown', () => {
    fillCart();
    store().selectPaymentMode('cod');
    store().openCheckout();
    expect(store().paidAmount).toBe(3000);
  });

  it('follows the total while checkout is open for COD and Cashdown', () => {
    fillCart();
    store().selectPaymentMode('cod');
    store().openCheckout();
    store().setPriceMode('discount');
    store().setDiscountPercent(10);
    expect(store().paidAmount).toBe(2700);
  });

  it('keeps Cashdown paidAmount >= total when opening checkout', () => {
    fillCart();
    store().selectPaymentMode('cashdown');
    store().openCheckout();
    expect(store().paidAmount).toBe(3000);
    store().setPaidAmount(3500);
    expect(store().paidAmount).toBe(3500);
  });

  it('rounds up and never goes negative', () => {
    store().selectPaymentMode('cashdown');
    store().setPaidAmount(1200.2);
    expect(store().paidAmount).toBe(1201);
    store().setPaidAmount(-5);
    expect(store().paidAmount).toBe(0);
  });
});

describe('payment options', () => {
  it('Cashdown starts full total and uses KBZPay', () => {
    fillCart();
    store().openCheckout();
    store().selectPaymentMode('cashdown');
    expect(store().paymentType).toBe('credit');
    expect(store().paymentMethod).toBe(PAYMENT_METHODS.KBZ_PAY);
    expect(store().paidAmount).toBe(3000);
  });

  it('FOC clears pricing and locks method and price mode', () => {
    fillCart();
    store().openCheckout();
    store().setPriceMode('discount');
    store().setDiscountPercent(10);
    store().selectPaymentOption('foc');
    expect(store()).toMatchObject({
      paymentMode: 'foc',
      paymentType: 'foc',
      paymentMethod: PAYMENT_METHODS.FOC,
      paidAmount: 0,
      priceMode: 'normal',
      discountPercent: 0,
    });

    store().setPaymentMethod(PAYMENT_METHODS.CASH);
    store().setPriceMode('markup');
    expect(store().paymentMethod).toBe(PAYMENT_METHODS.FOC);
    expect(store().priceMode).toBe('normal');
  });

  it('back to COD from FOC uses COD and the full total (Option B)', () => {
    fillCart();
    store().selectPaymentOption('foc');
    store().selectPaymentMode('cod');
    expect(store().paymentMethod).toBe(PAYMENT_METHODS.COD);
    expect(store().paidAmount).toBe(3000);
  });
});

describe('payment mode when editing an order', () => {
  const savedOrder: PosOrderDetail = {
    _id: 'order1',
    orderNumber: 'INV/0001',
    ordersProducts: [{ inventoryId: oil._id, quantity: 3, unitPrice: 1000 }],
    subTotal: 3000,
    finalAmount: 3500,
    deliveryFee: 500,
    paymentMethod: 'kpay',
    paymentType: 'credit',
    paidAmount: 3500,
  };

  it('allows COD in packing to switch or edit delivery fee while locking Cashdown in packing and KPay-linked Cashdown', () => {
    store().startEdit(orderToDraft({ ...savedOrder, workflowStatus: 'finance_pending' }, new Map([[oil._id, oil]])).draft);
    store().openCheckout();
    store().selectPaymentMode('cod');
    expect(store()).toMatchObject({ paymentMode: 'cod', paymentMethod: PAYMENT_METHODS.COD, paymentType: 'paid', paidAmount: 3500, deliveryFee: 500 });

    store().selectPaymentMode('cashdown');
    expect(store()).toMatchObject({ paymentMode: 'cashdown', paymentMethod: PAYMENT_METHODS.KBZ_PAY, paymentType: 'credit', paidAmount: 3500 });

    // COD at packing can still change mode and delivery fee
    const codAtPacking = { ...savedOrder, paymentMethod: 'cod', paymentType: 'paid' as const, workflowStatus: 'packing' };
    store().startEdit(orderToDraft(codAtPacking, new Map([[oil._id, oil]])).draft);
    store().openCheckout();
    store().selectPaymentMode('cashdown');
    expect(store()).toMatchObject({ paymentMode: 'cashdown', paymentMethod: PAYMENT_METHODS.KBZ_PAY, paymentType: 'credit', paidAmount: 3500 });

    // Cashdown at packing stays locked
    store().startEdit(orderToDraft({ ...savedOrder, workflowStatus: 'packing' }, new Map([[oil._id, oil]])).draft);
    store().openCheckout();
    store().selectPaymentMode('cod');
    expect(store()).toMatchObject({ paymentMode: 'cashdown', paymentMethod: PAYMENT_METHODS.KBZ_PAY, paymentType: 'credit' });

    // Even at finance_pending, existing KPay transactions lock Cashdown mode switching
    store().startEdit(orderToDraft({ ...savedOrder, workflowStatus: 'finance_pending', hasKpayTransactions: true }, new Map([[oil._id, oil]])).draft);
    store().openCheckout();
    store().selectPaymentMode('cod');
    expect(store()).toMatchObject({ paymentMode: 'cashdown', paymentMethod: PAYMENT_METHODS.KBZ_PAY, paymentType: 'credit' });
  });

  it('updates COD paidAmount to Option B total when delivery fee is edited', () => {
    const order = { ...savedOrder, paymentMethod: 'cod', paymentType: 'paid' as const, paidAmount: 3500 };
    store().startEdit(orderToDraft(order, new Map([[oil._id, oil]])).draft);
    store().openCheckout();
    store().setDeliveryFee(800);

    expect(store()).toMatchObject({ paymentMode: 'cod', paymentMethod: PAYMENT_METHODS.COD, paymentType: 'paid', paidAmount: 3800 });
    expect(store().completeSale(order, null).paidAmount).toBe(3800);
  });
});

describe('completeSale', () => {
  it('keeps a record of the sale and starts a fresh cart', () => {
    fillCart();
    store().selectPaymentMode('cashdown');
    store().openCheckout();
    store().setPaidAmount(5000);
    const order = { _id: 'o1', orderNumber: 'INV/0001' };
    const before = store().saleCount;

    const sale = store().completeSale(order, null);

    expect(sale).toMatchObject({
      order,
      paymentType: 'credit',
      paymentMethod: PAYMENT_METHODS.KBZ_PAY,
      paidAmount: 5000,
      customer: null,
    });
    expect(sale.items).toHaveLength(1);
    expect(sale.totals.total).toBe(3000);
    expect(store().lastSale).toBe(sale);
    expect(store().saleCount).toBe(before + 1);
    expect(store().items).toEqual([]);
    expect(store().isCheckoutOpen).toBe(false);
  });

  it('records FOC sales as unpaid', () => {
    fillCart();
    store().selectPaymentOption('foc');
    expect(store().completeSale({ _id: 'o2', orderNumber: 'INV/0002' }, null).paidAmount).toBe(0);
  });

  it('reset keeps the last sale', () => {
    fillCart();
    store().completeSale({ _id: 'o3', orderNumber: 'INV/0003' }, null);
    store().reset();
    expect(store().lastSale?.order.orderNumber).toBe('INV/0003');
  });
});

describe('reset', () => {
  it('clears everything', () => {
    fillCart();
    store().setNote('note');
    store().setCustomer({ _id: 'cp1' });
    store().selectPaymentMode('cashdown');
    store().reset();
    expect(store()).toMatchObject({
      items: [],
      note: '',
      creditPersonId: '',
      paymentMode: null,
      paymentType: 'paid',
      paymentMethod: PAYMENT_METHODS.COD,
      paidAmount: 0,
      priceMode: 'normal',
    });
  });
});
