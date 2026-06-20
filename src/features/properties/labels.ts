import { PropertyType } from "../../../generated/prisma";

/** German display labels for the PropertyType enum (Fachbegriffe bleiben deutsch). */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  [PropertyType.MEHRFAMILIENHAUS]: "Mehrfamilienhaus",
  [PropertyType.EINFAMILIENHAUS]: "Einfamilienhaus",
  [PropertyType.EIGENTUMSWOHNUNG]: "Eigentumswohnung",
  [PropertyType.GEWERBE]: "Gewerbe",
  [PropertyType.GEMISCHT]: "Gemischt genutzt",
};

export const PROPERTY_TYPE_OPTIONS = Object.values(PropertyType).map(
  (value) => ({ value, label: PROPERTY_TYPE_LABELS[value] }),
);
