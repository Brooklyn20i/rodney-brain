import type { Watch, WatchCollectionRole, WatchOwnershipStatus } from './types';

export type WatchRoleFilter = WatchCollectionRole | 'all';
export type WatchStatusFilter = WatchOwnershipStatus | 'all';

export interface WatchFilter {
  search?: string;
  collectionRole?: WatchRoleFilter;
  status?: WatchStatusFilter;
}

export interface WatchSummary {
  ownedCollectionValue: number;
  knownAcquisitionBasis: number;
  unrealisedPL: number;
  ownedCount: number;
  roleCounts: Record<WatchCollectionRole, number>;
  dataGaps: {
    unsupportedCurrency: number;
    purchasePrice: number;
    currentValue: number;
    valuationSource: number;
    valueAsOf: number;
    insuranceValue: number;
    fullSet: number;
    accessories: number;
    serviceHistory: number;
    storageSecurity: number;
  };
}

const COLLECTION_ROLES: WatchCollectionRole[] = ['permanent', 'rotation', 'exit_trade', 'future'];

export function parseOptionalMoneyInput(input: string): { value: number | null; valid: boolean } {
  const trimmed = input.trim();
  if (!trimmed) return { value: null, valid: true };
  const normalized = trimmed
    .replace(/^(?:[A-Za-z]{3}|A\$|\$)\s*/, '')
    .replace(/,/g, '')
    .trim();
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
    return { value: null, valid: false };
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? { value, valid: true } : { value: null, valid: false };
}

function isKnownMoney(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

export function activeWatches(watches: Watch[]): Watch[] {
  return watches.filter((watch) => !watch.deleted_at);
}

export function ownedWatches(watches: Watch[]): Watch[] {
  return activeWatches(watches).filter(
    (watch) => watch.ownership_status === 'owned' && watch.collection_role !== 'future'
  );
}

export function summarizeWatches(watches: Watch[]): WatchSummary {
  const active = activeWatches(watches);
  const owned = ownedWatches(watches);
  const audOwned = owned.filter((watch) => watch.currency === 'AUD');
  const plRows = audOwned.filter((watch) => isKnownMoney(watch.purchase_price) && isKnownMoney(watch.current_value));

  return {
    ownedCollectionValue: audOwned.reduce((sum, watch) => sum + (isKnownMoney(watch.current_value) ? watch.current_value : 0), 0),
    knownAcquisitionBasis: audOwned.reduce((sum, watch) => sum + (isKnownMoney(watch.purchase_price) ? watch.purchase_price : 0), 0),
    unrealisedPL: plRows.reduce((sum, watch) => sum + (watch.current_value! - watch.purchase_price!), 0),
    ownedCount: owned.length,
    roleCounts: COLLECTION_ROLES.reduce(
      (acc, role) => ({ ...acc, [role]: active.filter((watch) => watch.collection_role === role).length }),
      { permanent: 0, rotation: 0, exit_trade: 0, future: 0 } as Record<WatchCollectionRole, number>
    ),
    dataGaps: {
      unsupportedCurrency: owned.filter((watch) => watch.currency !== 'AUD').length,
      purchasePrice: owned.filter((watch) => !isKnownMoney(watch.purchase_price)).length,
      currentValue: owned.filter((watch) => !isKnownMoney(watch.current_value)).length,
      valuationSource: owned.filter((watch) => !hasText(watch.valuation_source)).length,
      valueAsOf: owned.filter((watch) => !watch.value_as_of).length,
      insuranceValue: owned.filter((watch) => !isKnownMoney(watch.insurance_value)).length,
      fullSet: owned.filter((watch) => watch.full_set_status === 'unknown').length,
      accessories: owned.filter((watch) => !hasText(watch.accessories)).length,
      serviceHistory: owned.filter((watch) => !hasText(watch.service_history)).length,
      storageSecurity: owned.filter((watch) => !hasText(watch.storage_location) || !hasText(watch.security_notes)).length,
    },
  };
}

export function watchPL(watch: Watch): { amount: number; percent: number | null } | null {
  if (!isKnownMoney(watch.purchase_price) || !isKnownMoney(watch.current_value)) return null;
  const amount = watch.current_value - watch.purchase_price;
  return { amount, percent: watch.purchase_price > 0 ? amount / watch.purchase_price : null };
}

export function filterWatches(watches: Watch[], filter: WatchFilter): Watch[] {
  const collectionRole = filter.collectionRole ?? 'all';
  const status = filter.status ?? 'all';
  const terms = (filter.search ?? '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return activeWatches(watches).filter((watch) => {
    if (collectionRole !== 'all' && watch.collection_role !== collectionRole) return false;
    if (status !== 'all' && watch.ownership_status !== status) return false;
    if (terms.length === 0) return true;
    const haystack = [
      watch.brand,
      watch.model,
      watch.reference,
      watch.nickname,
      watch.provenance,
      watch.accessories,
      watch.valuation_source,
    ].join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
