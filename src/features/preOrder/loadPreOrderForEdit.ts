import { fetchProductsByIds } from '../../services/pos/posApi';
import { fetchPreOrderById } from '../../services/preOrder/preOrderApi';
import type { PreOrder } from '../../services/preOrder/types';
import { getPreOrderProductIds, PreOrderDraft, preOrderToDraft } from './lib';

export type LoadPreOrderResult = { ok: true; order: PreOrder; draft: PreOrderDraft } | { ok: false; message: string };

// The saved pre-order, with its products read again for current stock and wholesale tiers.
// Only a pre-order still waiting for stock can be edited (the backend refuses the rest).
export const loadPreOrderForEdit = async (preOrderId: string): Promise<LoadPreOrderResult> => {
  const res = await fetchPreOrderById(preOrderId);
  if (!res.success || !res.data) return { ok: false, message: res.message || 'Pre-order ရှာမတွေ့ပါ' };
  if (res.data.fulfilmentStatus && res.data.fulfilmentStatus !== 'awaiting_stock') {
    return { ok: false, message: 'ပစ္စည်းပေးပြီး/ပယ်ဖျက်ပြီး pre-order ကို ပြင်လို့မရပါ' };
  }

  const products = await fetchProductsByIds(getPreOrderProductIds(res.data));
  return { ok: true, order: res.data, draft: preOrderToDraft(res.data, products) };
};
