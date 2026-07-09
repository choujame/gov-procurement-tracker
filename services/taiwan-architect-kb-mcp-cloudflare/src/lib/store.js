/**
 * In-memory knowledge base store, zero dependencies.
 *
 * Takes the parsed entries array directly (dependency injection) rather
 * than reading a file itself, so the same code works both in a Cloudflare
 * Worker (where the JSON is bundled via `import data from "../data/..."`)
 * and under plain Node for local testing (where it's loaded with
 * `JSON.parse(fs.readFileSync(...))`).
 */

export class KnowledgeBaseStore {
  /** @param {Array<Record<string, any>>} entries */
  constructor(entries) {
    /** @type {Map<string, Record<string, any>>} */
    this._entries = new Map();
    for (const item of entries) {
      this._entries.set(item.id, {
        id: item.id,
        category: item.category ?? "",
        title: item.title ?? "",
        summary: item.summary ?? "",
        fullText: item.full_text ?? "",
        status: item.status ?? "",
        sourceUrl: item.source_url ?? "",
        tags: item.tags ?? [],
      });
    }
  }

  _searchableText(entry) {
    return [entry.title, entry.summary, entry.fullText, ...entry.tags].join(" ");
  }

  get(entryId) {
    return this._entries.get(entryId) ?? null;
  }

  all() {
    return [...this._entries.values()];
  }

  /** @param {string} query @param {string} [category] */
  search(query, category) {
    const terms = query.split(/\s+/).filter(Boolean);
    const effectiveTerms = terms.length > 0 ? terms : [query];
    const results = [];
    for (const entry of this._entries.values()) {
      if (category && entry.category !== category) continue;
      const haystack = this._searchableText(entry);
      if (effectiveTerms.some((term) => haystack.includes(term))) {
        results.push(entry);
      }
    }
    return results;
  }
}
