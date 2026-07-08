import { z } from "zod";
import type { PccClient } from "../pccClient.js";

export const getTenderDetailSchema = {
  unitId: z.string().min(1).describe("Government agency/unit ID (from search_tenders' unit_id field)"),
  jobNumber: z.string().min(1).describe("Tender/award job number (from search_tenders' job_number field)"),
};

export async function getTenderDetail(
  client: PccClient,
  args: { unitId: string; jobNumber: string },
) {
  const result = await client.getTenderDetail(args.unitId, args.jobNumber);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
