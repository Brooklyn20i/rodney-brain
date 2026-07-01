// Persistent authority-boundary notice, shown on every screen. Required by
// the product brief: this tool must never imply it can act on Rodney's
// behalf.
export function AuthorityBanner() {
  return (
    <div className="authority-banner">
      Management-grade operating tool, not regulated financial advice. No authority to place
      trades, move money, pay bills, refinance loans, or contact banks, brokers, accountants or
      other third parties.
    </div>
  );
}
