#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PccClient } from "./pccClient.js";
import { searchTenders, searchTendersSchema } from "./tools/searchTenders.js";
import {
  getVendorAwards,
  getVendorAwardsSchema,
} from "./tools/getVendorAwards.js";
import {
  getAgencyRecords,
  getAgencyRecordsSchema,
} from "./tools/getAgencyRecords.js";
import {
  getTenderDetail,
  getTenderDetailSchema,
} from "./tools/getTenderDetail.js";

const client = new PccClient();

const server = new McpServer({
  name: "gov-procurement-tracker",
  version: "0.1.0",
});

server.registerTool(
  "search_tenders",
  {
    title: "Search government procurement notices",
    description:
      "Search Taiwan government procurement tender and award announcements by keyword. Returns matching notices with the agency, job number, notice type, title, and date.",
    inputSchema: searchTendersSchema,
  },
  (args) => searchTenders(client, args),
);

server.registerTool(
  "get_vendor_awards",
  {
    title: "Get a vendor's award history",
    description:
      "Look up the contract award history for a specific vendor/company name in Taiwan's government procurement records.",
    inputSchema: getVendorAwardsSchema,
  },
  (args) => getVendorAwards(client, args),
);

server.registerTool(
  "get_agency_records",
  {
    title: "Get an agency's procurement records",
    description:
      "Look up the tender and award history for a specific government agency/unit by its unit ID.",
    inputSchema: getAgencyRecordsSchema,
  },
  (args) => getAgencyRecords(client, args),
);

server.registerTool(
  "get_tender_detail",
  {
    title: "Get full detail of a tender or award notice",
    description:
      "Fetch the full detail record for a specific tender/award notice, identified by agency unit ID and job number.",
    inputSchema: getTenderDetailSchema,
  },
  (args) => getTenderDetail(client, args),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error starting gov-procurement-tracker MCP server:", err);
  process.exit(1);
});
