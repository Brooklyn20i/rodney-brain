import { describe, expect, it } from 'vitest';
import {
  mapDecisionLogCsv,
  mapEvidenceRegisterCsv,
  mapLoanOffsetRegisterCsv,
  mapMonthlyMetricsCsv,
  mapMonthlyTrackingCsv,
  mapPropertyRegisterCsv,
  mapShareTransactionsCsv,
  normalizeEvidenceGrade,
  parseCsv,
} from '../legacyImport';

describe('parseCsv', () => {
  it('handles quoted fields with embedded commas and escaped quotes', () => {
    const text = 'a,b,c\n1,"hello, world","she said ""hi"""\n2,plain,text';
    const rows = parseCsv(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ a: '1', b: 'hello, world', c: 'she said "hi"' });
    expect(rows[1]).toEqual({ a: '2', b: 'plain', c: 'text' });
  });

  it('returns an empty array for a header-only or empty file', () => {
    expect(parseCsv('a,b,c\n')).toEqual([]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('mapMonthlyMetricsCsv', () => {
  it('maps the new prototype monthly_metrics.csv format 1:1', () => {
    const rows = parseCsv(
      'period,cash_saved,share_buys,btc_buys,debt_reduction,net_worth,cash_offsets,total_debt,net_debt,shares,btc_crypto,super,total_assets,property_value,property_equity\n' +
        '2020-01,100.00,0.00,50.00,20.00,900000.00,50000.00,300000.00,250000.00,10000.00,5000.00,80000.00,1200000.00,900000.00,600000.00'
    );
    const [m] = mapMonthlyMetricsCsv(rows, 'owner-1');
    expect(m.period).toBe('2020-01');
    expect(m.cash_saved).toBe(100);
    expect(m.btc_buys).toBe(50);
    expect(m.super_balance).toBe(80000);
    expect(m.owner_id).toBe('owner-1');
  });
});

describe('mapMonthlyTrackingCsv', () => {
  it('joins the old dashboard tracking sheet with the investment-buys sheet by period', () => {
    const tracking = parseCsv(
      'Date,Cash / offsets,Property value,Property equity,Crypto,Shares,Super,Total assets,Total debt,Net debt,Net worth,Cash Δ,Debt reduction\n' +
        '2020-02-01,51000,900000,600000,5200,10500,80000,1201000,299000,248000,902000,1000,1000'
    );
    const buys = parseCsv('period,share_buys,btc_buys,notes\n2020-02,200,0,fictional');
    const [m] = mapMonthlyTrackingCsv(tracking, buys, 'owner-1');
    expect(m.period).toBe('2020-02');
    expect(m.cash_saved).toBe(1000);
    expect(m.share_buys).toBe(200);
    expect(m.btc_buys).toBe(0);
    expect(m.debt_reduction).toBe(1000);
  });
});

describe('normalizeEvidenceGrade', () => {
  it('maps known aliases and falls back to assumption', () => {
    expect(normalizeEvidenceGrade('screenshot-grade')).toBe('screenshot');
    expect(normalizeEvidenceGrade('stale/carry-forward')).toBe('stale_carry_forward');
    expect(normalizeEvidenceGrade('user-stated scenario')).toBe('user_stated_scenario');
    expect(normalizeEvidenceGrade('something unrecognised')).toBe('assumption');
  });
});

describe('mapEvidenceRegisterCsv', () => {
  it('maps item/period/grade/status/source/notes', () => {
    const rows = parseCsv(
      'item,period,evidence_grade,status,source,notes\n' +
        'Cash and offsets,2020-02,screenshot-grade,received,Fictional screenshot,Test note'
    );
    const [e] = mapEvidenceRegisterCsv(rows, 'owner-1');
    expect(e.item).toBe('Cash and offsets');
    expect(e.grade).toBe('screenshot');
    expect(e.status).toBe('received');
  });
});

describe('mapPropertyRegisterCsv + mapLoanOffsetRegisterCsv', () => {
  it('links a loan to its property by address match', () => {
    const propRows = parseCsv(
      'Property,Value,Annual rent,Role / thesis,Valuation basis,Evidence status\n' +
        '1 Fictional St,500000,20000,Yield property,Portal estimate,Received'
    );
    const properties = mapPropertyRegisterCsv(propRows, 'owner-1').map((p, i) => ({ id: `p${i}`, address: p.address }));

    const loanRows = parseCsv(
      'Property,Loan balance,Offset balance,Rate,Monthly repayment,Fixed/variable,Review/maturity date,Notes / evidence status\n' +
        '1 Fictional St,200000,50000,0.06,1200,Variable,TBC,Fictional note'
    );
    const [loan] = mapLoanOffsetRegisterCsv(loanRows, properties, 'owner-1');
    expect(loan.property_id).toBe('p0');
    expect(loan.balance).toBe(200000);
    expect(loan.rate_type).toBe('variable');
    expect(loan.review_date).toBeNull();
  });
});

describe('mapShareTransactionsCsv', () => {
  it('maps buy/sell transactions', () => {
    const rows = parseCsv(
      'Date,Ticker,Side,Currency,Shares,Price,Amount / proceeds,Source / caveat\n' +
        '2020-01-10,FAKE,buy,AUD,10,25.50,255.00,Fictional screenshot'
    );
    const [t] = mapShareTransactionsCsv(rows, 'owner-1');
    expect(t.ticker).toBe('FAKE');
    expect(t.side).toBe('buy');
    expect(t.amount).toBe(255);
  });
});

describe('mapDecisionLogCsv', () => {
  it('normalizes free-text approval status and infers an owner lens', () => {
    const rows = parseCsv(
      'Decision area,Question / decision needed,Recommended position,Approval status,Approved by,Decision date,Follow-up action\n' +
        'Liquidity policy,Define protected cash,Treat as protected,Clarified by Rodney,Rodney,2020-02-01,Review quarterly'
    );
    const [d] = mapDecisionLogCsv(rows, 'owner-1');
    expect(d.approval_status).toBe('clarified');
    expect(d.owner_lens).toBe('rodney');
    expect(d.follow_up_action).toBe('Review quarterly');
  });
});
