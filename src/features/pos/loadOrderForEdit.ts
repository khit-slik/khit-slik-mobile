import { fetchOrderById, fetchProductsByIds } from '../../services/pos/posApi';
import { getOriginalQuantities, isOrderEditLocked, OrderEditDraft, orderToDraft } from './lib';

export type LoadOrderResult = { ok: true; draft: OrderEditDraft; missingLines: number } | { ok: false; message: string };

// The saved order, with its products read again for current stock, prices and wholesale tiers
export const loadOrderForEdit = async (orderId: string): Promise<LoadOrderResult> => {
  const res = await fetchOrderById(orderId);
  if (!res.success || !res.data) return { ok: false, message: res.message || 'ဘောင်ချာ ရှာမတွေ့ပါ' };
  if (res.data.isDeleted) return { ok: false, message: 'ဖျက်ထားသော ဘောင်ချာကို ပြင်ဆင်၍ မရပါ' };
  if (isOrderEditLocked(res.data)) {
    return { ok: false, message: 'Finance အတည်ပြုပြီး သို့မဟုတ် ထုပ်ပိုးပြီးသား order ကို ပြင်လို့မရပါ' };
  }

  const products = await fetchProductsByIds(Object.keys(getOriginalQuantities(res.data)));
  return { ok: true, ...orderToDraft(res.data, products) };
};
