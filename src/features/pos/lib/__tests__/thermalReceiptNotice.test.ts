import {
  isThermalContactPhoneIncluded,
  THERMAL_SHOP_CONTACT_LINES,
  THERMAL_SHOP_TAGLINE,
  THERMAL_SHOP_TITLE,
  THERMAL_TRANSFER_ACCOUNTS,
  THERMAL_TRANSFER_FALLBACK_TITLE,
  THERMAL_TRANSFER_FALLBACK_WARNING,
  THERMAL_TRANSFER_HOLDER,
  THERMAL_TRANSFER_KPAY_ENTRIES,
  THERMAL_TRANSFER_KPAY_LINES,
  THERMAL_TRANSFER_TITLE,
  THERMAL_TRANSFER_WARNING,
} from '../thermalReceiptNotice';

describe('thermalReceiptNotice', () => {
  it('preserves the exact shop header title, contact lines, account holder, and bank account digits', () => {
    expect(THERMAL_SHOP_TITLE).toBe('Khit Silk & Fabric - Myo Thinzar');
    expect(THERMAL_SHOP_TAGLINE).toBe('');
    expect(THERMAL_SHOP_CONTACT_LINES).toEqual([
      'Viber: 09-5069661, 09-5069811',
    ]);
    expect(THERMAL_TRANSFER_TITLE).toBe('ငွေလွှဲရန် အကောင့်များ');
    expect(THERMAL_TRANSFER_WARNING).toBe(
      '❌ အောက်ပါ ငွေလွှဲနံပါတ်မှလွဲ၍ မည်သည့်နံပါတ်ကိုမှမလွှဲပါရန် ❌',
    );
    expect(THERMAL_TRANSFER_KPAY_ENTRIES).toEqual([
      { label: 'Ph / KPay:', number: '09-772300766', holder: '(Myo Thinzar Oo)' },
      { label: 'KPay:', number: '100486300', holder: '(KHIT SILK&FABRIC)' },
    ]);
    expect(THERMAL_TRANSFER_KPAY_LINES).toEqual([
      'Ph / KPay: 09-772300766 (Myo Thinzar Oo)',
      'KPay: 100486300 (KHIT SILK&FABRIC)',
    ]);
    expect(THERMAL_TRANSFER_HOLDER).toBe('Daw Myo Thinzar Oo');
    expect(THERMAL_TRANSFER_ACCOUNTS).toEqual([
      { bank: 'KBZ Special', holder: 'Daw Myo Thinzar Oo', number: '24551106803139701' },
      { bank: 'AYA Mobile Banking', holder: 'Daw Myo Thinzar Oo', number: '20022752110' },
    ]);
    expect(THERMAL_TRANSFER_FALLBACK_TITLE).toBe('TRANSFER ACCOUNTS');
    expect(THERMAL_TRANSFER_FALLBACK_WARNING).toContain('Do NOT transfer');
  });

  it('detects duplicate shop contact phones regardless of formatting', () => {
    expect(isThermalContactPhoneIncluded('09-772300766')).toBe(true);
    expect(isThermalContactPhoneIncluded('09772300766')).toBe(true);
    expect(isThermalContactPhoneIncluded('+959772300766')).toBe(true);
    expect(isThermalContactPhoneIncluded('095069661')).toBe(true);
    expect(isThermalContactPhoneIncluded('09-999999999')).toBe(false);
    expect(isThermalContactPhoneIncluded('')).toBe(false);
  });
});
