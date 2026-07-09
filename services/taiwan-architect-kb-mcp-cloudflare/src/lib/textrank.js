/**
 * Lightweight Chinese TextRank keyword extraction, zero dependencies.
 *
 * Direct JS port of the Python implementation in
 * services/taiwan-architect-kb-mcp/src/textrank.py — see that file's
 * module docstring for the full rationale (approximates TextRank4ZH
 * without jieba segmentation, using character n-grams instead).
 */

const CJK_RUN_RE = /[一-鿿]+/g;

const STOPWORDS = new Set([
  "的", "之", "與", "及", "或", "等", "於", "在", "為", "是", "者",
  "其", "而", "並", "以", "對", "由", "如", "則", "亦", "但", "又",
  "所", "本", "該", "此", "各", "應", "得", "均", "已", "未", "皆",
]);

function candidateTerms(text, ngramSizes = [2, 3]) {
  const terms = [];
  const runs = text.match(CJK_RUN_RE) || [];
  for (const run of runs) {
    for (const size of ngramSizes) {
      for (let i = 0; i <= run.length - size; i++) {
        const gram = run.slice(i, i + size);
        if ([...gram].some((ch) => STOPWORDS.has(ch))) continue;
        terms.push(gram);
      }
    }
  }
  return terms;
}

function buildGraph(terms, window) {
  const graph = new Map();
  const ensure = (term) => {
    if (!graph.has(term)) graph.set(term, new Map());
    return graph.get(term);
  };
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    ensure(term);
    for (let j = i + 1; j < Math.min(i + window, terms.length); j++) {
      const other = terms[j];
      if (other === term) continue;
      ensure(other);
      const a = ensure(term);
      const b = ensure(other);
      a.set(other, (a.get(other) || 0) + 1);
      b.set(term, (b.get(term) || 0) + 1);
    }
  }
  return graph;
}

function pagerank(graph, damping = 0.85, maxIter = 100, tol = 1e-6) {
  const nodes = [...graph.keys()];
  const n = nodes.length;
  if (n === 0) return new Map();

  let scores = new Map(nodes.map((node) => [node, 1 / n]));
  const outWeight = new Map(
    nodes.map((node) => {
      const total = [...graph.get(node).values()].reduce((a, b) => a + b, 0);
      return [node, total || 1];
    }),
  );

  for (let iter = 0; iter < maxIter; iter++) {
    const newScores = new Map();
    let maxDelta = 0;
    for (const node of nodes) {
      let rankSum = 0;
      for (const [neighbor, weight] of graph.get(node).entries()) {
        rankSum += (weight / outWeight.get(neighbor)) * scores.get(neighbor);
      }
      const value = (1 - damping) / n + damping * rankSum;
      newScores.set(node, value);
      maxDelta = Math.max(maxDelta, Math.abs(value - scores.get(node)));
    }
    scores = newScores;
    if (maxDelta < tol) break;
  }
  return scores;
}

function mergeAdjacent(keywords, originalTerms) {
  const keywordSet = new Set(keywords);
  const merged = [];
  const seen = new Set();
  let i = 0;
  while (i < originalTerms.length) {
    const term = originalTerms[i];
    if (keywordSet.has(term) && !seen.has(term)) {
      let phrase = term;
      let j = i + 1;
      while (j < originalTerms.length && keywordSet.has(originalTerms[j])) {
        const candidate = originalTerms[j];
        const suffix = phrase.slice(-(candidate.length - 1));
        if (candidate.startsWith(suffix)) {
          phrase += candidate[candidate.length - 1];
          j += 1;
        } else {
          break;
        }
      }
      if (!seen.has(phrase)) {
        merged.push(phrase);
        seen.add(phrase);
      }
      i = j;
    } else {
      i += 1;
    }
  }
  return merged;
}

/**
 * Extract up to `topK` keywords/phrases from Chinese `text`.
 * @returns {{term: string, score: number}[]}
 */
export function extractKeywords(text, topK = 10, window = 4) {
  const terms = candidateTerms(text);
  if (terms.length === 0) return [];

  const graph = buildGraph(terms, window);
  const scores = pagerank(graph);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const topTerms = ranked.slice(0, Math.max(topK * 3, topK)).map(([term]) => term);
  const phrases = mergeAdjacent(topTerms, terms);

  const phraseScores = phrases.map((phrase) => {
    let best = 0;
    for (const t of topTerms) {
      if (phrase.includes(t) || t.includes(phrase)) {
        best = Math.max(best, scores.get(t) ?? 0);
      }
    }
    return { term: phrase, score: best };
  });

  phraseScores.sort((a, b) => b.score - a.score);
  return phraseScores.slice(0, topK);
}
