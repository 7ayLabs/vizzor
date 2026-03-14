"""Trend Scorer — XGBoost regressor for market trend strength."""

import os
from pathlib import Path

import joblib
import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


class TrendScorer:
    """Predicts trend strength (0-100) and direction from market features."""

    FEATURE_KEYS = [
        "price_change_24h",
        "price_change_7d",
        "volume_24h",
        "market_cap",
        "volume_to_mcap_ratio",
        "rank",
    ]

    def __init__(self) -> None:
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None

    def load(self) -> None:
        model_path = MODEL_DIR / "trend_scorer.joblib"
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
        score = float(np.clip(self.model.predict(x)[0], 0, 100))

        # Feature importances
        importances = {}
        if hasattr(self.model, "feature_importances_"):
            for key, imp in zip(self.FEATURE_KEYS, self.model.feature_importances_):
                importances[key] = round(float(imp), 4)

        direction = "bullish" if score > 60 else "bearish" if score < 40 else "neutral"
        confidence = abs(score - 50) * 2  # 0-100 scale

        return {
            "score": round(score, 2),
            "direction": direction,
            "confidence": round(min(100, confidence), 2),
            "feature_importances": importances,
            "model": "xgboost-trend-scorer",
        }

    def _predict_heuristic(self, features: dict) -> dict:
        score = 50.0

        pc24h = features.get("price_change_24h", 0)
        pc7d = features.get("price_change_7d", 0)
        vol = features.get("volume_24h", 0)
        mcap = features.get("market_cap", 0)

        signals = []

        if pc24h > 5:
            score += 15
            signals.append(f"Strong 24h gain: +{pc24h:.2f}%")
        elif pc24h < -5:
            score -= 15
            signals.append(f"Significant 24h drop: {pc24h:.2f}%")

        if pc7d > 10:
            score += 20
            signals.append(f"Bullish weekly trend: +{pc7d:.2f}%")
        elif pc7d < -10:
            score -= 20
            signals.append(f"Bearish weekly trend: {pc7d:.2f}%")

        if mcap > 0 and vol > mcap * 0.1:
            score += 5
            signals.append("High volume relative to market cap")

        score = max(0, min(100, score))
        direction = "bullish" if score > 60 else "bearish" if score < 40 else "neutral"
        confidence = abs(score - 50) * 2

        return {
            "score": round(score, 2),
            "direction": direction,
            "confidence": round(min(100, confidence), 2),
            "feature_importances": {},
            "model": "heuristic-trend-scorer",
        }
