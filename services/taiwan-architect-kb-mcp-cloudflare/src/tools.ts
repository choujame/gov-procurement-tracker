// Tool registration for the MCP server.
//
// UNVERIFIED: this file depends on the `@modelcontextprotocol/sdk` API
// surface (`McpServer#registerTool`), which could not be installed or
// exercised in the sandbox this was written in (no npm registry access).
// The shape mirrors the same tool registration pattern used in the
// already-verified stdio server at
// ../../taiwan-architect-kb-mcp/src/server.py, and the sibling Node MCP
// server at ../../../src/index.ts. Confirm it against the installed SDK
// version before deploying.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractKeywords } from "./lib/textrank.js";
import { KnowledgeBaseStore } from "./lib/store.js";
import buildingCodes from "../data/building-codes.json";

const store = new KnowledgeBaseStore((buildingCodes as { entries: Record<string, unknown>[] }).entries);

function entrySummary(entry: ReturnType<KnowledgeBaseStore["get"]>) {
  if (!entry) return null;
  return {
    id: entry.id,
    category: entry.category,
    title: entry.title,
    summary: entry.summary,
    status: entry.status,
  };
}

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

export function registerTools(server: McpServer) {
  server.registerTool(
    "search_kb",
    {
      title: "Search the Taiwan architect/building-code knowledge base",
      description:
        "Search the Taiwan building-code / architect-regulation knowledge base by keyword. Optionally filter by category (statute, regulation).",
      inputSchema: {
        query: z.string().min(1).describe("Keyword(s) to search for"),
        category: z
          .string()
          .optional()
          .describe("Optional category filter, e.g. 'statute' or 'regulation'"),
      },
    },
    ({ query, category }) => {
      const results = store.search(query, category);
      return jsonResult({
        count: results.length,
        entries: results.map(entrySummary),
      });
    },
  );

  server.registerTool(
    "get_kb_entry",
    {
      title: "Get a knowledge base entry",
      description: "Fetch a single knowledge base entry by its id.",
      inputSchema: {
        id: z.string().min(1).describe("Entry id, e.g. 'tw-building-act'"),
      },
    },
    ({ id }) => {
      const entry = store.get(id);
      if (!entry) return errorResult(`No entry with id: ${id}`);
      return jsonResult({
        ...entrySummary(entry),
        full_text: entry.fullText,
        source_url: entry.sourceUrl,
        tags: entry.tags,
      });
    },
  );

  server.registerTool(
    "extract_keywords",
    {
      title: "Extract Chinese keywords",
      description:
        "Run TextRank-style keyword/phrase extraction over Chinese text (e.g. a procurement tender description) and return the top ranked terms.",
      inputSchema: {
        text: z.string().min(1).describe("Chinese text to extract keywords from"),
        topK: z.number().int().min(1).default(10).describe("Number of keywords to return"),
      },
    },
    ({ text, topK }) => {
      const keywords = extractKeywords(text, topK ?? 10);
      return jsonResult({
        keywords: keywords.map((k) => ({ term: k.term, score: Number(k.score.toFixed(6)) })),
      });
    },
  );

  server.registerTool(
    "suggest_related_codes",
    {
      title: "Suggest related building codes",
      description:
        "Extract keywords from Chinese text (e.g. a construction-related procurement tender description) and use them to look up potentially relevant building-code / architect-regulation knowledge base entries.",
      inputSchema: {
        text: z.string().min(1).describe("Chinese text to find related codes for"),
        topK: z.number().int().min(1).default(5).describe("Max number of KB entries to return"),
      },
    },
    ({ text, topK }) => {
      const keywords = extractKeywords(text, 15);
      const hitCounts = new Map<string, number>();
      const matchedByKeyword = new Map<string, string[]>();

      for (const kw of keywords) {
        for (const entry of store.search(kw.term)) {
          hitCounts.set(entry.id, (hitCounts.get(entry.id) ?? 0) + 1);
          const list = matchedByKeyword.get(entry.id) ?? [];
          list.push(kw.term);
          matchedByKeyword.set(entry.id, list);
        }
      }

      const rankedIds = [...hitCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, topK ?? 5)
        .map(([id]) => id);

      const suggestions = rankedIds
        .map((id) => {
          const entry = store.get(id);
          if (!entry) return null;
          return { ...entrySummary(entry), matched_keywords: matchedByKeyword.get(id) ?? [] };
        })
        .filter(Boolean);

      return jsonResult({
        extracted_keywords: keywords.map((k) => k.term),
        suggestions,
      });
    },
  );
}
