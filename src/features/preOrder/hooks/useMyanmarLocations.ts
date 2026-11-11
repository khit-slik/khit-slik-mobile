import { useEffect, useState } from 'react';

import { fetchMyanmarLocations } from '../../../services/preOrder/preOrderApi';
import type { MyanmarLocations } from '../../../services/preOrder/types';

const EMPTY: MyanmarLocations = { regions: [], yangonTownships: [] };

// The list never changes while the app runs: one request, shared by every picker
let cached: MyanmarLocations | null = null;
let pending: Promise<MyanmarLocations | null> | null = null;

const load = () => {
  if (!pending) {
    pending = fetchMyanmarLocations().then((res) => {
      if (res.success && res.data.regions.length > 0) {
        cached = res.data;
        return res.data;
      }
      // A failed load is tried again the next time a picker opens
      pending = null;
      return null;
    });
  }
  return pending;
};

// Regions/states and Yangon townships, with their Burmese names
export const useMyanmarLocations = () => {
  const [locations, setLocations] = useState<MyanmarLocations>(cached || EMPTY);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    load().then((result) => {
      if (!cancelled && result) setLocations(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const regionLabel = (code: string) => locations.regions.find((region) => region.code === code)?.my || code;
  const townshipLabel = (code: string) =>
    locations.yangonTownships.find((township) => township.code === code)?.my || code;

  return { ...locations, regionLabel, townshipLabel };
};
