"""Lightweight Chinese TextRank keyword extraction, stdlib-only.

Approximates the approach used by TextRank4ZH (github.com/letiantian/TextRank4ZH):
build a co-occurrence graph over candidate terms within a sliding window, then
rank terms with iterative PageRank.

TextRank4ZH segments text into words with jieba before building the graph.
jieba (and the `textrank4zh` package itself) can't be installed in this
environment (no package registry access), so this module substitutes a
segmentation-free approximation: candidate terms are n-grams (default: 2-3
characters) over runs of CJK characters, filtered against a small stopword
set. This is strictly weaker than real word segmentation and should be
swapped for a jieba-backed implementation once dependency installation is
available.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_CJK_RUN_RE = re.compile(r"[一-鿿]+")

_STOPWORDS = {
    "的", "之", "與", "及", "或", "等", "於", "在", "為", "是", "者",
    "其", "而", "並", "以", "對", "由", "如", "則", "亦", "但", "又",
    "所", "本", "該", "此", "各", "應", "得", "均", "已", "未", "皆",
}


@dataclass(frozen=True)
class Keyword:
    term: str
    score: float


def _candidate_terms(text: str, ngram_sizes: tuple[int, ...] = (2, 3)) -> list[str]:
    terms: list[str] = []
    for run in _CJK_RUN_RE.findall(text):
        for size in ngram_sizes:
            for i in range(len(run) - size + 1):
                gram = run[i : i + size]
                if any(ch in _STOPWORDS for ch in gram):
                    continue
                terms.append(gram)
    return terms


def _build_graph(
    terms: list[str], window: int
) -> tuple[list[str], dict[str, dict[str, float]]]:
    graph: dict[str, dict[str, float]] = {}
    for i, term in enumerate(terms):
        graph.setdefault(term, {})
        for j in range(i + 1, min(i + window, len(terms))):
            other = terms[j]
            if other == term:
                continue
            graph.setdefault(other, {})
            graph[term][other] = graph[term].get(other, 0.0) + 1.0
            graph[other][term] = graph[other].get(term, 0.0) + 1.0
    return list(graph.keys()), graph


def _pagerank(
    nodes: list[str],
    graph: dict[str, dict[str, float]],
    damping: float = 0.85,
    max_iter: int = 100,
    tol: float = 1e-6,
) -> dict[str, float]:
    if not nodes:
        return {}
    n = len(nodes)
    scores = {node: 1.0 / n for node in nodes}
    out_weight = {
        node: sum(graph[node].values()) or 1.0 for node in nodes
    }

    for _ in range(max_iter):
        new_scores = {}
        max_delta = 0.0
        for node in nodes:
            rank_sum = 0.0
            for neighbor, weight in graph[node].items():
                rank_sum += (weight / out_weight[neighbor]) * scores[neighbor]
            new_scores[node] = (1 - damping) / n + damping * rank_sum
            max_delta = max(max_delta, abs(new_scores[node] - scores[node]))
        scores = new_scores
        if max_delta < tol:
            break
    return scores


def _merge_adjacent(keywords: list[str], original_terms: list[str]) -> list[str]:
    """Merge keyword n-grams that appear as consecutive overlapping spans in the
    source term sequence into longer phrases, mirroring TextRank4ZH's phrase
    extraction step."""
    keyword_set = set(keywords)
    merged: list[str] = []
    seen: set[str] = set()
    i = 0
    while i < len(original_terms):
        term = original_terms[i]
        if term in keyword_set and term not in seen:
            phrase = term
            j = i + 1
            while j < len(original_terms) and original_terms[j] in keyword_set:
                candidate = original_terms[j]
                if candidate.startswith(phrase[-(len(candidate) - 1) :]):
                    phrase += candidate[-1]
                    j += 1
                else:
                    break
            if phrase not in seen:
                merged.append(phrase)
                seen.add(phrase)
            i = j
        else:
            i += 1
    return merged


def extract_keywords(
    text: str, top_k: int = 10, window: int = 4
) -> list[Keyword]:
    """Extract up to `top_k` keywords/phrases from Chinese `text`."""
    terms = _candidate_terms(text)
    if not terms:
        return []

    nodes, graph = _build_graph(terms, window=window)
    scores = _pagerank(nodes, graph)

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    top_terms = [term for term, _ in ranked[: max(top_k * 3, top_k)]]
    phrases = _merge_adjacent(top_terms, terms)

    phrase_scores = []
    for phrase in phrases:
        # score a merged phrase as the max score of its constituent n-grams
        best = max(
            (scores[t] for t in top_terms if t in phrase or phrase in t),
            default=0.0,
        )
        phrase_scores.append(Keyword(term=phrase, score=best))

    phrase_scores.sort(key=lambda k: k.score, reverse=True)
    return phrase_scores[:top_k]
