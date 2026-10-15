import { describe, expect, it } from "vitest";
import { pickRule } from "./pick-rule";

// Newest first, as the finders return them.
const usOnly = { id: "us", countries: "US" };
const europe = { id: "eu", countries: "DE,FR,IT" };
const everywhere = { id: "all", countries: "" };
const olderEverywhere = { id: "all-old", countries: "" };

describe("pickRule", () => {
  it("prefers a rule for the shopper's country", () => {
    expect(pickRule([everywhere, europe], "FR")).toBe(europe);
    expect(pickRule([usOnly, europe, everywhere], "US")).toBe(usOnly);
  });

  it("falls back to an all-countries rule", () => {
    expect(pickRule([europe, everywhere], "US")).toBe(everywhere);
  });

  it("returns null when only other countries' rules match", () => {
    expect(pickRule([usOnly, europe], "JP")).toBeNull();
  });

  it("uses only all-countries rules without a known country", () => {
    expect(pickRule([europe, everywhere], null)).toBe(everywhere);
    expect(pickRule([usOnly], null)).toBeNull();
  });

  it("keeps the newest rule among equal candidates", () => {
    expect(pickRule([everywhere, olderEverywhere], "FR")).toBe(everywhere);
    const newerEurope = { id: "eu-new", countries: "FR" };
    expect(pickRule([newerEurope, europe], "FR")).toBe(newerEurope);
  });

  it("returns null for an empty level", () => {
    expect(pickRule([], "FR")).toBeNull();
  });
});
