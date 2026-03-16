"""NLP sentiment analyzer for crypto news.

Input: news article text (headline + optional body)
Output: sentiment (bullish/bearish/neutral) + confidence + key_topics.

Uses DistilBERT fine-tuned on crypto domain when trained model available.
Heuristic fallback uses keyword-based sentiment scoring.
"""

import os
import re
from pathlib import Path

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

# Crypto-specific sentiment keywords
BULLISH_KEYWORDS = [
    "surge", "soar", "rally", "breakout", "bullish", "moon", "pump",
    "adoption", "partnership", "listing", "launch", "upgrade", "approval",
    "etf approved", "institutional", "accumulation", "inflow", "buy signal",
    "golden cross", "all-time high", "ath", "massive", "growth",
    "breakthrough", "milestone", "record", "explode", "skyrocket",
    "optimistic", "recovery", "rebound", "flip", "outperform",
]

BEARISH_KEYWORDS = [
    "crash", "dump", "plunge", "bearish", "collapse", "sell-off",
    "hack", "exploit", "rug", "scam", "fraud", "lawsuit", "sec",
    "regulation", "ban", "restriction", "investigation", "fud",
    "death cross", "capitulation", "outflow", "liquidation", "bankrupt",
    "insolvency", "ponzi", "warning", "risk", "vulnerable", "breach",
    "shutdown", "delisted", "reject", "decline", "drop", "fear",
    "whale dump", "exit scam", "money laundering",
]

NEUTRAL_MODIFIERS = [
    "might", "could", "may", "uncertain", "mixed", "sideways",
    "consolidation", "range-bound", "flat", "stable",
]


class SentimentAnalyzer:
    def __init__(self):
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None
        self.tokenizer = None

    def load(self):
        """Load trained DistilBERT or use keyword heuristic."""
        model_path = MODEL_DIR / "sentiment_model"
        if model_path.exists():
            try:
                from transformers import AutoModelForSequenceClassification, AutoTokenizer

                self.tokenizer = AutoTokenizer.from_pretrained(str(model_path))
                self.model = AutoModelForSequenceClassification.from_pretrained(str(model_path))
                self.is_loaded = True
                self.last_trained = str(model_path.stat().st_mtime)
            except Exception:
                self._init_heuristic()
        else:
            self._init_heuristic()

    def _init_heuristic(self):
        self.is_loaded = True
        self.version = "0.1.0-heuristic"

    def analyze(self, text: str) -> dict:
        """Analyze sentiment of text.

        Returns:
            dict with: sentiment, confidence, score, key_topics, model
        """
        if self.model is not None and self.tokenizer is not None:
            return self._analyze_model(text)
        return self._analyze_heuristic(text)

    def analyze_batch(self, texts: list[str]) -> list[dict]:
        """Analyze sentiment for multiple texts."""
        return [self.analyze(t) for t in texts]

    def _analyze_model(self, text: str) -> dict:
        """Run inference through trained DistilBERT."""
        import torch

        inputs = self.tokenizer(
            text, return_tensors="pt", truncation=True, max_length=256, padding=True
        )

        with torch.no_grad():
            outputs = self.model(**inputs)
            probs = torch.softmax(outputs.logits, dim=-1).squeeze().numpy()

        # Classes: bearish=0, neutral=1, bullish=2
        labels = ["bearish", "neutral", "bullish"]
        idx = int(probs.argmax())
        sentiment = labels[idx]
        confidence = float(probs[idx])

        # Score: -1 (bearish) to +1 (bullish)
        score = float(probs[2] - probs[0])

        return {
            "sentiment": sentiment,
            "confidence": round(confidence, 3),
            "score": round(score, 4),
            "key_topics": self._extract_topics(text),
            "model": f"sentiment-nlp-{self.version}",
        }

    def _analyze_heuristic(self, text: str) -> dict:
        """Keyword-based sentiment analysis."""
        text_lower = text.lower()
        words = set(re.findall(r'\b\w+\b', text_lower))

        bullish_score = 0.0
        bearish_score = 0.0
        matched_bull = []
        matched_bear = []

        for keyword in BULLISH_KEYWORDS:
            if keyword in text_lower:
                weight = 1.5 if len(keyword.split()) > 1 else 1.0
                bullish_score += weight
                matched_bull.append(keyword)

        for keyword in BEARISH_KEYWORDS:
            if keyword in text_lower:
                weight = 1.5 if len(keyword.split()) > 1 else 1.0
                bearish_score += weight
                matched_bear.append(keyword)

        # Negation handling
        negation_patterns = [
            r"not\s+\w+",
            r"no\s+\w+",
            r"never\s+\w+",
            r"without\s+\w+",
            r"fail(ed|s)?\s+to",
        ]
        negation_count = sum(
            len(re.findall(pattern, text_lower))
            for pattern in negation_patterns
        )
        if negation_count > 0:
            bullish_score, bearish_score = bearish_score * 0.5, bullish_score * 0.5

        # Neutral modifiers reduce confidence
        neutral_count = sum(1 for m in NEUTRAL_MODIFIERS if m in words)
        uncertainty_factor = max(0.5, 1.0 - neutral_count * 0.15)

        total = bullish_score + bearish_score
        if total == 0:
            return {
                "sentiment": "neutral",
                "confidence": 0.5,
                "score": 0.0,
                "key_topics": self._extract_topics(text),
                "model": "sentiment-heuristic",
            }

        net_score = (bullish_score - bearish_score) / max(total, 1)
        confidence = min(0.95, (total / 5.0) * uncertainty_factor)

        if net_score > 0.2:
            sentiment = "bullish"
        elif net_score < -0.2:
            sentiment = "bearish"
        else:
            sentiment = "neutral"

        return {
            "sentiment": sentiment,
            "confidence": round(confidence, 3),
            "score": round(net_score, 4),
            "key_topics": self._extract_topics(text),
            "model": "sentiment-heuristic",
        }

    @staticmethod
    def _extract_topics(text: str) -> list[str]:
        """Extract crypto-relevant topics from text."""
        topics = []
        text_lower = text.lower()

        topic_patterns = {
            "regulation": ["sec", "regulation", "ban", "lawsuit", "compliance", "legal"],
            "defi": ["defi", "dex", "lending", "yield", "liquidity", "amm", "tvl"],
            "nft": ["nft", "opensea", "collectible", "pfp", "mint"],
            "layer2": ["l2", "layer 2", "rollup", "zk-", "optimistic", "arbitrum", "base"],
            "bitcoin": ["bitcoin", "btc", "halving", "miner", "satoshi"],
            "ethereum": ["ethereum", "eth", "merge", "staking", "beacon"],
            "ai": ["ai", "artificial intelligence", "machine learning", "gpt", "llm"],
            "gaming": ["gaming", "gamefi", "metaverse", "play-to-earn", "p2e"],
            "security": ["hack", "exploit", "breach", "vulnerability", "audit"],
            "exchange": ["exchange", "listing", "binance", "coinbase", "trading"],
            "macro": ["fed", "interest rate", "inflation", "recession", "gdp"],
            "meme": ["meme", "doge", "shib", "pepe", "pump.fun"],
        }

        for topic, keywords in topic_patterns.items():
            if any(kw in text_lower for kw in keywords):
                topics.append(topic)

        return topics[:5]
