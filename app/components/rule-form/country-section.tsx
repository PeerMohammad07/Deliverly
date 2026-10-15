import { useMemo, useState } from "react";
import type { RuleFormErrors } from "../../validators/deliveryRule.validator";
import {
  COUNTRY_CODES,
  countryName,
  formatCountries,
} from "../../utils/countries";
import type { RuleOverlap } from "../../utils/rule-overlaps";

interface CountryOption {
  code: string;
  name: string;
}

interface CountrySectionProps {
  /** On = the rule is limited to `countries`; off = all countries. */
  limited: boolean;
  countries: string[];
  /** Other active rules competing for the same shoppers. */
  overlaps: RuleOverlap[];
  errors: RuleFormErrors;
  onLimitedChange: (limited: boolean) => void;
  onCountriesChange: (countries: string[]) => void;
}

const MAX_OVERLAPS_SHOWN = 3;

export function CountrySection({
  limited,
  countries,
  overlaps,
  errors,
  onLimitedChange,
  onCountriesChange,
}: CountrySectionProps) {
  const [query, setQuery] = useState("");

  const options = useMemo<CountryOption[]>(
    () =>
      COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort(
        (a, b) => a.name.localeCompare(b.name),
      ),
    [],
  );
  const names = useMemo(
    () => new Map(options.map((option) => [option.code, option.name])),
    [options],
  );

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter(
        (option) =>
          option.name.toLowerCase().includes(needle) ||
          option.code.toLowerCase() === needle,
      )
    : options;

  const selectedByName = [...countries].sort((a, b) =>
    (names.get(a) ?? a).localeCompare(names.get(b) ?? b),
  );

  // The list only shows matches for the search, so its values only
  // cover those. Keep picks that are hidden by the search.
  function handleListChange(values: string[]) {
    const shown = new Set(visible.map((option) => option.code));
    const hidden = countries.filter((code) => !shown.has(code));
    onCountriesChange([...new Set([...hidden, ...values])].sort());
  }

  return (
    <s-section heading="Countries">
      <s-stack direction="block" gap="base">
        <s-choice-list
          label="Shows to shoppers in"
          name="countryScope"
          values={[limited ? "specific" : "all"]}
          onChange={(event) =>
            onLimitedChange(event.currentTarget.values[0] === "specific")
          }
        >
          <s-choice value="all">All countries</s-choice>
          <s-choice value="specific">Specific countries</s-choice>
        </s-choice-list>

        {limited ? (
          <s-stack direction="block" gap="small-200">
            <s-text type="strong">
              {countries.length === 0
                ? "No countries selected"
                : countries.length === 1
                  ? "1 country selected"
                  : `${countries.length} countries selected`}
            </s-text>
            {selectedByName.length > 0 ? (
              <s-stack direction="inline" gap="small-200">
                {selectedByName.map((code) => (
                  <s-clickable-chip
                    key={code}
                    removable
                    accessibilityLabel={`Remove ${names.get(code) ?? code}`}
                    onRemove={() =>
                      onCountriesChange(countries.filter((c) => c !== code))
                    }
                  >
                    {names.get(code) ?? code}
                  </s-clickable-chip>
                ))}
              </s-stack>
            ) : null}
            <s-search-field
              label="Search countries"
              labelAccessibilityVisibility="exclusive"
              placeholder="Search countries"
              autocomplete="off"
              value={query}
              onInput={(event: unknown) => {
                const target = (event as { target?: { value?: unknown } })
                  ?.target;
                setQuery(
                  target && typeof target.value === "string"
                    ? target.value
                    : "",
                );
              }}
            />
            <s-box border="base" borderRadius="base" padding="small">
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                {visible.length > 0 ? (
                  <s-choice-list
                    label="Countries"
                    labelAccessibilityVisibility="exclusive"
                    name="countryPicks"
                    multiple
                    values={countries}
                    onChange={(event) =>
                      handleListChange(event.currentTarget.values)
                    }
                  >
                    {visible.map((option) => (
                      <s-choice key={option.code} value={option.code}>
                        {option.name}
                      </s-choice>
                    ))}
                  </s-choice-list>
                ) : (
                  <s-paragraph color="subdued">
                    No countries match “{query.trim()}”.
                  </s-paragraph>
                )}
              </div>
            </s-box>
          </s-stack>
        ) : null}

        {overlaps.length > 0 ? (
          <s-banner tone="warning" heading="Overlaps with other rules">
            <s-stack direction="block" gap="small-200">
              {overlaps.slice(0, MAX_OVERLAPS_SHOWN).map((overlap) => (
                <s-paragraph key={overlap.id}>
                  <s-text type="strong">“{overlap.name}”</s-text>{" "}
                  also covers{" "}
                  {overlap.countries.length > 0
                    ? formatCountries(overlap.countries, 3)
                    : "all countries"}
                  .{" "}
                  {overlap.thisRuleWins
                    ? "This rule wins there because it’s newer."
                    : "That rule wins there because it’s newer."}
                </s-paragraph>
              ))}
              {overlaps.length > MAX_OVERLAPS_SHOWN ? (
                <s-paragraph>
                  And {overlaps.length - MAX_OVERLAPS_SHOWN} more.
                </s-paragraph>
              ) : null}
            </s-stack>
          </s-banner>
        ) : null}

        {errors.countries ? (
          <s-paragraph tone="critical">{errors.countries}</s-paragraph>
        ) : null}

        <s-grid gridTemplateColumns="auto minmax(0, 1fr)" gap="small-200">
          <s-icon type="info" size="small" />
          <s-paragraph color="subdued">
            Uses the shopper’s country from Shopify Markets. A rule for the
            shopper’s country wins over an all-countries rule.
          </s-paragraph>
        </s-grid>
      </s-stack>
    </s-section>
  );
}
