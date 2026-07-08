import { z } from "zod";
import type { PccClient } from "../pccClient.js";

export const getVendorAwardsSchema = {
  vendorName: z.string().min(1).describe("Vendor/company name to look up award history for"),
};

export async function getVendorAwards(
  client: PccClient,
  args: { vendorName: string },
) {
  const result = await client.getVendor(args.vendorName);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            vendor_name: result.vendor_name,
            vendor_key: result.vendor_key,
            award_count: result.records.length,
            records: result.records.map((r) => ({
              unit_name: r.unit_name,
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
