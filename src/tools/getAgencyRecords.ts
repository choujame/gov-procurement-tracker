import { z } from "zod";
import type { PccClient } from "../pccClient.js";

export const getAgencyRecordsSchema = {
  unitId: z.string().min(1).describe("Government agency/unit ID (as returned by search_tenders in the unit_id field)"),
};

export async function getAgencyRecords(
  client: PccClient,
  args: { unitId: string },
) {
  const result = await client.getUnit(args.unitId);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            unit_name: result.unit_name,
            unit_id: result.unit_id,
            record_count: result.records.length,
            records: result.records.map((r) => ({
              job_number: r.job_number,
              type: r.brief.type,
              title: r.brief.title,
              date: r.date,
            })),
          },
          null,
          2,
        ),
      },
    ],
  };
}
