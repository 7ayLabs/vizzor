"""Regime Detector — Hidden Markov Model for market regime classification."""

import os
from pathlib import Path

import joblib
import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

REGIMES = ["trending_bull", "trending_bear", "ranging", "volatile", "capitulation"]


class RegimeDetector:
    """Detects the current market regime using HMM or heuristic fallback."""

    FEATURE_KEYS = [
        "returns_1d",
        "returns_7d",
        "volatility_14d",
        "volume_ratio",
        "rsi",
        "bb_width",
        "fear_greed",
        "funding_rate",
        "price_vs_sma200",
    ]

    def __init__(self) -> None:
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None

    def load(self) -> None:
        model_path = MODEL_DIR / "regime_detector.joblib"
        try:
            data = joblib.load(model_path)
            self.model = data["model"]
            self.last_trained = data.get("trained_at")
            self.accuracy = data.get("accuracy")
            self.is_loaded = True
        except Exception:
            self.model = None
            self.is_loaded = True  # heuristic fallback ready

    def predict(self, features: dict) -> dict:
        if self.model is not None:
            return self._predict_model(features)
        return self._predict_heuristic(features)

    def _predict_model(self, features: dict) -> dict:
        x = np.array([[features.get(k, 0) for k in self.FEATURE_KEYS]])

        # HMM predict returns state index
        state = int(self.model.predict(x)[0])
        regime = REGIMES[state] if state < len(REGIMES) else "ranging"

        # State probabilities
        log_prob = self.model.score(x)
        # Approximate probabilities using posterior
        try:
            posteriors = self.model.predict_proba(x)[0]
            probabilities = {}
            for i, r in enumerate(REGIMES):
                probabilities[r] = round(float(posteriors[i]), 4) if i < len(posteriors) else 0.0
        except Exception:
            probabilities = {r: (0.8 if r == regime else 0.05) for r in REGIMES}

        confidence = probabilities.get(regime, 0.5) * 100

        return {
            "regime": regime,
            "confidence": round(min(100, confidence), 2),
            "probabilities": probabilities,
            "model": "hmm-regime-detector",
        }

    def _predict_heuristic(self, features: dict) -> dict:
        vol = features.get("volatility_14d", 3)
        ret7d = features.get("returns_7d", 0)
        fg = features.get("fear_greed", 50)
        rsi = features.get("rsi", 50)

        # Classification rules
        if fg < 15 and ret7d < -20:
            regime = "capitulation"
            confidence = 80
        elif vol > 8:
            regime = "volatile"
            confidence = 70
        elif vol > 5 and ret7d > 10:
            regime = "trending_bull"
            confidence = 65
        elif vol > 5 and ret7d < -10:
            regime = "trending_bear"
            confidence = 65
        elif ret7d > 5 and rsi > 55:
            regime = "trending_bull"
            confidence = 55
        elif ret7d < -5 and rsi < 45:
            regime = "trending_bear"
            confidence = 55
        else:
            regime = "ranging"
            confidence = 60

        # Build approximate probabilities
        probabilities = {r: 0.05 for r in REGIMES}
        probabilities[regime] = confidence / 100

        # Distribute remaining probability
        remaining = 1.0 - probabilities[regime]
        others = [r for r in REGIMES if r != regime]
        for r in others:
            probabilities[r] = round(remaining / len(others), 4)

        return {
            "regime": regime,
            "confidence": round(confidence, 2),
            "probabilities": probabilities,
            "model": "heuristic-regime-detector",
        }
