import React, { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';

import { goBackOr } from '../../features/pos/navigation';
import PreOrderCheckoutForm from '../../features/preOrder/components/PreOrderCheckoutForm';
import { buildPreOrderUpdatePayload, PreOrderForm } from '../../features/preOrder/lib';
import { updatePreOrder } from '../../services/preOrder/preOrderApi';
import { PreOrderStoreContext, usePreOrderEditStore } from '../../store/preOrderStore';

const close = () => goBackOr('/');

export default function PreOrderEditCheckoutScreen() {
  // Read once: saving clears the form, and with it the pre-order being edited, before this popup is replaced
  const [editing] = useState(() => usePreOrderEditStore.getState().editing);

  useEffect(() => {
    if (!editing) close();
  }, [editing]);

  const submit = useCallback(
    async (form: PreOrderForm) => {
      if (!editing) return 'Pre-order ရှာမတွေ့ပါ';
      const res = await updatePreOrder(editing.order._id, buildPreOrderUpdatePayload(form));
      if (!res.success) return res.message || 'Pre-order ပြင်ဆင်ရန် မအောင်မြင်ပါ';

      usePreOrderEditStore.getState().completeSave(res.data ?? editing.order);
      router.replace('/pre-order-edit/success');
      return null;
    },
    [editing],
  );

  if (!editing) return null;

  return (
    <PreOrderStoreContext.Provider value={usePreOrderEditStore}>
      <PreOrderCheckoutForm
        title={`Pre-order ပြင်မယ်${editing.order.orderNumber ? ` (${editing.order.orderNumber})` : ''}`}
        submitLabel="ပြင်ဆင်မှု သိမ်းမယ်"
        onSubmit={submit}
        onClose={close}
      />
    </PreOrderStoreContext.Provider>
  );
}
