import { Asset, requestPermissionsAsync } from 'expo-media-library';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

import { receiptCaptureService } from '../../services/receiptCaptureService';
import type { CompletedSale } from '../../store/cartStore';
import { getSaleReceipt } from './printSale';

export const saveSaleImage = async (sale: CompletedSale) => {
  // Android 11 and later can add to MediaStore without a storage permission.
  if (Platform.OS === 'ios' || (Platform.OS === 'android' && Platform.Version < 30)) {
    const { granted } = await requestPermissionsAsync(true, []);
    if (!granted) throw new Error('ဘောင်ချာပုံ သိမ်းရန် Photos / Gallery ခွင့်ပြုချက် လိုပါတယ်။');
  }

  const receipt = await getSaleReceipt(sale);
  const png = await receiptCaptureService.capture(receipt, 80);
  const invoiceNumber = receipt.invoiceNo.replace(/[\\/:*?"<>|]/g, '-');
  const path = `${RNFS.TemporaryDirectoryPath}/Receipt-${invoiceNumber}.png`;

  try {
    await RNFS.writeFile(path, png, 'base64');
    await Asset.create(`file://${path}`);
  } finally {
    // The Photos/Gallery copy is independent of the temporary file.
    await RNFS.unlink(path).catch(() => {});
  }
};
