import { printerService } from '../../services/printerService';
import { useAuthStore } from '../../store/authStore';
import type { CompletedSale } from '../../store/cartStore';
import { useShopStore } from '../../store/shopStore';
import { resolveBranding, toReceiptData } from './lib';

export const getSaleReceipt = async (sale: CompletedSale) => {
  const shop = useShopStore.getState();
  if (!shop.settings) await shop.loadSettings();

  const { settings, receiptSlot } = useShopStore.getState();
  return toReceiptData(sale, {
    branding: resolveBranding(settings, receiptSlot),
    cashierName: useAuthStore.getState().userName ?? undefined,
  });
};

export const printSale = async (sale: CompletedSale) => {
  await printerService.printReceipt(await getSaleReceipt(sale));
};
