import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { extractKeywords } from "../src/lib/textrank.js";
import { KnowledgeBaseStore } from "../src/lib/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "data", "building-codes.json");
const raw = JSON.parse(readFileSync(dataPath, "utf-8"));

test("extractKeywords: empty text returns no keywords", () => {
  assert.deepEqual(extractKeywords(""), []);
});

test("extractKeywords: non-Chinese text returns no keywords", () => {
  assert.deepEqual(extractKeywords("hello world 123"), []);
});

test("extractKeywords: repeated term shows up in a merged phrase", () => {
  const text = "建築物安全建築物安全建築物安全消防設備一次";
  const keywords = extractKeywords(text, 3);
  assert.ok(keywords.length > 0);
  assert.ok(keywords.some((k) => k.term.includes("建築物")));
});

test("extractKeywords: respects topK", () => {
  const text =
    "建築技術規則建築設計施工編構造編設備編無障礙設施消防安全設備政府採購法招標決標公告";
  const keywords = extractKeywords(text, 3);
  assert.ok(keywords.length <= 3);
});

test("extractKeywords: scores sorted descending", () => {
  const text =
    "建築技術規則建築設計施工編構造編設備編無障礙設施消防安全設備政府採購法招標決標公告";
  const keywords = extractKeywords(text, 10);
  const scores = keywords.map((k) => k.score);
  const sorted = [...scores].sort((a, b) => b - a);
  assert.deepEqual(scores, sorted);
});

test("store: loads seed entries", () => {
  const store = new KnowledgeBaseStore(raw.entries);
  assert.ok(store.all().length > 0);
});

test("store: get known entry", () => {
  const store = new KnowledgeBaseStore(raw.entries);
  const entry = store.get("tw-building-act");
  assert.ok(entry);
  assert.equal(entry.category, "statute");
});

test("store: get unknown entry returns null", () => {
  const store = new KnowledgeBaseStore(raw.entries);
  assert.equal(store.get("does-not-exist"), null);
});

test("store: search by keyword", () => {
  const store = new KnowledgeBaseStore(raw.entries);
  const results = store.search("消防");
  assert.ok(results.some((e) => e.id === "tw-fire-services-act"));
});

test("store: search respects category filter", () => {
  const store = new KnowledgeBaseStore(raw.entries);
  const results = store.search("建築", "regulation");
  assert.ok(results.every((e) => e.category === "regulation"));
});

test("store: search no match returns empty", () => {
  const store = new KnowledgeBaseStore(raw.entries);
  assert.deepEqual(store.search("完全不相關的詞彙xyz"), []);
});
