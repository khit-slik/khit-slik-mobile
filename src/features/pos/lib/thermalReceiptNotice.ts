// Contact and bank-transfer details printed on thermal receipts only.
// Kept in one place so no receipt component copies the strings.

/** Exact shop header title from the reference receipt photo and plan */
export const THERMAL_SHOP_TITLE = 'Khit Silk & Fabric - Myo Thinzar';

/**
 * Burmese tagline printed directly under the title.
 * Kept empty until the owner confirms the exact wording from the original photo.
 */
export const THERMAL_SHOP_TAGLINE = '';

/** Shop contact lines kept in the upper boxed header */
export const THERMAL_SHOP_CONTACT_LINES = [
  'Viber: 09-5069661, 09-5069811',
];

export const THERMAL_TRANSFER_TITLE = 'ငွေလွှဲရန် အကောင့်များ';

/** Printed above the account numbers, because it refers to the numbers below it */
export const THERMAL_TRANSFER_WARNING =
  '❌ အောက်ပါ ငွေလွှဲနံပါတ်မှလွဲ၍ မည်သည့်နံပါတ်ကိုမှမလွှဲပါရန် ❌';

/** KPay entries printed immediately below the Burmese warning and above the bank entries */
export const THERMAL_TRANSFER_KPAY_ENTRIES: {
  label: string;
  number: string;
  holder: string;
}[] = [
  { label: 'Ph / KPay:', number: '09-772300766', holder: '(Myo Thinzar Oo)' },
  { label: 'KPay:', number: '100486300', holder: '(KHIT SILK&FABRIC)' },
];

export const THERMAL_TRANSFER_KPAY_LINES = THERMAL_TRANSFER_KPAY_ENTRIES.map(
  (entry) => `${entry.label} ${entry.number} ${entry.holder}`,
);

export const THERMAL_TRANSFER_HOLDER = 'Daw Myo Thinzar Oo';

/** Only the banks approved by the owner. Each number is printed on its own line, exactly as supplied. */
export const THERMAL_TRANSFER_ACCOUNTS: {
  bank: string;
  holder: string;
  number: string;
}[] = [
  {
    bank: 'KBZ Special',
    holder: THERMAL_TRANSFER_HOLDER,
    number: '24551106803139701',
  },
  {
    bank: 'AYA Mobile Banking',
    holder: THERMAL_TRANSFER_HOLDER,
    number: '20022752110',
  },
];

// ESC/POS text mode can't draw Burmese, so the notice falls back to English wording there
export const THERMAL_TRANSFER_FALLBACK_TITLE = 'TRANSFER ACCOUNTS';
export const THERMAL_TRANSFER_FALLBACK_WARNING =
  'Do NOT transfer to any account other than the ones listed below.';

const normalizePhoneDigits = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('959') ? `0${digits.slice(2)}` : digits;
};

/** True when `phone` is already represented in the thermal contact lines (even with different formatting). */
export const isThermalContactPhoneIncluded = (
  phone: string,
  contactLines: string[] = [
    ...THERMAL_SHOP_CONTACT_LINES,
    ...THERMAL_TRANSFER_KPAY_LINES,
  ],
): boolean => {
  const normalizedPhone = normalizePhoneDigits(phone);
  if (!normalizedPhone) return false;
  return contactLines.some(
    (line) => normalizePhoneDigits(line).includes(normalizedPhone) || line.includes(phone.trim()),
  );
};
