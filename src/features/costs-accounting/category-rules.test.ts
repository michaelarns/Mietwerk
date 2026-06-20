import { describe, expect, it } from "vitest";

import {
  categoryInfo,
  isAllocatableByDefault,
  suggestCategory,
} from "./category-rules";

describe("umlagefähig-Defaults (BetrKV)", () => {
  it("Betriebskosten sind umlagefähig", () => {
    expect(isAllocatableByDefault("GRUNDSTEUER")).toBe(true);
    expect(isAllocatableByDefault("HEIZUNG")).toBe(true);
    expect(isAllocatableByDefault("MUELL")).toBe(true);
  });

  it("Instandhaltung, Verwaltung und Finanzierungszinsen sind NICHT umlagefähig", () => {
    expect(isAllocatableByDefault("INSTANDHALTUNG")).toBe(false);
    expect(isAllocatableByDefault("VERWALTUNG")).toBe(false);
    expect(isAllocatableByDefault("FINANZIERUNGSZINSEN")).toBe(false);
  });
});

describe("Umlageschlüssel-Vorschlag", () => {
  it("Heizung/Wasser verbrauchsabhängig, Grundsteuer nach Wohnfläche", () => {
    expect(categoryInfo("HEIZUNG").suggestedKey).toBe("VERBRAUCH");
    expect(categoryInfo("WASSER").suggestedKey).toBe("VERBRAUCH");
    expect(categoryInfo("GRUNDSTEUER").suggestedKey).toBe("WOHNFLAECHE");
  });

  it("nicht umlagefähige Kategorien haben keinen Schlüssel", () => {
    expect(categoryInfo("INSTANDHALTUNG").suggestedKey).toBeNull();
    expect(categoryInfo("FINANZIERUNGSZINSEN").suggestedKey).toBeNull();
  });
});

describe("Anlage-V-Zeilengruppe", () => {
  it("mappt Kategorien auf die richtige Gruppe", () => {
    expect(categoryInfo("FINANZIERUNGSZINSEN").anlageVGroup).toBe("SCHULDZINSEN");
    expect(categoryInfo("INSTANDHALTUNG").anlageVGroup).toBe("ERHALTUNGSAUFWAND");
    expect(categoryInfo("VERWALTUNG").anlageVGroup).toBe("VERWALTUNGSKOSTEN");
    expect(categoryInfo("GRUNDSTEUER").anlageVGroup).toBe("LAUFENDE_BETRIEBSKOSTEN");
  });
});

describe("regelbasierter Kategorievorschlag (keine KI)", () => {
  it("erkennt typische Buchungstexte", () => {
    expect(suggestCategory("Grundsteuer Q1")).toBe("GRUNDSTEUER");
    expect(suggestCategory("Gebäudeversicherung 2025")).toBe("VERSICHERUNG");
    expect(suggestCategory("Heizöl Lieferung")).toBe("HEIZUNG");
    expect(suggestCategory("Darlehenszinsen Bank")).toBe("FINANZIERUNGSZINSEN");
  });

  it("Reparatur an der Heizung → Instandhaltung (nicht Heizkosten)", () => {
    expect(suggestCategory("Reparatur Heizung")).toBe("INSTANDHALTUNG");
  });

  it("ohne Treffer → null (manuell wählen)", () => {
    expect(suggestCategory("Irgendetwas Unklares")).toBeNull();
    expect(suggestCategory(null)).toBeNull();
  });
});
