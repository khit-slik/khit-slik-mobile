import { BluetoothEscposPrinter } from 'react-native-bluetooth-escpos-printer';
import RNFS from 'react-native-fs';

import { usePrinterStore } from '../../store/printerStore';
import { printerService } from '../printerService';
import type { ReceiptData } from '../receiptCaptureService';

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock-docs',
  exists: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('react-native-bluetooth-escpos-printer', () => ({
  BluetoothManager: {
    isBluetoothEnabled: jest.fn(),
    enableBluetooth: jest.fn(),
    connect: jest.fn(),
    scanDevices: jest.fn(),
  },
  BluetoothEscposPrinter: {
    printerInit: jest.fn(() => Promise.resolve()),
    printerAlign: jest.fn(() => Promise.resolve()),
    printText: jest.fn(() => Promise.resolve()),
    printColumn: jest.fn(() => Promise.resolve()),
    printAndFeed: jest.fn(() => Promise.resolve()),
    setWidth: jest.fn(),
    printPic: jest.fn(),
  },
}));

const sampleReceipt: ReceiptData = {
  invoiceNo: 'INV/2026/0042',
  date: '28/11/2026 07:58',
  items: [{ name: 'Silk Fabric', quantity: 2, price: 12000, subTotal: 24000 }],
  subtotal: 24000,
  discount: 2000,
  netTotal: 22000,
  paymentType: 'Cash',
  paidAmount: 25000,
  changeAmount: 3000,
  dueAmount: 0,
};

describe('printerService payment details toggle & header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePrinterStore.setState({
      paperWidth: 80,
      printMode: 'image',
      autoPrint: false,
      showPaymentDetails: true,
    });
  });

  it('defaults showPaymentDetails to true and persists saved changes', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ paperWidth: 58 }));

    await printerService.loadSavedConfig();
    expect(usePrinterStore.getState().showPaymentDetails).toBe(true);

    usePrinterStore.getState().setShowPaymentDetails(false);
    await printerService.savePreferences();

    expect(RNFS.writeFile).toHaveBeenCalledWith(
      '/mock-docs/printer_config.json',
      expect.stringContaining('"showPaymentDetails":false'),
      'utf8',
    );

    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({ paperWidth: 58, showPaymentDetails: false }),
    );
    await printerService.loadSavedConfig();
    expect(usePrinterStore.getState().showPaymentDetails).toBe(false);
  });

  it('prints ITEM/PRICE/QTY/AMOUNT header and hides payment rows & divider when OFF', async () => {
    await printerService.printTextReceipt({ ...sampleReceipt, showPaymentDetails: true }, 58);

    const onColumns = (BluetoothEscposPrinter.printColumn as jest.Mock).mock.calls.map(
      (call) => call[2],
    );
    expect(onColumns).toContainEqual(['ITEM', 'PRICE', 'QTY', 'AMOUNT']);
    expect(onColumns.some((row: string[]) => row[0] === 'Payment:')).toBe(true);
    expect(onColumns.some((row: string[]) => row[0] === 'Paid:')).toBe(true);
    expect(onColumns.some((row: string[]) => row[0] === 'Change:')).toBe(true);
    const onTextCalls = (BluetoothEscposPrinter.printText as jest.Mock).mock.calls.map(
      (call) => call[0],
    );
    const onSeparators = onTextCalls.filter((t: string) => t.startsWith('---')).length;

    jest.clearAllMocks();
    await printerService.printTextReceipt({ ...sampleReceipt, showPaymentDetails: false }, 58);

    const offColumns = (BluetoothEscposPrinter.printColumn as jest.Mock).mock.calls.map(
      (call) => call[2],
    );
    expect(offColumns).toContainEqual(['ITEM', 'PRICE', 'QTY', 'AMOUNT']);
    expect(offColumns.some((row: string[]) => row[0] === 'Payment:')).toBe(false);
    expect(offColumns.some((row: string[]) => row[0] === 'Paid:')).toBe(false);
    expect(offColumns.some((row: string[]) => row[0] === 'Change:')).toBe(false);
    expect(offColumns.some((row: string[]) => row[0] === 'Balance due:')).toBe(false);
    expect(offColumns.some((row: string[]) => row[0] === 'TOTAL:')).toBe(true);
    const offTextCalls = (BluetoothEscposPrinter.printText as jest.Mock).mock.calls.map(
      (call) => call[0],
    );
    const offSeparators = offTextCalls.filter((t: string) => t.startsWith('---')).length;
    expect(offSeparators).toBe(onSeparators - 1);
  });
});
