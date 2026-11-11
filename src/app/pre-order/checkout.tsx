import React from 'react';
import { router } from 'expo-router';

import { goBackOr } from '../../features/pos/navigation';
import PreOrderCheckoutForm from '../../features/preOrder/components/PreOrderCheckoutForm';
import { buildPreOrderCreatePayload, PreOrderForm } from '../../features/preOrder/lib';
import { createPreOrder } from '../../services/preOrder/preOrderApi';
import { usePreOrderStore } from '../../store/preOrderStore';

const close = () => goBackOr('/pre-order');

const submit = async (form: PreOrderForm) => {
  const res = await createPreOrder(buildPreOrderCreatePayload(form));
  if (!res.success || !res.data) return res.message || 'Pre-order သိမ်း၍မရပါ';

  usePreOrderStore.getState().completeSave(res.data);
  router.replace('/pre-order/success');
  return null;
};

export default function PreOrderCheckoutScreen() {
  return (
    <PreOrderCheckoutForm
      title="Pre-order ဘောင်ချာ ဖွင့်မယ်"
      submitLabel="Pre-order သိမ်းမယ်"
      onSubmit={submit}
      onClose={close}
    />
  );
}
