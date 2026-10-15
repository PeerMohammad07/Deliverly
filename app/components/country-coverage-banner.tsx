/**
 * Warns when the shop has country rules but no rule for all countries:
 * shoppers anywhere else (or detected wrongly, e.g. on a VPN) then see
 * no delivery date at all.
 */
export function CountryCoverageBanner({
  gap,
}: {
  gap: { label: string } | null;
}) {
  if (!gap) return null;
  return (
    <s-banner tone="warning" heading="Some shoppers won’t see a delivery date">
      <s-paragraph>
        Your rules only cover {gap.label}. Add an active rule for all
        products and all countries so shoppers everywhere else still get an
        estimate.
      </s-paragraph>
      <s-button slot="secondary-actions" href="/app/rules/new">
        Create rule
      </s-button>
    </s-banner>
  );
}
