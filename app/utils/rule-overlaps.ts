import { parseCountries } from "./countries";

export interface OverlapCandidate {
  id: string;
  name: string;
  type: "DEFAULT" | "PRODUCT" | "COLLECTION";
  /** Stored countries ("DE,FR"); "" = all countries. */
  countries: string;
  enabled: boolean;
  /** ISO timestamp. */
  createdAt: string;
  targetIds: string[];
}

export interface RuleOverlap {
  id: string;
  name: string;
  /** Countries both rules cover; [] = both cover all countries. */
  countries: string[];
  /** True when the rule being edited wins (it's newer). */
  thisRuleWins: boolean;
}

/**
 * Other enabled rules that compete with `rule` for the same shoppers:
 * same level, a shared product or collection (any product for DEFAULT),
 * and the same countries. A country rule and an all-countries rule
 * never compete (the country rule wins), so they aren't reported, nor
 * are two all-countries defaults (saving refuses the second one).
 *
 * The newest rule wins, the same order the storefront uses (createdAt,
 * then id). A rule not saved yet (no id) is the newest.
 */
export function findRuleOverlaps(
  rule: {
    id: string | null;
    type: OverlapCandidate["type"];
    countries: string[];
    targetIds: string[];
    enabled: boolean;
    createdAt: string | null;
  },
  others: readonly OverlapCandidate[],
): RuleOverlap[] {
  if (!rule.enabled) return [];
  const mine = parseCountries(rule.countries);
  const targets = new Set(rule.targetIds);
  const overlaps: RuleOverlap[] = [];

  for (const other of others) {
    if (other.id === rule.id || !other.enabled || other.type !== rule.type) {
      continue;
    }
    if (
      rule.type !== "DEFAULT" &&
      !other.targetIds.some((id) => targets.has(id))
    ) {
      continue;
    }
    const theirs = parseCountries(other.countries);
    let shared: string[];
    if (mine.length === 0 && theirs.length === 0) {
      // Only one all-countries default is allowed; saving reports that.
      if (rule.type === "DEFAULT") continue;
      shared = [];
    } else if (mine.length > 0 && theirs.length > 0) {
      shared = mine.filter((code) => theirs.includes(code));
      if (shared.length === 0) continue;
    } else {
      continue;
    }
    overlaps.push({
      id: other.id,
      name: other.name,
      countries: shared,
      thisRuleWins: isNewer(rule, other),
    });
  }
  return overlaps;
}

function isNewer(
  rule: { id: string | null; createdAt: string | null },
  other: { id: string; createdAt: string },
): boolean {
  if (!rule.id || !rule.createdAt) return true;
  const mine = Date.parse(rule.createdAt);
  const theirs = Date.parse(other.createdAt);
  if (mine !== theirs) return mine > theirs;
  return rule.id > other.id;
}
