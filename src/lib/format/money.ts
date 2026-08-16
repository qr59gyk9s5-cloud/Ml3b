/**
 * Money is always integer minor units in the domain/DB layer (never
 * floats — see CLAUDE.md). This is the one place that turns a minor-unit
 * amount into display text.
 */
export function formatPriceMinor(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  const amount = Number.isInteger(major) ? major.toString() : major.toFixed(2);
  return `${amount} ${currency}`;
}
