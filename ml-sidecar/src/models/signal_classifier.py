"""Random Forest signal classifier.

Input: AgentSignals + derived features → buy/sell/hold classification.
Labels derived from outcome: did price go up/down in next N hours?
Replaces hardcoded thresholds in strategies.
"""

import os
from pathlib import Path

import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

# Feature keys matching FeatureVector from Node.js side
FEATURE_KEYS = [
    "rsi", "macdHistogram", "bollingerPercentB", "ema12", "ema26",
    "atr", "obv", "fundingRate", "fearGreed", "priceChange24h",
    "rsiSlope", "volumeRatio", "emaCrossoverPct", "atrPct",
]


class SignalClassifier:
    def __init__(self):
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None

    def load(self):
        """Load trained Random Forest model or use heuristic."""
        model_path = MODEL_DIR / "signal_classifier.joblib"
        if model_path.exists():
            try:
                import joblib
                self.model = joblib.load(model_path)
                self.is_loaded = True
                self.last_trained = str(model_path.stat().st_mtime)
            except Exception:
                self._init_heuristic()
        else:
            self._init_heuristic()

    def _init_heuristic(self):
        self.is_loaded = True
        self.version = "0.1.0-heuristic"

    def predict(self, features: dict) -> dict:
        """Classify signals into buy/sell/hold.

        Returns:
            dict with keys: direction, probability, model
        """
        if self.model is not None:
            return self._predict_model(features)
        return self._predict_heuristic(features)

    def _predict_model(self, features: dict) -> dict:
        """Run inference through trained Random Forest."""
        X = np.array([[features.get(k, 0) for k in FEATURE_KEYS]])
        proba = self.model.predict_proba(X)[0]
        classes = self.model.classes_
        idx = int(np.argmax(proba))
        direction_map = {"buy": "up", "sell": "down", "hold": "sideways"}
        direction = direction_map.get(classes[idx], "sideways")
        return {
            "direction": direction,
            "probability": float(proba[idx]),
            "model": f"signal-classifier-{self.version}",
        }

    def _predict_heuristic(self, features: dict) -> dict:
        """Rule-based classification until model is trained."""
        rsi = features.get("rsi", 50)
        macd = features.get("macdHistogram", 0)
        bb_pct = features.get("bollingerPercentB", 0.5)
        funding = features.get("fundingRate", 0)
        fg = features.get("fearGreed", 50)
        rsi_slope = features.get("rsiSlope", 0)
        vol_ratio = features.get("volumeRatio", 1)
        ema_cross = features.get("emaCrossoverPct", 0)

        score = 0.0

        # RSI signal
        if rsi < 30:
            score += 30
        elif rsi < 40:
            score += 15
        elif rsi > 70:
            score -= 30
        elif rsi > 60:
            score -= 15

        # MACD
        if macd > 0:
            score += 20
        else:
            score -= 20

        # Bollinger Bands
        if bb_pct < 0.2:
            score += 15
        elif bb_pct > 0.8:
            score -= 15

        # Funding rate (contrarian)
        if funding > 0.0005:
            score -= 10
        elif funding < -0.0003:
            score += 10

        # Fear & Greed (contrarian at extremes)
        if fg < 20:
            score += 10
        elif fg > 80:
            score -= 10

        # Momentum signals
        score += rsi_slope * 2
        if vol_ratio > 2:
            score += 10 if score > 0 else -10
        score += ema_cross * 5

        probability = min(0.95, max(0.3, 0.5 + abs(score) / 200))

        if score > 15:
            return {"direction": "up", "probability": probability, "model": "rf-heuristic"}
        elif score < -15:
            return {"direction": "down", "probability": probability, "model": "rf-heuristic"}
        return {"direction": "sideways", "probability": probability, "model": "rf-heuristic"}
