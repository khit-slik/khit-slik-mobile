// Shapes of the backend's pre-order API (/api/v1/pre-orders), mirrored from khit-slik-frontend
// services/PreOrder/types.ts

import type { ApiPaymentMethod, PersonRef, PopulatedInventory, PosOrder } from '../pos/types';

export type FulfilmentStatus = 'awaiting_stock' | 'fulfilled' | 'cancelled';

// GET /pre-orders/:id adds the product's current stock to each line
export interface PreOrderLine {
  inventoryId: PopulatedInventory | string | null;
  quantity: number;
  unitPrice?: number;
  stock?: number | null;
}

export interface PreOrder extends PosOrder {
  isPreOrder?: boolean;
  fulfilmentStatus?: FulfilmentStatus;
  ordersProducts: PreOrderLine[];
  subTotal?: number;
  discount?: number;
  finalAmount?: number;
  paidAmount?: number;
  paymentType?: 'paid' | 'credit';
  paymentMethod?: string;
  note?: string;
  createdAt?: string;
  expectedDate?: string | null;
  creditPersonId?: PersonRef | string | null;
  customerId?: PersonRef | string | null;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryRegion?: string | null;
  deliveryTownship?: string | null;
  deliveryFee?: number;
}

export interface PreOrderLinePayload {
  inventoryId: string;
  quantity: number;
  // Left out: the backend prices the line (selling price, or the wholesale tier for the quantity)
  unitPrice?: number;
}

interface PreOrderPayloadBase {
  ordersProducts: PreOrderLinePayload[];
  discount: number;
  paymentMethod: ApiPaymentMethod;
  expectedDate: string | null;
  note: string;
  deliveryRegion: string | null;
  deliveryTownship: string | null;
  // Included in the total and the balance
  deliveryFee: number;
}

// A customer is required: a saved credit customer, or (older pre-orders) a typed name + phone
export type PreOrderCustomerPayload =
  | { creditPersonId: string }
  | { customerName: string; customerPhone: string; customerAddress?: string };

// PATCH /pre-orders/:id; the backend ignores paidAmount there (later payments go through the web)
export type PreOrderUpdatePayload = PreOrderPayloadBase & PreOrderCustomerPayload;

// POST /pre-orders: the update body plus the deposit taken now
export type PreOrderCreatePayload = PreOrderUpdatePayload & { paidAmount: number };

// A delivery region/state or Yangon township; customers and orders store the code
export interface MyanmarLocation {
  code: string;
  my: string;
  en: string;
}

export interface MyanmarLocations {
  regions: MyanmarLocation[];
  yangonTownships: MyanmarLocation[];
}
