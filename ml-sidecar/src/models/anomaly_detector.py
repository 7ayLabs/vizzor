"""Isolation Forest anomaly detector.

Input: whale transfer amounts, volume spikes, funding rate deviations
Output: anomaly scores indicating suspicious activity.
"""

import os
from pathlib import Path

import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


class AnomalyDetector:
    def __init__(self):
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.model = None

    def load(self):
        """Load trained Isolation Forest or use threshold-based fallback."""
        model_path = MODEL_DIR / "anomaly_detector.joblib"
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

    def detect(self, flow: dict) -> dict:
        """Detect anomaly in a token flow.

        Returns:
            dict with keys: score, is_anomaly, type, details
        """
        if self.model is not None:
            return self._detect_model(flow)
        return self._detect_heuristic(flow)

    def _detect_model(self, flow: dict) -> dict:
        """Run inference through trained Isolation Forest."""
        features = np.array([[
            flow.get("amount", 0),
            1 if flow.get("type") == "transfer" else 0,
        ]])
        score = -self.model.score_samples(features)[0]  # Higher = more anomalous
        normalized = min(1.0, max(0.0, (score + 0.5) / 1.0))

        return {
            "score": normalized,
            "is_anomaly": normalized > 0.7,
            "type": self._classify_type(flow, normalized),
            "details": f"Isolation Forest score: {normalized:.3f}",
        }

    def _detect_heuristic(self, flow: dict) -> dict:
        """Threshold-based anomaly detection until model is trained."""
        amount = flow.get("amount", 0)
        flow_type = flow.get("type", "transfer")

        score = 0.0
        anomaly_type = "unknown"
        details = []

        # Whale threshold: transfers > $1M
        if amount > 1_000_000:
            score += 0.4
            anomaly_type = "whale_transfer"
            details.append(f"Large transfer: ${amount:,.0f}")

        if amount > 10_000_000:
            score += 0.3
            details.append("Mega whale movement")

        # Bridge transfers are inherently more suspicious
        if flow_type == "bridge":
            score += 0.2
            details.append("Cross-chain bridge transfer")

        normalized = min(1.0, score)

        return {
            "score": normalized,
            "is_anomaly": normalized > 0.5,
            "type": anomaly_type if score > 0.3 else "unknown",
            "details": "; ".join(details) if details else "No anomaly detected",
        }

    def _classify_type(self, flow: dict, score: float) -> str:
        if flow.get("amount", 0) > 1_000_000:
            return "whale_transfer"
        if score > 0.8:
            return "volume_spike"
        return "unknown"
