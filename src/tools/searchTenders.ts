import { z } from "zod";
import type { PccClient } from "../pccClient.js";

export const searchTendersSchema = {
  query: z.string().min(1).describe("Keyword to search for in tender/award titles, e.g. an agency name, project type, or item description"),
  page: z.number().int().min(1).default(1).describe("Page number of results (each page is ~100 records)"),
  noticeType: z
    .enum(["tender", "award", "all"])
    .default("all")
    .describe("Filter to tender announcements (招標公告), award announcements (決標公告), or all notices"),
};

const NOTICE_TYPE_KEYWORDS: Record<"tender" | "award", string> = {
  tender: "招標",
  award: "決標",
};

export async function searchTenders(
  client: PccClient,
  args: { query: string; page?: number; noticeType?: "tender" | "award" | "all" },
) {
  const result = await client.searchByTitle(args.query, args.page ?? 1);
  const noticeType = args.noticeType ?? "all";
  const records =
    noticeType === "all"
      ? result.records
      : result.records.filter((r) =>
          r.brief.type.includes(NOTICE_TYPE_KEYWORDS[noticeType]),
        );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            total: result.total,
            hits: records.length,
            records: records.map((r) => ({
              unit_name: r.unit_name,
              unit_id: r.unit_id,
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
