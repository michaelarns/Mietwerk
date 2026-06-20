import {
  type AllocationKey,
  type ExpenseType,
  type TransactionCategory,
} from "../../../generated/prisma";

import { type AnlageVGroup } from "./category-rules";
import { type AnschaffungsnahStatus } from "./anschaffungsnah-rules";

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  GRUNDSTEUER: "Grundsteuer",
  VERSICHERUNG: "Versicherung",
  HEIZUNG: "Heizung/Brennstoffe",
  WASSER: "Wasser",
  ABWASSER: "Abwasser",
  MUELL: "Müllentsorgung",
  HAUSREINIGUNG: "Hausreinigung",
  HAUSMEISTER: "Hausmeister/Hauswart",
  STROM_ALLGEMEIN: "Allgemeinstrom",
  AUFZUG: "Aufzug",
  GARTENPFLEGE: "Gartenpflege",
  SCHORNSTEINFEGER: "Schornsteinfeger",
  INSTANDHALTUNG: "Instandhaltung/Reparatur",
  VERWALTUNG: "Verwaltungskosten",
  FINANZIERUNGSZINSEN: "Finanzierungszinsen",
  SONSTIGE: "Sonstiges",
};

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  SOFORTABZUG: "Sofort abziehbar (Erhaltungsaufwand)",
  VERTEILUNG_82B: "Verteilung 2–5 Jahre (§ 82b EStDV)",
  HERSTELLUNG_AKTIVIEREN: "Herstellungskosten (über AfA)",
  ANSCHAFFUNGSNAH: "Anschaffungsnahe HK (§ 6 Abs. 1 Nr. 1a)",
  ANSCHAFFUNGSNEBENKOSTEN: "Anschaffungsnebenkosten (AfA-Basis)",
  NICHT_ABZIEHBAR: "Nicht abziehbar",
};

export const ALLOCATION_KEY_LABELS: Record<AllocationKey, string> = {
  WOHNFLAECHE: "Wohnfläche",
  PERSONEN: "Personenzahl",
  EINHEITEN: "Anzahl Einheiten",
  VERBRAUCH: "Verbrauch",
  MITEIGENTUMSANTEIL: "Miteigentumsanteil",
};

export const ANLAGE_V_GROUP_LABELS: Record<AnlageVGroup, string> = {
  EINNAHMEN_MIETE: "Mieteinnahmen",
  AFA: "AfA (Gebäudeabschreibung)",
  SCHULDZINSEN: "Schuldzinsen",
  ERHALTUNGSAUFWAND: "Erhaltungsaufwand",
  LAUFENDE_BETRIEBSKOSTEN: "Laufende Betriebskosten",
  VERWALTUNGSKOSTEN: "Verwaltungskosten",
  SONSTIGE_WERBUNGSKOSTEN: "Sonstige Werbungskosten",
};

export const ANSCHAFFUNGSNAH_STATUS_LABELS: Record<
  AnschaffungsnahStatus,
  string
> = {
  UNTER: "Unter der 15 %-Grenze",
  NAHE: "Nahe an der 15 %-Grenze",
  UEBERSCHRITTEN: "15 %-Grenze überschritten",
};

/** Badge-/Banner-Variante je Status der anschaffungsnahen HK. */
export const ANSCHAFFUNGSNAH_STATUS_VARIANT: Record<
  AnschaffungsnahStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  UNTER: "outline",
  NAHE: "secondary",
  UEBERSCHRITTEN: "destructive",
};
