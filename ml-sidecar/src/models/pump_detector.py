"""CUSUM-based pump/dump detection model for micro-timeframe analysis.

Uses Cumulative Sum (CUSUM) change detection on 1-minute returns to identify
sudden price manipulation events such as pumps, dumps, and volume spikes.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


@dataclass
class CUSUMState:
    """Per-token tracking state for the CUSUM algorithm."""

    cusum_up: float = 0.0
    cusum_down: float = 0.0
    prices: list[float] = field(default_factory=list)
    volumes: list[float] = field(default_factory=list)
    baseline_return: float = 0.0
    baseline_volume: float = 0.0
    samples: int = 0


@dataclass
class PumpDetectionResult:
    """Result of pump/dump detection analysis."""

    detected: bool
    type: str  # 'pump', 'dump', 'volume_spike', 'none'
    severity: str  # 'low', 'medium', 'high', 'critical'
    cusum_value: float
    threshold: float
    price_change_pct: float
    volume_spike: float
    confidence: float


class PumpDetectorModel:
    """CUSUM-based pump/dump detection model.

    Maintains per-token state and uses the Cumulative Sum algorithm to detect
    statistically significant deviations in price returns and volume.
    """

    def __init__(
        self,
        target_mean: float = 0,
        allowance: float = 0.5,
        threshold: float = 4,
        window_size: int = 60,
        volume_spike_threshold: float = 5.0,
    ) -> None:
        self.target_mean = target_mean
        self.allowance = allowance
        self.threshold = threshold
        self.window_size = window_size
        self.volume_spike_threshold = volume_spike_threshold
        self.states: dict[str, CUSUMState] = {}
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None

    def load(self) -> None:
        """Initialize model (stateless algorithm, always ready)."""
        self.is_loaded = True

    def feed(
        self, token: str, price: float, volume: float
    ) -> Optional[PumpDetectionResult]:
        """Feed a single price/volume observation for a token.

        Maintains per-token CUSUM state and returns a detection result
        when enough samples have been collected (>= 2 for returns).
        """
        if token not in self.states:
            self.states[token] = CUSUMState()

        state = self.states[token]
        state.prices.append(price)
        state.volumes.append(volume)
        state.samples += 1

        # Trim to window size
        if len(state.prices) > self.window_size:
            state.prices = state.prices[-self.window_size :]
        if len(state.volumes) > self.window_size:
            state.volumes = state.volumes[-self.window_size :]

        # Need at least 2 prices to compute a return
        if len(state.prices) < 2:
            return None

        # Calculate latest return
        prev_price = state.prices[-2]
        if prev_price == 0:
            return None
        current_return = (price - prev_price) / prev_price

        # Update baseline statistics using exponential moving average
        alpha = 2.0 / (min(state.samples, self.window_size) + 1)
        state.baseline_return = (
            alpha * current_return + (1 - alpha) * state.baseline_return
        )
        state.baseline_volume = alpha * volume + (1 - alpha) * state.baseline_volume

        # Normalize return relative to baseline
        deviation = current_return - self.target_mean

        # Update CUSUM statistics
        state.cusum_up = max(0, state.cusum_up + deviation - self.allowance * 0.01)
        state.cusum_down = max(
            0, state.cusum_down - deviation - self.allowance * 0.01
        )

        # Check for pump/dump signals
        detected = False
        detection_type = "none"
        cusum_value = 0.0

        if state.cusum_up > self.threshold * 0.01:
            detected = True
            detection_type = "pump"
            cusum_value = state.cusum_up
        elif state.cusum_down > self.threshold * 0.01:
            detected = True
            detection_type = "dump"
            cusum_value = state.cusum_down

        # Check for volume spike
        volume_spike = 0.0
        if state.baseline_volume > 0:
            volume_spike = volume / state.baseline_volume
            if volume_spike > self.volume_spike_threshold and not detected:
                detected = True
                detection_type = "volume_spike"
                cusum_value = max(state.cusum_up, state.cusum_down)

        # Calculate overall price change in the window
        price_change_pct = 0.0
        if len(state.prices) >= 2 and state.prices[0] != 0:
            price_change_pct = (
                (state.prices[-1] - state.prices[0]) / state.prices[0]
            ) * 100

        # Determine severity and confidence
        severity = self._classify_severity(
            cusum_value, price_change_pct, volume_spike
        )
        confidence = self._calculate_confidence(
            cusum_value, price_change_pct, volume_spike, state.samples
        )

        # Reset CUSUM after detection to avoid repeated alerts
        if detected:
            state.cusum_up = 0.0
            state.cusum_down = 0.0

        return PumpDetectionResult(
            detected=detected,
            type=detection_type,
            severity=severity,
            cusum_value=round(cusum_value, 6),
            threshold=self.threshold * 0.01,
            price_change_pct=round(price_change_pct, 4),
            volume_spike=round(volume_spike, 4),
            confidence=round(confidence, 4),
        )

    def predict(self, features: dict) -> PumpDetectionResult:
        """Batch prediction from feature dict (API compatibility).

        Accepts either:
          - {"token": str, "prices": [float], "volumes": [float]} for batch
          - {"token": str, "price": float, "volume": float} for single feed
        """
        token = features.get("token", "unknown")
        prices = features.get("prices", [])
        volumes = features.get("volumes", [])

        # Single feed mode
        if not prices and "price" in features:
            price = float(features["price"])
            volume = float(features.get("volume", 0))
            result = self.feed(token, price, volume)
            if result is None:
                return PumpDetectionResult(
                    detected=False,
                    type="none",
                    severity="low",
                    cusum_value=0.0,
                    threshold=self.threshold * 0.01,
                    price_change_pct=0.0,
                    volume_spike=0.0,
                    confidence=0.0,
                )
            return result

        # Batch mode — feed all prices/volumes and return last result
        if len(volumes) < len(prices):
            volumes = volumes + [0.0] * (len(prices) - len(volumes))

        last_result: Optional[PumpDetectionResult] = None
        for p, v in zip(prices, volumes):
            result = self.feed(token, float(p), float(v))
            if result is not None:
                last_result = result

        if last_result is None:
            return PumpDetectionResult(
                detected=False,
                type="none",
                severity="low",
                cusum_value=0.0,
                threshold=self.threshold * 0.01,
                price_change_pct=0.0,
                volume_spike=0.0,
                confidence=0.0,
            )
        return last_result

    def get_state(self, token: str) -> Optional[CUSUMState]:
        """Get current CUSUM state for a token."""
        return self.states.get(token)

    def reset(self, token: str | None = None) -> None:
        """Reset state for a token, or all tokens if None."""
        if token is None:
            self.states.clear()
        elif token in self.states:
            del self.states[token]

    def _classify_severity(
        self, cusum_value: float, price_change_pct: float, volume_spike: float
    ) -> str:
        """Classify detection severity based on multiple signals."""
        score = 0.0
        score += min(1.0, cusum_value / (self.threshold * 0.02)) * 0.4
        score += min(1.0, abs(price_change_pct) / 20.0) * 0.35
        score += min(1.0, volume_spike / (self.volume_spike_threshold * 2)) * 0.25

        if score >= 0.75:
            return "critical"
        if score >= 0.5:
            return "high"
        if score >= 0.25:
            return "medium"
        return "low"

    def _calculate_confidence(
        self,
        cusum_value: float,
        price_change_pct: float,
        volume_spike: float,
        samples: int,
    ) -> float:
        """Calculate detection confidence score (0-1)."""
        # Base confidence from CUSUM deviation
        cusum_conf = min(1.0, cusum_value / (self.threshold * 0.015))

        # Price change contribution
        price_conf = min(1.0, abs(price_change_pct) / 15.0)

        # Volume spike contribution
        vol_conf = min(1.0, volume_spike / (self.volume_spike_threshold * 1.5))

        # Sample size penalty — less confident with fewer samples
        sample_factor = min(1.0, samples / self.window_size)

        raw = (cusum_conf * 0.4 + price_conf * 0.3 + vol_conf * 0.2) * (
            0.5 + 0.5 * sample_factor
        )
        return min(1.0, max(0.0, raw))
