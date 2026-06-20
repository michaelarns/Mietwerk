import { LeaseType } from "../../../generated/prisma";
import { type LeaseStatus } from "./lease-rules";

export const LEASE_TYPE_LABELS: Record<LeaseType, string> = {
  [LeaseType.STANDARD]: "Standard",
  [LeaseType.STAFFELMIETE]: "Staffelmiete",
  [LeaseType.INDEXMIETE]: "Indexmiete",
};

export const LEASE_TYPE_OPTIONS = Object.values(LeaseType).map((value) => ({
  value,
  label: LEASE_TYPE_LABELS[value],
}));

export const LEASE_STATUS_LABELS: Record<LeaseStatus, string> = {
  future: "Zukünftig",
  active: "Aktiv",
  ended: "Beendet",
};

export const LEASE_STATUS_VARIANT: Record<
  LeaseStatus,
  "default" | "secondary" | "outline"
> = {
  active: "default",
  future: "secondary",
  ended: "outline",
};
