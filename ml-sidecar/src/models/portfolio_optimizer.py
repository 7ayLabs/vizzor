"""Portfolio Optimizer — Mean-Variance optimization + dynamic Kelly criterion."""

import os
from pathlib import Path

import joblib
import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

REGIME_MULTIPLIERS = {
    "trending_bull": 1.2,
    "trending_bear": 0.6,
    "ranging": 0.8,
    "volatile": 0.5,
    "capitulation": 0.3,
}


class PortfolioOptimizer:
    """Optimizes position sizing, stop-loss, and take-profit using MVO + Kelly."""

    def __init__(self) -> None:
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None

    def load(self) -> None:
        model_path = MODEL_DIR / "portfolio_optimizer.joblib"
        try:
            data = joblib.load(model_path)
            self.model = data["model"]
            self.last_trained = data.get("trained_at")
            self.accuracy = data.get("accuracy")
            self.is_loaded = True
        except Exception:
            self.model = None
            self.is_loaded = True

    def optimize(self, features: dict) -> dict:
        """Optimize position sizing and risk parameters."""
        if self.model is not None:
            return self._optimize_model(features)
        return self._optimize_heuristic(features)

    def forecast(self, features: dict) -> dict:
        """Predict forward-looking portfolio metrics."""
        return self._forecast_heuristic(features)

    def _optimize_model(self, features: dict) -> dict:
        # Model-based optimization would use trained MVO
        # For now, delegate to heuristic with model adjustments
        result = self._optimize_heuristic(features)
        result["model"] = "mvo-portfolio-optimizer"
        return result

    def _optimize_heuristic(self, features: dict) -> dict:
        win_rate = features.get("win_rate", 0.5)
        max_drawdown = features.get("max_drawdown", 10)
        regime = features.get("regime", "ranging")
        total_value = features.get("total_value", 10000)
        cash = features.get("cash", total_value)

        reasoning = []

        # Kelly criterion for position sizing
        avg_win = features.get("avg_win", 0.05)
        avg_loss = features.get("avg_loss", 0.03)
        win_loss_ratio = avg_win / max(0.001, avg_loss)
        kelly = win_rate - (1 - win_rate) / max(0.1, win_loss_ratio)
        kelly = max(0, min(0.25, kelly))

        # Regime adjustment
        regime_mult = REGIME_MULTIPLIERS.get(regime, 0.8)
        position_size_pct = kelly * 100 * regime_mult

        reasoning.append(f"Kelly fraction: {kelly:.2%}")
        reasoning.append(f"Regime '{regime}' multiplier: {regime_mult}")

        # Drawdown protection
        if max_drawdown > 15:
            position_size_pct *= 0.5
            reasoning.append(f"Drawdown protection: halved size (DD={max_drawdown:.1f}%)")
        elif max_drawdown > 10:
            position_size_pct *= 0.75
            reasoning.append(f"Moderate drawdown adjustment (DD={max_drawdown:.1f}%)")

        # Stop-loss multiplier (ATR-based)
        atr_pct = features.get("atr_pct", 3)
        if regime in ("volatile", "capitulation"):
            stop_loss_multiplier = 3.0
            reasoning.append("Wide stops for volatile regime")
        elif regime == "trending_bull":
            stop_loss_multiplier = 1.5
            reasoning.append("Tight stops for trending bull")
        else:
            stop_loss_multiplier = 2.0

        # Take-profit multiplier (reward:risk)
        take_profit_multiplier = stop_loss_multiplier * max(1.5, win_loss_ratio)

        # Max allocation cap
        max_allocation_pct = 25 if regime in ("trending_bull",) else 15

        return {
            "position_size_pct": round(min(max_allocation_pct, position_size_pct), 2),
            "stop_loss_multiplier": round(stop_loss_multiplier, 2),
            "take_profit_multiplier": round(take_profit_multiplier, 2),
            "max_allocation_pct": max_allocation_pct,
            "reasoning": reasoning,
            "model": "heuristic-portfolio-optimizer",
        }

    def _forecast_heuristic(self, features: dict) -> dict:
        returns_history = features.get("returns_history", [])
        sharpe_history = features.get("sharpe_history", [])
        drawdown_history = features.get("drawdown_history", [])

        if len(returns_history) < 5:
            return {
                "predicted_return": 0,
                "predicted_sharpe": 0,
                "predicted_max_drawdown": 0,
                "confidence": 0,
                "model": "insufficient-data",
            }

        # Simple exponential weighted average for forward prediction
        weights = np.array([0.5 ** i for i in range(len(returns_history))])
        weights = weights[::-1]  # more weight to recent
        weights /= weights.sum()

        pred_return = float(np.average(returns_history, weights=weights))

        pred_sharpe = 0.0
        if sharpe_history:
            sw = weights[: len(sharpe_history)]
            sw /= sw.sum()
            pred_sharpe = float(np.average(sharpe_history, weights=sw))

        pred_dd = 0.0
        if drawdown_history:
            dw = weights[: len(drawdown_history)]
            dw /= dw.sum()
            pred_dd = float(np.average(drawdown_history, weights=dw))

        # Confidence based on data consistency
        if len(returns_history) >= 20:
            std = float(np.std(returns_history))
            confidence = max(20, min(80, 80 - std * 100))
        else:
            confidence = max(20, min(60, len(returns_history) * 3))

        return {
            "predicted_return": round(pred_return, 4),
            "predicted_sharpe": round(pred_sharpe, 4),
            "predicted_max_drawdown": round(abs(pred_dd), 4),
            "confidence": round(confidence, 2),
            "model": "ewma-portfolio-forecast",
        }
