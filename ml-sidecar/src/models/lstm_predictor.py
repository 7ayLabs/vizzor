"""LSTM time-series predictor for price direction.

Input: 100-candle OHLCV windows + 7 TA indicators
Output: price direction probability over 1h/4h/1d horizons

Trained on historical klines from PostgreSQL via training/train_lstm.py.
"""

import os
from pathlib import Path

import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


class LSTMPredictor:
    def __init__(self):
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None

    def load(self):
        """Load trained LSTM model from disk, or initialize with heuristic fallback."""
        model_path = MODEL_DIR / "lstm_predictor.pt"
        if model_path.exists():
            try:
                import torch

                self.model = torch.load(model_path, weights_only=True)
                self.is_loaded = True
                self.last_trained = str(model_path.stat().st_mtime)
            except Exception:
                self._init_heuristic()
        else:
            self._init_heuristic()

    def _init_heuristic(self):
        """Fallback: use a simple heuristic until trained model is available."""
        self.is_loaded = True
        self.version = "0.1.0-heuristic"

    def predict(self, ohlcv_window: list[dict], indicators: dict) -> dict:
        """Predict price direction from OHLCV + indicators.

        Returns:
            dict with keys: direction, probability, model
        """
        if self.model is not None:
            return self._predict_model(ohlcv_window, indicators)
        return self._predict_heuristic(indicators)

    def _predict_model(self, ohlcv_window: list[dict], indicators: dict) -> dict:
        """Run inference through trained LSTM model."""
        import torch

        closes = [c["close"] for c in ohlcv_window[-100:]]
        features = np.array(closes + list(indicators.values()), dtype=np.float32)
        tensor = torch.tensor(features).unsqueeze(0).unsqueeze(0)

        with torch.no_grad():
            output = self.model(tensor)
            probs = torch.softmax(output, dim=-1).squeeze().numpy()

        directions = ["up", "sideways", "down"]
        idx = int(np.argmax(probs))

        return {
            "direction": directions[idx],
            "probability": float(probs[idx]),
            "model": f"lstm-predictor-{self.version}",
        }

    def _predict_heuristic(self, indicators: dict) -> dict:
        """Simple heuristic based on RSI + MACD until model is trained."""
        rsi = indicators.get("rsi", 50)
        macd_hist = indicators.get("macdHistogram", 0)

        score = 0.0
        if rsi < 30:
            score += 0.3
        elif rsi > 70:
            score -= 0.3
        if macd_hist > 0:
            score += 0.2
        elif macd_hist < 0:
            score -= 0.2

        if score > 0.1:
            return {"direction": "up", "probability": 0.5 + score, "model": "lstm-heuristic"}
        elif score < -0.1:
            return {"direction": "down", "probability": 0.5 + abs(score), "model": "lstm-heuristic"}
        return {"direction": "sideways", "probability": 0.5, "model": "lstm-heuristic"}
