"""Strategy Bandit — Contextual bandit for trading action selection."""

import os
from pathlib import Path

import joblib
import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


class StrategyBandit:
    """Selects buy/sell/hold actions using contextual bandit or heuristic fallback."""

    FEATURE_KEYS = [
        "rsi",
        "macd_histogram",
        "ema12",
        "ema26",
        "bollinger_pct_b",
        "atr",
        "obv",
        "funding_rate",
        "fear_greed",
        "price_change_24h",
        "price",
        "regime",
    ]

    REGIME_MAP = {
        "trending_bull": 1.0,
        "trending_bear": -1.0,
        "ranging": 0.0,
        "volatile": 0.5,
        "capitulation": -2.0,
    }

    def __init__(self) -> None:
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None
        self.epsilon = 0.1

    def load(self) -> None:
        model_path = MODEL_DIR / "strategy_bandit.joblib"
        try:
            data = joblib.load(model_path)
            self.model = data["model"]
            self.epsilon = data.get("epsilon", 0.1)
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
        # Encode regime as numeric
        regime_val = self.REGIME_MAP.get(str(features.get("regime", "ranging")), 0.0)
        x_raw = []
        for k in self.FEATURE_KEYS:
            if k == "regime":
                x_raw.append(regime_val)
            else:
                x_raw.append(features.get(k, 0))

        x = np.array([x_raw])

        # Model predicts action probabilities
        proba = self.model.predict_proba(x)[0]
        classes = list(self.model.classes_)

        pred_idx = int(np.argmax(proba))
        action = classes[pred_idx] if pred_idx < len(classes) else "hold"
        confidence = float(proba[pred_idx]) * 100

        # Position size based on confidence
        position_size_pct = min(25, confidence * 0.25)

        reasoning = [
            f"ML bandit: {action} with {confidence:.0f}% confidence",
        ]

        return {
            "action": action,
            "confidence": round(min(100, confidence), 2),
            "position_size_pct": round(position_size_pct, 2),
            "reasoning": reasoning,
            "model": "contextual-bandit",
        }

    def _predict_heuristic(self, features: dict) -> dict:
        reasoning = []
        score = 0

        rsi = features.get("rsi", 50)
        macd_hist = features.get("macd_histogram", 0)
        ema12 = features.get("ema12", 0)
        ema26 = features.get("ema26", 0)
        bb_pct_b = features.get("bollinger_pct_b", 0.5)
        funding = features.get("funding_rate", 0)
        fg = features.get("fear_greed", 50)
        pc24h = features.get("price_change_24h", 0)

        # RSI with adaptive thresholds
        if rsi < 25:
            score += 35
            reasoning.append(f"RSI deeply oversold ({rsi:.0f})")
        elif rsi < 35:
            score += 20
            reasoning.append(f"RSI oversold zone ({rsi:.0f})")
        elif rsi > 75:
            score -= 35
            reasoning.append(f"RSI deeply overbought ({rsi:.0f})")
        elif rsi > 65:
            score -= 20
            reasoning.append(f"RSI overbought zone ({rsi:.0f})")

        # MACD
        if macd_hist > 0:
            score += 15
            reasoning.append("MACD bullish momentum")
        elif macd_hist < 0:
            score -= 15
            reasoning.append("MACD bearish momentum")

        # EMA crossover
        if ema26 != 0:
            cross_pct = ((ema12 - ema26) / ema26) * 100
            if cross_pct > 0.5:
                score += 20
                reasoning.append(f"Golden cross (EMA gap {cross_pct:.2f}%)")
            elif cross_pct < -0.5:
                score -= 20
                reasoning.append(f"Death cross (EMA gap {cross_pct:.2f}%)")

        # Bollinger Bands
        if bb_pct_b < 0.1:
            score += 15
            reasoning.append("Price at lower Bollinger Band")
        elif bb_pct_b > 0.9:
            score -= 15
            reasoning.append("Price at upper Bollinger Band")

        # Funding rate (contrarian)
        if funding > 0.0005:
            score -= 10
            reasoning.append("High funding rate — overleveraged longs")
        elif funding < -0.0003:
            score += 10
            reasoning.append("Negative funding — capitulation signal")

        # Fear & Greed
        if fg < 20:
            score += 10
            reasoning.append("Extreme fear — contrarian bullish")
        elif fg > 80:
            score -= 10
            reasoning.append("Extreme greed — contrarian bearish")

        # 24h trend
        if pc24h > 5:
            score += 10
        elif pc24h < -5:
            score -= 10

        confidence = min(95, abs(score))
        position_size_pct = min(25, confidence * 0.25)

        if score > 20:
            action = "buy"
        elif score < -20:
            action = "sell"
        else:
            action = "hold"
            reasoning.append("Mixed signals — holding")

        return {
            "action": action,
            "confidence": round(confidence, 2),
            "position_size_pct": round(position_size_pct, 2),
            "reasoning": reasoning,
            "model": "heuristic-strategy-bandit",
        }
