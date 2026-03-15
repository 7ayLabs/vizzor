"""Narrative detection model using TF-IDF + topic clustering.

Identifies trending crypto narratives from text corpora by matching against
known narrative keyword clusters and scoring by frequency and context.
"""

import math
import os
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

KNOWN_NARRATIVES = [
    "ai_crypto",
    "rwa",
    "depin",
    "meme",
    "l2_scaling",
    "restaking",
    "defi_revival",
    "gaming",
    "regulation",
    "btc_ecosystem",
]

# Keyword dictionaries per narrative — used for TF-IDF matching
NARRATIVE_KEYWORDS: dict[str, list[str]] = {
    "ai_crypto": [
        "artificial intelligence",
        "machine learning",
        "ai agent",
        "neural",
        "llm",
        "gpt",
        "generative",
        "ai token",
        "ai crypto",
        "compute",
        "inference",
        "training data",
        "decentralized ai",
        "ai blockchain",
        "openai",
        "anthropic",
    ],
    "rwa": [
        "real world asset",
        "rwa",
        "tokenized",
        "treasury",
        "t-bill",
        "bond",
        "real estate",
        "commodity",
        "securitization",
        "ondo",
        "centrifuge",
        "maple",
        "clearpool",
        "institutional",
    ],
    "depin": [
        "depin",
        "decentralized physical",
        "iot",
        "sensor",
        "wireless",
        "helium",
        "hivemapper",
        "render",
        "filecoin",
        "storage",
        "compute network",
        "physical infrastructure",
        "hardware",
    ],
    "meme": [
        "meme",
        "memecoin",
        "doge",
        "shib",
        "pepe",
        "bonk",
        "wif",
        "community token",
        "fair launch",
        "pump fun",
        "solana meme",
        "based",
        "moon",
        "ape",
        "degen",
    ],
    "l2_scaling": [
        "layer 2",
        "l2",
        "rollup",
        "optimistic",
        "zk rollup",
        "zero knowledge",
        "arbitrum",
        "optimism",
        "base",
        "zksync",
        "starknet",
        "scroll",
        "polygon",
        "scaling",
        "throughput",
        "tps",
    ],
    "restaking": [
        "restaking",
        "eigenlayer",
        "liquid restaking",
        "lrt",
        "avs",
        "actively validated",
        "ether.fi",
        "puffer",
        "renzo",
        "kelp",
        "shared security",
        "slashing",
    ],
    "defi_revival": [
        "defi",
        "decentralized finance",
        "yield",
        "lending",
        "borrowing",
        "dex",
        "amm",
        "liquidity",
        "tvl",
        "aave",
        "uniswap",
        "curve",
        "maker",
        "compound",
        "perp",
        "perpetual",
    ],
    "gaming": [
        "gamefi",
        "gaming",
        "play to earn",
        "p2e",
        "nft game",
        "metaverse",
        "virtual world",
        "axie",
        "immutable",
        "gala",
        "illuvium",
        "guild",
        "esports",
        "blockchain game",
    ],
    "regulation": [
        "regulation",
        "sec",
        "cftc",
        "compliance",
        "etf",
        "spot etf",
        "bitcoin etf",
        "legislation",
        "framework",
        "license",
        "ban",
        "legal",
        "enforcement",
        "stablecoin bill",
        "mica",
    ],
    "btc_ecosystem": [
        "bitcoin",
        "btc",
        "ordinals",
        "inscription",
        "brc-20",
        "rune",
        "runes",
        "lightning",
        "taproot",
        "nostr",
        "stacks",
        "bitcoin l2",
        "halving",
        "satoshi",
        "bitcoin defi",
    ],
}


@dataclass
class NarrativeResult:
    """Result of narrative detection."""

    narrative: str  # detected narrative label
    confidence: float  # 0-1
    related_tokens: list[str]  # tokens associated with this narrative
    keywords: list[str]  # top keywords found
    trend_direction: str  # 'emerging', 'peaking', 'fading'
    mention_count: int


class NarrativeDetectorModel:
    """Narrative detection using TF-IDF keyword matching against known clusters.

    Performs lightweight TF-IDF vectorization and scores each known narrative
    based on keyword frequency and contextual signals in the input text corpus.
    """

    def __init__(self) -> None:
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.narratives = KNOWN_NARRATIVES
        self.keywords = NARRATIVE_KEYWORDS

    def load(self) -> None:
        """Initialize model (keyword-based, always ready)."""
        self.is_loaded = True

    def detect(self, texts: list[str]) -> list[NarrativeResult]:
        """Detect narratives from a corpus of texts.

        Performs TF-IDF vectorization and matches against known narrative
        keyword clusters. Returns results sorted by confidence descending.
        """
        if not texts:
            return []

        # Build document frequency across corpus
        corpus_lower = [t.lower() for t in texts]
        total_docs = len(corpus_lower)

        # Compute TF-IDF scores per narrative
        narrative_scores: dict[str, dict[str, float]] = {}

        for narrative, kw_list in self.keywords.items():
            matched_keywords: list[str] = []
            total_tf_idf = 0.0
            mention_count = 0

            for keyword in kw_list:
                # Document frequency: how many docs contain this keyword
                df = sum(1 for doc in corpus_lower if keyword in doc)
                if df == 0:
                    continue

                # IDF: log(N / df)
                idf = math.log(total_docs / df) + 1.0

                # TF: total occurrences across all docs
                tf = sum(doc.count(keyword) for doc in corpus_lower)
                mention_count += tf

                tf_idf = (1 + math.log(tf)) * idf if tf > 0 else 0.0
                total_tf_idf += tf_idf
                matched_keywords.append(keyword)

            if matched_keywords:
                narrative_scores[narrative] = {
                    "score": total_tf_idf,
                    "mention_count": mention_count,
                    "keywords": matched_keywords,
                }

        if not narrative_scores:
            return []

        # Normalize scores to 0-1 confidence range
        max_score = max(s["score"] for s in narrative_scores.values())
        if max_score == 0:
            max_score = 1.0

        results: list[NarrativeResult] = []
        for narrative, data in narrative_scores.items():
            raw_confidence = data["score"] / max_score
            confidence = min(1.0, raw_confidence)
            mention_count = int(data["mention_count"])

            # Extract related token symbols from texts
            related_tokens = self._extract_tokens(corpus_lower, narrative)

            # Determine trend direction based on mention distribution
            trend_direction = self._estimate_trend(corpus_lower, data["keywords"])

            # Top keywords sorted by actual occurrence
            kw_counts = [
                (kw, sum(doc.count(kw) for doc in corpus_lower))
                for kw in data["keywords"]
            ]
            kw_counts.sort(key=lambda x: x[1], reverse=True)
            top_keywords = [kw for kw, _ in kw_counts[:5]]

            results.append(
                NarrativeResult(
                    narrative=narrative,
                    confidence=round(confidence, 4),
                    related_tokens=related_tokens[:10],
                    keywords=top_keywords,
                    trend_direction=trend_direction,
                    mention_count=mention_count,
                )
            )

        results.sort(key=lambda r: r.confidence, reverse=True)
        return results

    def predict(self, features: dict) -> NarrativeResult:
        """API-compatible prediction (takes {"texts": [...]}).

        Returns the top narrative result.
        """
        texts = features.get("texts", [])
        results = self.detect(texts)
        if not results:
            return NarrativeResult(
                narrative="unknown",
                confidence=0.0,
                related_tokens=[],
                keywords=[],
                trend_direction="fading",
                mention_count=0,
            )
        return results[0]

    def get_trending_narratives(
        self, texts: list[str], top_k: int = 5
    ) -> list[NarrativeResult]:
        """Get the top-k trending narratives from the text corpus."""
        results = self.detect(texts)
        return results[:top_k]

    def _extract_tokens(self, docs: list[str], narrative: str) -> list[str]:
        """Extract cryptocurrency token symbols mentioned alongside narrative keywords."""
        # Common token symbol pattern: $SYMBOL or uppercase 2-5 letter words
        token_pattern = re.compile(r"\$([A-Z]{2,10})\b|(?<!\w)([A-Z]{2,5})(?!\w)")
        token_counts: Counter[str] = Counter()

        narrative_kws = self.keywords.get(narrative, [])
        for doc in docs:
            # Only count tokens in docs that contain narrative keywords
            has_narrative = any(kw in doc for kw in narrative_kws)
            if not has_narrative:
                continue
            matches = token_pattern.findall(doc.upper())
            for match in matches:
                symbol = match[0] or match[1]
                # Filter common English words that look like tickers
                if symbol not in {
                    "THE",
                    "AND",
                    "FOR",
                    "WITH",
                    "FROM",
                    "THIS",
                    "THAT",
                    "HAS",
                    "ARE",
                    "WAS",
                    "NOT",
                    "BUT",
                    "ALL",
                    "CAN",
                    "HAD",
                    "HER",
                    "ONE",
                    "OUR",
                    "OUT",
                    "NEW",
                }:
                    token_counts[symbol] += 1

        return [t for t, _ in token_counts.most_common(10)]

    def _estimate_trend(self, docs: list[str], keywords: list[str]) -> str:
        """Estimate whether a narrative is emerging, peaking, or fading.

        Splits the document corpus into thirds (chronological order assumed)
        and compares keyword density across segments.
        """
        if len(docs) < 3:
            return "emerging"

        third = max(1, len(docs) // 3)
        early = docs[:third]
        middle = docs[third : 2 * third]
        late = docs[2 * third :]

        def count_mentions(segment: list[str]) -> int:
            return sum(
                doc.count(kw) for doc in segment for kw in keywords
            )

        early_count = count_mentions(early)
        middle_count = count_mentions(middle)
        late_count = count_mentions(late)

        # Normalize by segment size
        early_density = early_count / max(1, len(early))
        middle_density = middle_count / max(1, len(middle))
        late_density = late_count / max(1, len(late))

        if late_density > middle_density * 1.2 and late_density > early_density:
            return "emerging"
        if middle_density >= early_density and middle_density >= late_density:
            return "peaking"
        return "fading"
