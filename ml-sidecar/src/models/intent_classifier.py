"""Intent Classifier — DistilBERT for user message intent classification."""

import os
import re
from pathlib import Path

import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

INTENTS = [
    "price_query",
    "trending",
    "news",
    "raises",
    "pump_meme",
    "analysis",
    "prediction",
    "broad_overview",
    "agent_command",
    "general",
]


class IntentClassifier:
    """Classifies user message intent using fine-tuned DistilBERT or keyword heuristic."""

    # Keyword arrays matching the TypeScript context-injector
    PRICE_KEYWORDS = ["price", "worth", "cost", "value", "how much"]
    TRENDING_KEYWORDS = ["trending", "hot", "popular", "top", "best", "hype"]
    NEWS_KEYWORDS = ["news", "latest", "update", "happening", "announcement"]
    RAISES_KEYWORDS = [
        "ico", "ido", "launch", "raise", "funding", "fundrais", "invest", "new project"
    ]
    PUMP_KEYWORDS = ["pump", "meme", "solana launch", "pump.fun", "degen"]
    ANALYSIS_KEYWORDS = [
        "anali", "audit", "scan", "tokenomics", "rug", "security", "forensic",
        "contract", "check", "review", "inspect", "investigate", "deep dive",
        "full report", "due diligence"
    ]
    PREDICTION_KEYWORDS = [
        "predict", "prediction", "forecast", "will it", "going to",
        "should i buy", "should i sell", "compare", "vs", "versus",
        "portfolio", "allocat", "diversif", "strategy", "risk", "hedge",
        "long term", "short term", "entry", "exit", "target"
    ]
    BROAD_KEYWORDS = [
        "what's happening", "whats happening", "market", "overview", "summary",
        "up to date", "current", "right now", "today", "lately", "recently",
        "this week", "this month", "general", "everything", "outlook",
        "sentiment", "macro", "state of", "tell me about crypto", "crypto market"
    ]
    AGENT_KEYWORDS = [
        "agent", "bot", "create agent", "start agent", "stop agent",
        "list agent", "trading bot"
    ]

    # Common crypto token/address patterns
    TOKEN_PATTERN = re.compile(r"\b(?:0x[a-fA-F0-9]{40}|[A-Z]{2,10}(?:USDT)?)\b")
    ADDRESS_PATTERN = re.compile(r"0x[a-fA-F0-9]{40}")

    def __init__(self) -> None:
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None
        self.tokenizer = None

    def load(self) -> None:
        model_path = MODEL_DIR / "intent_model"
        try:
            from transformers import AutoTokenizer, AutoModelForSequenceClassification
            self.tokenizer = AutoTokenizer.from_pretrained(str(model_path))
            self.model = AutoModelForSequenceClassification.from_pretrained(str(model_path))
            self.last_trained = None
            self.accuracy = None
            self.is_loaded = True
        except Exception:
            self.model = None
            self.tokenizer = None
            self.is_loaded = True  # heuristic fallback

    def classify(self, text: str) -> dict:
        if self.model is not None and self.tokenizer is not None:
            return self._classify_model(text)
        return self._classify_heuristic(text)

    def _classify_model(self, text: str) -> dict:
        import torch

        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=128)
        with torch.no_grad():
            logits = self.model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0].numpy()

        top_idx = int(np.argmax(probs))
        intent = INTENTS[top_idx] if top_idx < len(INTENTS) else "general"
        confidence = float(probs[top_idx])

        # Secondary intent
        probs_copy = probs.copy()
        probs_copy[top_idx] = 0
        second_idx = int(np.argmax(probs_copy))
        secondary = INTENTS[second_idx] if probs_copy[second_idx] > 0.15 else None

        tokens, addresses = self._extract_entities(text)

        return {
            "intent": intent,
            "confidence": round(confidence, 4),
            "secondary_intent": secondary,
            "detected_tokens": tokens,
            "detected_addresses": addresses,
            "model": "distilbert-intent",
        }

    def _classify_heuristic(self, text: str) -> dict:
        lower = text.lower()

        scores: dict[str, float] = {intent: 0 for intent in INTENTS}

        # Match keywords
        if self._matches_any(lower, self.PRICE_KEYWORDS):
            scores["price_query"] += 1.0
        if self._matches_any(lower, self.TRENDING_KEYWORDS):
            scores["trending"] += 1.0
        if self._matches_any(lower, self.NEWS_KEYWORDS):
            scores["news"] += 1.0
        if self._matches_any(lower, self.RAISES_KEYWORDS):
            scores["raises"] += 1.0
        if self._matches_any(lower, self.PUMP_KEYWORDS):
            scores["pump_meme"] += 1.0
        if self._matches_any(lower, self.ANALYSIS_KEYWORDS):
            scores["analysis"] += 1.0
        if self._matches_any(lower, self.PREDICTION_KEYWORDS):
            scores["prediction"] += 1.0
        if self._matches_any(lower, self.BROAD_KEYWORDS):
            scores["broad_overview"] += 1.0
        if self._matches_any(lower, self.AGENT_KEYWORDS):
            scores["agent_command"] += 1.0

        # Find top and secondary
        sorted_intents = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_intent = sorted_intents[0][0]
        top_score = sorted_intents[0][1]

        if top_score == 0:
            top_intent = "general"
            confidence = 0.5
        else:
            total = sum(s for _, s in sorted_intents if s > 0)
            confidence = top_score / total if total > 0 else 0.5

        secondary = None
        if len(sorted_intents) > 1 and sorted_intents[1][1] > 0:
            secondary = sorted_intents[1][0]

        tokens, addresses = self._extract_entities(text)

        return {
            "intent": top_intent,
            "confidence": round(min(0.95, confidence), 4),
            "secondary_intent": secondary,
            "detected_tokens": tokens,
            "detected_addresses": addresses,
            "model": "keyword-intent",
        }

    @staticmethod
    def _matches_any(text: str, keywords: list[str]) -> bool:
        return any(kw in text for kw in keywords)

    def _extract_entities(self, text: str) -> tuple[list[str], list[str]]:
        addresses = self.ADDRESS_PATTERN.findall(text)

        # Extract potential token symbols (uppercase 2-10 chars)
        tokens = []
        for word in text.split():
            clean = word.strip(",.!?()[]{}:;\"'")
            if (
                clean.isupper()
                and 2 <= len(clean) <= 10
                and clean.isalpha()
                and clean not in ("THE", "AND", "FOR", "BUT", "NOT", "ARE", "WAS", "HAS")
            ):
                tokens.append(clean)

        return list(set(tokens))[:5], list(set(addresses))[:3]
