import { describe, expect, it } from "vitest";
import {
  COUNTRY_CODES,
  countryName,
  formatCountries,
  hasCountry,
  parseCountries,
  serializeCountries,
  toCountryCode,
} from "./countries";

describe("COUNTRY_CODES", () => {
  it("is sorted, unique and leaves out ZZ and AN", () => {
    expect([...COUNTRY_CODES].sort()).toEqual(COUNTRY_CODES);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    expect(COUNTRY_CODES).not.toContain("ZZ");
    expect(COUNTRY_CODES).not.toContain("AN");
    expect(COUNTRY_CODES).toHaveLength(243);
  });
});

describe("toCountryCode", () => {
  it("normalizes known codes and rejects everything else", () => {
    expect(toCountryCode(" fr ")).toBe("FR");
    expect(toCountryCode("XK")).toBe("XK");
    expect(toCountryCode("ZZ")).toBeNull();
    expect(toCountryCode("FRA")).toBeNull();
    expect(toCountryCode("")).toBeNull();
    expect(toCountryCode(undefined)).toBeNull();
  });
});

describe("parseCountries / serializeCountries", () => {
  it("sorts, de-duplicates and drops unknown codes", () => {
    expect(parseCountries("FR,de, fr,XX")).toEqual(["DE", "FR"]);
    expect(parseCountries(["us", "US", "ca"])).toEqual(["CA", "US"]);
    expect(serializeCountries(["FR", "DE", "fr"])).toBe("DE,FR");
  });

  it("treats empty input as all countries", () => {
    expect(parseCountries("")).toEqual([]);
    expect(parseCountries(null)).toEqual([]);
    expect(serializeCountries([])).toBe("");
  });
});

describe("hasCountry", () => {
  it("matches exact codes only", () => {
    expect(hasCountry("DE,FR", "FR")).toBe(true);
    expect(hasCountry("DE,FR", "US")).toBe(false);
    expect(hasCountry("", "FR")).toBe(false);
  });
});

describe("countryName / formatCountries", () => {
  it("names countries in English", () => {
    expect(countryName("DE")).toBe("Germany");
  });

  it("summarizes a rule's countries", () => {
    expect(formatCountries("")).toBe("All countries");
    expect(formatCountries("FR")).toBe("France");
    expect(formatCountries("DE,FR")).toBe("France, Germany");
    expect(formatCountries("DE,ES,FR,IT,NL")).toBe("France, Germany +3");
  });
});
