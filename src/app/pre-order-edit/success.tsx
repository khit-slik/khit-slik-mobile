import React, { useEffect } from 'react';
import { router } from 'expo-router';

import PreOrderDoneCard from '../../features/preOrder/components/PreOrderDoneCard';
import { webBridge } from '../../services/webBridge';
import { usePreOrderEditStore } from '../../store/preOrderStore';

// Close the native screens and reload the web page underneath so it shows the edited pre-order
const finish = (path?: string) => {
  webBridge.reload(path);
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
};

export default function PreOrderEditSuccessScreen() {
  const saved = usePreOrderEditStore((state) => state.lastSaved);

  useEffect(() => {
    if (!saved) finish();
  }, [saved]);

  if (!saved) return null;

  return (
    <PreOrderDoneCard
      key={saved.savedAt}
      saved={saved}
      title="ပြင်ဆင်မှု အောင်မြင်ပါတယ်"
      subtitle="Pre-order ပြင်ဆင်မှုများကို အောင်မြင်စွာ သိမ်းထားပြီးပါပြီ"
      onExit={() => finish()}
      onViewList={() => finish('/pre-orders')}
    />
  );
}
