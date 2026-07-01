#!/usr/bin/env -S npx tsx
// Legacy CSV import CLI -- run this LOCALLY against Rodney's real files.
// Nothing here reads from or writes to this git repo's tracked files; it
// only touches whatever --data-dir you point it at and your Supabase
// project. Never commit real CSVs or a filled-in .env to this repo.
//
// Usage:
//   1. Create the Cadence Financial Supabase project and run
//      backend/migrations/0001_init.sql against it (see AGENTS.md).
//   2. Sign up once in the app so your auth user exists, then copy your
//      user UID from Supabase -> Authentication -> Users.
//   3. Set env vars (in your shell, not a committed file):
//        CADENCE_FINANCIAL_SUPABASE_URL
//        CADENCE_FINANCIAL_SUPABASE_SERVICE_KEY   (service_role key -- bypasses RLS for the import)
//        CADENCE_FINANCIAL_OWNER_ID               (your auth user UID)
//   4. Dry run first (default -- prints what would be imported, writes nothing):
//        npm run import-legacy-csv -- --data-dir /path/to/your/csvs
//   5. Apply for real once the dry run looks right:
//        npm run import-legacy-csv -- --data-dir /path/to/your/csvs --apply
//
// Supported source files (any subset may be present in --data-dir):
//   monthly_metrics.csv            (preferred -- new prototype format, 1:1 mapping)
//   monthly_tracking.csv + investment_buys.csv   (old Wealth Cockpit format)
//   evidence_register.csv
//   property_register.csv
//   loan_offset_register.csv
//   share_transactions.csv
//   listed_share_snapshot.csv
//   decision_log.csv

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  parseCsv,
  mapMonthlyMetricsCsv,
  mapMonthlyTrackingCsv,
  mapEvidenceRegisterCsv,
  mapPropertyRegisterCsv,
  mapLoanOffsetRegisterCsv,
  mapShareTransactionsCsv,
  mapListedShareSnapshotCsv,
  mapLiquidityBucketsCsv,
  mapDecisionLogCsv,
} from '../src/lib/legacyImport.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const apply = process.argv.includes('--apply');
const dataDir = arg('data-dir');

if (!dataDir) {
  console.error('Usage: import-legacy-csv --data-dir <path> [--apply]');
  process.exit(1);
}

function readCsv(name: string): ReturnType<typeof parseCsv> | null {
  const path = join(dataDir!, name);
  if (!existsSync(path)) return null;
  return parseCsv(readFileSync(path, 'utf-8'));
}

async function main() {
  const url = process.env.CADENCE_FINANCIAL_SUPABASE_URL;
  const serviceKey = process.env.CADENCE_FINANCIAL_SUPABASE_SERVICE_KEY;
  const ownerId = process.env.CADENCE_FINANCIAL_OWNER_ID;
  if (apply && (!url || !serviceKey || !ownerId)) {
    console.error(
      'Missing CADENCE_FINANCIAL_SUPABASE_URL / CADENCE_FINANCIAL_SUPABASE_SERVICE_KEY / CADENCE_FINANCIAL_OWNER_ID env vars.'
    );
    process.exit(1);
  }
  // Dry runs don't need real credentials -- use a placeholder owner id so
  // the mappers still run and print counts.
  const owner = ownerId || 'dry-run-owner';

  const results: Record<string, unknown[]> = {};

  const monthlyMetricsCsv = readCsv('monthly_metrics.csv');
  if (monthlyMetricsCsv) {
    results.monthly_metrics = mapMonthlyMetricsCsv(monthlyMetricsCsv, owner);
  } else {
    const tracking = readCsv('monthly_tracking.csv');
    const buys = readCsv('investment_buys.csv') ?? [];
    if (tracking) results.monthly_metrics = mapMonthlyTrackingCsv(tracking, buys, owner);
  }

  const evidence = readCsv('evidence_register.csv');
  if (evidence) results.evidence_items = mapEvidenceRegisterCsv(evidence, owner);

  const properties = readCsv('property_register.csv');
  let mappedProperties: ReturnType<typeof mapPropertyRegisterCsv> = [];
  if (properties) {
    mappedProperties = mapPropertyRegisterCsv(properties, owner);
    results.properties = mappedProperties;
  }

  const loans = readCsv('loan_offset_register.csv');
  if (loans) {
    // Real ids only exist once properties are actually inserted; for a dry
    // run we fabricate placeholder ids just to exercise the address match.
    const propertyRefs = mappedProperties.map((p, i) => ({ id: `pending-${i}`, address: p.address }));
    results.loans = mapLoanOffsetRegisterCsv(loans, propertyRefs, owner);
  }

  const shareTx = readCsv('share_transactions.csv');
  if (shareTx) results.investment_transactions = mapShareTransactionsCsv(shareTx, owner);

  const shareSnapshot = readCsv('listed_share_snapshot.csv');
  if (shareSnapshot) results.investment_holdings = mapListedShareSnapshotCsv(shareSnapshot, owner);

  const liquidityBuckets = readCsv('liquidity_buckets.csv');
  if (liquidityBuckets) results.liquidity_buckets = mapLiquidityBucketsCsv(liquidityBuckets, owner);

  const decisions = readCsv('decision_log.csv');
  if (decisions) results.decisions = mapDecisionLogCsv(decisions, owner);

  for (const [table, rows] of Object.entries(results)) {
    console.log(`${table}: ${rows.length} row(s)`);
  }

  if (!apply) {
    console.log('\nDry run only -- nothing written. Re-run with --apply once this looks right.');
    if (results.loans) {
      console.log(
        'Note: loans were matched to properties by address string during this dry run using ' +
          'placeholder ids. Re-run with --apply so properties are inserted first and loans link ' +
          'to their real ids.'
      );
    }
    return;
  }

  const supabase = createClient(url!, serviceKey!);

  // Properties first (loans need their real ids), then everything else.
  if (results.properties) {
    const { data: inserted, error } = await supabase.from('properties').insert(results.properties).select('id, address');
    if (error) throw error;
    const propertyRefs = (inserted ?? []).map((p: { id: string; address: string }) => p);
    if (loans) results.loans = mapLoanOffsetRegisterCsv(loans, propertyRefs, owner);
  }

  for (const [table, rows] of Object.entries(results)) {
    if (table === 'properties' || rows.length === 0) continue;
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw error;
    console.log(`Wrote ${rows.length} row(s) to ${table}`);
  }

  console.log('\nImport complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
