"""TA Interpreter — Random Forest classifier for technical signal interpretation."""

import os
from pathlib import Path

import joblib
import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


class TAInterpreter:
    """Interprets technical indicators into actionable signals with learned weights."""

    FEATURE_KEYS = [
        "rsi",
        "macd_histogram",
        "macd_line",
        "macd_signal",
        "bb_percent_b",
        "bb_bandwidth",
        "ema12",
        "ema26",
        "ema_cross_pct",
        "atr",
        "atr_pct",
        "obv",
        "price_change",
    ]

    SIGNAL_NAMES = ["RSI", "MACD", "Bollinger Bands", "EMA Crossover", "ATR", "OBV"]

    DEFAULT_WEIGHTS = {
        "RSI": 20,
        "MACD": 20,
        "Bollinger Bands": 15,
        "EMA Crossover": 20,
        "ATR": 10,
        "OBV": 15,
    }

    def __init__(self) -> None:
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None

    def load(self) -> None:
        model_path = MODEL_DIR / "ta_interpreter.joblib"
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

        # Get probabilities for composite direction
        proba = self.model.predict_proba(x)[0]
        classes = list(self.model.classes_)

        # Build weights from feature importances
        weights = dict(self.DEFAULT_WEIGHTS)
        if hasattr(self.model, "feature_importances_"):
            imp = self.model.feature_importances_
            # Map feature importances to signal groups
            signal_imp = {
                "RSI": float(imp[0]) if len(imp) > 0 else 0.2,
                "MACD": float(np.mean(imp[1:4])) if len(imp) > 3 else 0.2,
                "Bollinger Bands": float(np.mean(imp[4:6])) if len(imp) > 5 else 0.15,
                "EMA Crossover": float(np.mean(imp[6:9])) if len(imp) > 8 else 0.2,
                "ATR": float(np.mean(imp[9:11])) if len(imp) > 10 else 0.1,
                "OBV": float(imp[11]) if len(imp) > 11 else 0.15,
            }
            total = sum(signal_imp.values()) or 1
            weights = {k: round(v / total * 100, 1) for k, v in signal_imp.items()}

        # Generate signals from heuristic (structure), but use ML weights/composite
        signals = self._interpret_signals(features)

        # Composite from ML
        pred_idx = int(np.argmax(proba))
        direction = classes[pred_idx] if pred_idx < len(classes) else "neutral"
        confidence = float(proba[pred_idx]) * 100

        # Score: positive = bullish, negative = bearish
        bull_prob = proba[classes.index("bullish")] if "bullish" in classes else 0
        bear_prob = proba[classes.index("bearish")] if "bearish" in classes else 0
        score = (bull_prob - bear_prob) * 100

        return {
            "signals": signals,
            "weights": weights,
            "composite": {
                "direction": direction,
                "score": round(score, 2),
                "confidence": round(min(100, confidence), 2),
            },
            "model": "rf-ta-interpreter",
        }

    def _predict_heuristic(self, features: dict) -> dict:
        signals = self._interpret_signals(features)
        weights = dict(self.DEFAULT_WEIGHTS)

        # Composite: weighted average of signal strengths
        total_weight = 0
        weighted_score = 0
        for sig in signals:
            w = weights.get(sig["name"], 10)
            total_weight += w
            dir_score = (
                sig["strength"]
                if sig["direction"] == "bullish"
                else -sig["strength"]
                if sig["direction"] == "bearish"
                else 0
            )
            weighted_score += dir_score * w

        score = weighted_score / total_weight if total_weight > 0 else 0
        direction = "bullish" if score > 15 else "bearish" if score < -15 else "neutral"

        # Confidence from signal agreement
        bull_count = sum(1 for s in signals if s["direction"] == "bullish")
        bear_count = sum(1 for s in signals if s["direction"] == "bearish")
        total_dir = bull_count + bear_count
        agreement = max(bull_count, bear_count) / total_dir if total_dir > 0 else 0
        confidence = agreement * 100 * (len(signals) / 6)

        return {
            "signals": signals,
            "weights": {k: float(v) for k, v in weights.items()},
            "composite": {
                "direction": direction,
                "score": round(score, 2),
                "confidence": round(min(100, confidence), 2),
            },
            "model": "heuristic-ta-interpreter",
        }

    def _interpret_signals(self, features: dict) -> list[dict]:
        signals = []

        # RSI
        rsi = features.get("rsi", 50)
        if rsi > 70:
            signals.append(
                {
                    "name": "RSI",
                    "direction": "bearish",
                    "strength": min(100, 50 + (rsi - 70) * 1.5),
                    "description": f"RSI {rsi:.1f} — overbought territory",
                }
            )
        elif rsi < 30:
            signals.append(
                {
                    "name": "RSI",
                    "direction": "bullish",
                    "strength": min(100, 50 + (30 - rsi) * 1.5),
                    "description": f"RSI {rsi:.1f} — oversold territory",
                }
            )
        else:
            direction = (
                "bullish" if rsi > 60 else "bearish" if rsi < 40 else "neutral"
            )
            strength = 40 + abs(rsi - 50) if direction != "neutral" else 30
            signals.append(
                {
                    "name": "RSI",
                    "direction": direction,
                    "strength": strength,
                    "description": f"RSI {rsi:.1f} — {'bullish' if rsi > 60 else 'bearish' if rsi < 40 else 'neutral'} zone",
                }
            )

        # MACD
        histogram = features.get("macd_histogram", 0)
        if histogram > 0:
            signals.append(
                {
                    "name": "MACD",
                    "direction": "bullish",
                    "strength": min(90, 50 + abs(histogram) * 100),
                    "description": f"MACD histogram positive ({histogram:.4f}) — bullish momentum",
                }
            )
        elif histogram < 0:
            signals.append(
                {
                    "name": "MACD",
                    "direction": "bearish",
                    "strength": min(90, 50 + abs(histogram) * 100),
                    "description": f"MACD histogram negative ({histogram:.4f}) — bearish momentum",
                }
            )
        else:
            signals.append(
                {
                    "name": "MACD",
                    "direction": "neutral",
                    "strength": 30,
                    "description": "MACD at signal line — no clear direction",
                }
            )

        # Bollinger Bands
        pct_b = features.get("bb_percent_b", 0.5)
        if pct_b > 0.8:
            signals.append(
                {
                    "name": "Bollinger Bands",
                    "direction": "bearish",
                    "strength": 55,
                    "description": f"Price near upper band (%B: {pct_b:.2f}) — potential pullback",
                }
            )
        elif pct_b < 0.2:
            signals.append(
                {
                    "name": "Bollinger Bands",
                    "direction": "bullish",
                    "strength": 55,
                    "description": f"Price near lower band (%B: {pct_b:.2f}) — potential bounce",
                }
            )
        else:
            signals.append(
                {
                    "name": "Bollinger Bands",
                    "direction": "neutral",
                    "strength": 30,
                    "description": f"Price within bands (%B: {pct_b:.2f})",
                }
            )

        # EMA Crossover
        ema_cross = features.get("ema_cross_pct", 0)
        if ema_cross > 0:
            signals.append(
                {
                    "name": "EMA Crossover",
                    "direction": "bullish",
                    "strength": min(90, 50 + abs(ema_cross) * 10),
                    "description": f"EMA(12) above EMA(26) by {ema_cross:.2f}% — bullish trend",
                }
            )
        elif ema_cross < 0:
            signals.append(
                {
                    "name": "EMA Crossover",
                    "direction": "bearish",
                    "strength": min(90, 50 + abs(ema_cross) * 10),
                    "description": f"EMA(12) below EMA(26) by {abs(ema_cross):.2f}% — bearish trend",
                }
            )
        else:
            signals.append(
                {
                    "name": "EMA Crossover",
                    "direction": "neutral",
                    "strength": 30,
                    "description": "EMA(12) = EMA(26) — no trend",
                }
            )

        # ATR
        atr_pct = features.get("atr_pct", 0)
        if atr_pct > 5:
            desc = f"ATR {atr_pct:.2f}% — high volatility"
        elif atr_pct > 2:
            desc = f"ATR {atr_pct:.2f}% — moderate volatility"
        else:
            desc = f"ATR {atr_pct:.2f}% — low volatility"
        signals.append(
            {"name": "ATR", "direction": "neutral", "strength": 40, "description": desc}
        )

        # OBV
        obv = features.get("obv", 0)
        price_change = features.get("price_change", 0)
        if obv > 0 and price_change > 0:
            signals.append(
                {
                    "name": "OBV",
                    "direction": "bullish",
                    "strength": 65,
                    "description": "OBV positive with rising price — confirmed uptrend",
                }
            )
        elif obv > 0 and price_change <= 0:
            signals.append(
                {
                    "name": "OBV",
                    "direction": "bullish",
                    "strength": 70,
                    "description": "OBV positive but price flat/down — accumulation",
                }
            )
        elif obv < 0 and price_change < 0:
            signals.append(
                {
                    "name": "OBV",
                    "direction": "bearish",
                    "strength": 65,
                    "description": "OBV negative with falling price — confirmed downtrend",
                }
            )
        elif obv < 0 and price_change >= 0:
            signals.append(
                {
                    "name": "OBV",
                    "direction": "bearish",
                    "strength": 70,
                    "description": "OBV negative but price flat/up — distribution",
                }
            )
        else:
            signals.append(
                {
                    "name": "OBV",
                    "direction": "neutral",
                    "strength": 30,
                    "description": "OBV neutral",
                }
            )

        return signals
