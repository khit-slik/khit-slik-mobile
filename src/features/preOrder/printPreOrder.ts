import type { SavedPreOrder } from '../../store/preOrderStore';
import { toApiPaymentMethod, WebVoucher } from '../pos/lib';
import { printWebVoucher } from '../pos/printWebVoucher';

// The voucher of a saved pre-order, printed on the Bluetooth printer like the web's pre-order Print
// (utils/preOrderVoucher.ts there). The deposit prints as the amount paid and the rest as the balance;
// the note line marks it as a pre-order. Throws when it can't print.
export const printPreOrder = async (saved: SavedPreOrder) => {
  const { order, items, totals, customer } = saved;
  const expected = order.expectedDate ? String(order.expectedDate).slice(0, 10) : '';
  const note = [`PRE-ORDER${expected ? ` · ပစ္စည်းရမယ့်ရက် ${expected}` : ''}`, (order.note || '').trim()]
    .filter(Boolean)
    .join('\n');

  const voucher: WebVoucher = {
    invoiceNumber: order.orderNumber || order._id,
    date: order.createdAt || saved.savedAt,
    items: items.map((item) => ({
      name: item.product.productName,
      code: item.product.productCode,
      qty: item.qty,
      price: item.unitPrice,
    })),
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    // The delivery fee is part of the total; it prints like a service charge
    serviceCharge: totals.deliveryFee,
    total: totals.total,
    paidAmount: totals.paid,
    change: 0,
    note,
    customerName: customer?.name,
    customerPhone: customer?.phone,
    customerAddress: customer?.address,
  };

  await printWebVoucher(voucher, {
    paymentType: totals.balance > 0 ? 'credit' : 'paid',
    paymentMethod: toApiPaymentMethod(saved.paymentMethod),
  });
};
