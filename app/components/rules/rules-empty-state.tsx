export function RulesEmptyState() {
  return (
    <s-section accessibilityLabel="Get started">
      <s-empty-state heading="Show customers when their order will arrive">
        <s-image
          slot="graphic"
          src="/images/eta-rules-empty.svg"
          alt=""
          accessibilityRole="presentation"
          inlineSize="auto"
        />
        <s-text slot="subheading">
          Create a rule to set processing time, delivery days and the days you
          don’t deliver. Start with one rule for all products, then add product
          or collection rules where times differ.
        </s-text>
        <s-button
          slot="primary-action"
          variant="primary"
          icon="plus"
          href="/app/rules/new"
        >
          Create rule
        </s-button>
      </s-empty-state>
    </s-section>
  );
}
