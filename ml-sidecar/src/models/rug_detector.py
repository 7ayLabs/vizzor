"""Gradient Boosted classifier for rug pull detection.

Input: token metadata (bytecode size, verification, holder concentration,
       GoPlus security flags, contract age, transfer count, tax rates).
Output: rug probability + risk factors.

Trained on historical rug pull database. Heuristic fallback when untrained.
"""

import os
from pathlib import Path

import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

FEATURE_KEYS = [
    "bytecode_size",
    "is_verified",
    "holder_concentration",
    "has_proxy",
    "has_mint",
    "has_pause",
    "has_blacklist",
    "liquidity_locked",
    "buy_tax",
    "sell_tax",
    "contract_age_days",
    "total_transfers",
    "owner_balance_pct",
    "is_open_source",
    "top10_holder_pct",
]


class RugDetector:
    def __init__(self):
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None

    def load(self):
        """Load trained GBM model or use heuristic."""
        model_path = MODEL_DIR / "rug_detector.joblib"
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
        """Predict rug pull probability.

        Returns:
            dict with: rug_probability, risk_level, risk_factors, model
        """
        if self.model is not None:
            return self._predict_model(features)
        return self._predict_heuristic(features)

    def _predict_model(self, features: dict) -> dict:
        """Run inference through trained Gradient Boosted classifier."""
        X = np.array([[features.get(k, 0) for k in FEATURE_KEYS]])
        proba = self.model.predict_proba(X)[0]
        # Assume class 1 = rug
        rug_idx = list(self.model.classes_).index(1) if 1 in self.model.classes_ else -1
        rug_prob = float(proba[rug_idx]) if rug_idx >= 0 else 0.0

        # Feature importance for explanations
        importances = self.model.feature_importances_
        top_factors = sorted(
            zip(FEATURE_KEYS, importances, [features.get(k, 0) for k in FEATURE_KEYS]),
            key=lambda x: x[1],
            reverse=True,
        )[:5]

        risk_factors = []
        for name, importance, value in top_factors:
            if importance > 0.05:
                risk_factors.append({
                    "factor": name,
                    "importance": round(float(importance), 3),
                    "value": value,
                })

        return {
            "rug_probability": round(rug_prob, 4),
            "risk_level": self._level(rug_prob),
            "risk_factors": risk_factors,
            "model": f"rug-detector-{self.version}",
        }

    def _predict_heuristic(self, features: dict) -> dict:
        """Weighted rule-based rug detection until model is trained."""
        score = 0.0
        risk_factors = []

        # --- Critical indicators ---

        has_mint = features.get("has_mint", 0)
        if has_mint:
            score += 0.20
            risk_factors.append({"factor": "has_mint", "importance": 0.20, "value": 1})

        has_blacklist = features.get("has_blacklist", 0)
        if has_blacklist:
            score += 0.15
            risk_factors.append({"factor": "has_blacklist", "importance": 0.15, "value": 1})

        sell_tax = features.get("sell_tax", 0)
        if sell_tax > 10:
            score += 0.20
            risk_factors.append({"factor": "sell_tax", "importance": 0.20, "value": sell_tax})
        elif sell_tax > 5:
            score += 0.10
            risk_factors.append({"factor": "sell_tax", "importance": 0.10, "value": sell_tax})

        # --- Warning indicators ---

        is_verified = features.get("is_verified", 0)
        if not is_verified:
            score += 0.10
            risk_factors.append({"factor": "is_verified", "importance": 0.10, "value": 0})

        has_proxy = features.get("has_proxy", 0)
        if has_proxy:
            score += 0.08
            risk_factors.append({"factor": "has_proxy", "importance": 0.08, "value": 1})

        holder_conc = features.get("holder_concentration", 0)
        if holder_conc > 50:
            score += 0.15
            risk_factors.append({"factor": "holder_concentration", "importance": 0.15, "value": holder_conc})
        elif holder_conc > 30:
            score += 0.08
            risk_factors.append({"factor": "holder_concentration", "importance": 0.08, "value": holder_conc})

        liquidity_locked = features.get("liquidity_locked", 0)
        if not liquidity_locked:
            score += 0.10
            risk_factors.append({"factor": "liquidity_locked", "importance": 0.10, "value": 0})

        # --- Contextual ---

        contract_age = features.get("contract_age_days", 0)
        if contract_age < 7:
            score += 0.08
            risk_factors.append({"factor": "contract_age_days", "importance": 0.08, "value": contract_age})

        total_transfers = features.get("total_transfers", 0)
        if total_transfers < 50:
            score += 0.05
            risk_factors.append({"factor": "total_transfers", "importance": 0.05, "value": total_transfers})

        owner_pct = features.get("owner_balance_pct", 0)
        if owner_pct > 20:
            score += 0.10
            risk_factors.append({"factor": "owner_balance_pct", "importance": 0.10, "value": owner_pct})

        has_pause = features.get("has_pause", 0)
        if has_pause:
            score += 0.08
            risk_factors.append({"factor": "has_pause", "importance": 0.08, "value": 1})

        rug_prob = min(0.98, score)

        # Sort by importance
        risk_factors.sort(key=lambda x: x["importance"], reverse=True)

        return {
            "rug_probability": round(rug_prob, 4),
            "risk_level": self._level(rug_prob),
            "risk_factors": risk_factors[:5],
            "model": "rug-detector-heuristic",
        }

    @staticmethod
    def _level(prob: float) -> str:
        if prob >= 0.75:
            return "critical"
        if prob >= 0.50:
            return "high"
        if prob >= 0.25:
            return "medium"
        return "low"
