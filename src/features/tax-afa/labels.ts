import { type DepreciationMethod } from "../../../generated/prisma";

export const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = {
  LINEAR: "Linear (§ 7 Abs. 4)",
  DEGRESSIV: "Degressiv 5 % (§ 7 Abs. 5a)",
  RESTNUTZUNGSDAUER: "Restnutzungsdauer (§ 7 Abs. 4 S. 2)",
};
