"""Detect divergence between prediction market odds and price action.

Compares momentum signals from prediction markets (e.g., Polymarket odds)
with token price action to identify bullish or bearish divergences where
one signal leads the other.
"""

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


@dataclass
class DivergenceResult:
    """Result of divergence detection analysis."""

    divergence_score: float  # 0-1, higher = more divergent
    type: str  # 'bullish_divergence', 'bearish_divergence', 'no_divergence'
    prediction_market_signal: float  # -1 to 1
    price_action_signal: float  # -1 to 1
    confidence: float
    interpretation: str


class DivergenceDetectorModel:
    """Detects divergence between prediction market odds and price action.

    When prediction market odds are bullish but price is declining, this
    suggests a bullish divergence (odds tend to lead price). The reverse
    indicates a bearish divergence.
    """

    def __init__(
        self,
        lookback_periods: int = 24,
        divergence_threshold: float = 0.3,
    ) -> None:
        self.lookback_periods = lookback_periods
        self.divergence_threshold = divergence_threshold
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None

    def load(self) -> None:
        """Initialize model (analytical, always ready)."""
        self.is_loaded = True

    def detect(
        self, market_odds: list[float], prices: list[float]
    ) -> DivergenceResult:
        """Detect divergence between prediction market odds and prices.

        Args:
            market_odds: Sequence of prediction market odds/probabilities (0-1).
            prices: Sequence of token prices (any scale).

        Returns:
            DivergenceResult with scored divergence analysis.
        """
        if len(market_odds) < 2 or len(prices) < 2:
            return DivergenceResult(
                divergence_score=0.0,
                type="no_divergence",
                prediction_market_signal=0.0,
                price_action_signal=0.0,
                confidence=0.0,
                interpretation="Insufficient data for divergence analysis.",
            )

        # Align lengths to minimum
        min_len = min(len(market_odds), len(prices))
        odds = np.array(market_odds[-min_len:], dtype=np.float64)
        price = np.array(prices[-min_len:], dtype=np.float64)

        # Use lookback window
        window = min(self.lookback_periods, min_len)
        odds_window = odds[-window:]
        price_window = price[-window:]

        # Calculate prediction market momentum (rate of change of odds)
        pm_signal = self._calculate_momentum(odds_window)

        # Calculate price momentum (returns)
        price_signal = self._calculate_momentum(price_window)

        # Calculate divergence score
        divergence_score = abs(pm_signal - price_signal) / 2.0
        divergence_score = min(1.0, max(0.0, divergence_score))

        # Classify divergence type
        divergence_type = self._classify_divergence(
            pm_signal, price_signal, divergence_score
        )

        # Calculate confidence based on data quality and signal strength
        confidence = self._calculate_confidence(
            odds_window, price_window, divergence_score, min_len
        )

        # Generate interpretation
        interpretation = self._generate_interpretation(
            divergence_type, pm_signal, price_signal, divergence_score, confidence
        )

        return DivergenceResult(
            divergence_score=round(divergence_score, 4),
            type=divergence_type,
            prediction_market_signal=round(pm_signal, 4),
            price_action_signal=round(price_signal, 4),
            confidence=round(confidence, 4),
            interpretation=interpretation,
        )

    def predict(self, features: dict) -> DivergenceResult:
        """API-compatible prediction.

        Accepts: {"market_odds": [float], "prices": [float]}
        """
        market_odds = features.get("market_odds", [])
        prices = features.get("prices", [])
        return self.detect(market_odds, prices)

    def _calculate_momentum(self, values: np.ndarray) -> float:
        """Calculate normalized momentum signal from a value series.

        Uses linear regression slope normalized to [-1, 1] range.
        """
        if len(values) < 2:
            return 0.0

        # Normalize values to [0, 1] for comparable slope calculation
        v_min, v_max = float(np.min(values)), float(np.max(values))
        if v_max - v_min < 1e-10:
            return 0.0

        normalized = (values - v_min) / (v_max - v_min)

        # Linear regression slope
        x = np.arange(len(normalized), dtype=np.float64)
        x_mean = np.mean(x)
        y_mean = np.mean(normalized)
        numerator = float(np.sum((x - x_mean) * (normalized - y_mean)))
        denominator = float(np.sum((x - x_mean) ** 2))

        if abs(denominator) < 1e-10:
            return 0.0

        slope = numerator / denominator

        # Scale slope to [-1, 1] — a slope of ~0.05 per period is strong
        signal = np.tanh(slope * 10.0)
        return float(signal)

    def _classify_divergence(
        self, pm_signal: float, price_signal: float, score: float
    ) -> str:
        """Classify the type of divergence."""
        if score < self.divergence_threshold:
            return "no_divergence"

        # Odds bullish but price bearish → bullish divergence (odds lead)
        if pm_signal > 0 and price_signal < 0:
            return "bullish_divergence"

        # Odds bearish but price bullish → bearish divergence (odds lead)
        if pm_signal < 0 and price_signal > 0:
            return "bearish_divergence"

        # Both same direction but magnitude differs significantly
        if abs(pm_signal - price_signal) > self.divergence_threshold:
            if pm_signal > price_signal:
                return "bullish_divergence"
            return "bearish_divergence"

        return "no_divergence"

    def _calculate_confidence(
        self,
        odds: np.ndarray,
        prices: np.ndarray,
        divergence_score: float,
        total_samples: int,
    ) -> float:
        """Calculate confidence in the divergence detection."""
        # Data sufficiency factor
        data_factor = min(1.0, total_samples / self.lookback_periods)

        # Signal clarity — stronger signals = higher confidence
        signal_factor = min(1.0, divergence_score / 0.8)

        # Variance check — very noisy data reduces confidence
        odds_std = float(np.std(odds))
        price_std = float(np.std(prices))
        price_mean = float(np.mean(prices))
        noise_factor = 1.0
        if price_mean != 0 and price_std / abs(price_mean) > 0.5:
            noise_factor = 0.6
        if odds_std > 0.3:
            noise_factor *= 0.8

        raw_confidence = (
            data_factor * 0.3 + signal_factor * 0.5 + noise_factor * 0.2
        )
        return min(1.0, max(0.0, raw_confidence))

    def _generate_interpretation(
        self,
        divergence_type: str,
        pm_signal: float,
        price_signal: float,
        score: float,
        confidence: float,
    ) -> str:
        """Generate a human-readable interpretation of the divergence."""
        if divergence_type == "no_divergence":
            return (
                "No significant divergence detected between prediction "
                "market odds and price action."
            )

        pm_dir = "bullish" if pm_signal > 0 else "bearish"
        price_dir = "bullish" if price_signal > 0 else "bearish"
        strength = "strong" if score > 0.6 else "moderate" if score > 0.4 else "mild"
        conf_label = (
            "high" if confidence > 0.7 else "moderate" if confidence > 0.4 else "low"
        )

        if divergence_type == "bullish_divergence":
            return (
                f"{strength.capitalize()} bullish divergence: prediction markets "
                f"signal {pm_dir} ({pm_signal:+.2f}) while price action is "
                f"{price_dir} ({price_signal:+.2f}). Odds may be leading price "
                f"upward. Confidence: {conf_label} ({confidence:.0%})."
            )

        return (
            f"{strength.capitalize()} bearish divergence: prediction markets "
            f"signal {pm_dir} ({pm_signal:+.2f}) while price action is "
            f"{price_dir} ({price_signal:+.2f}). Odds may be leading price "
            f"downward. Confidence: {conf_label} ({confidence:.0%})."
        )
