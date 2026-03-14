"""Project Risk Scorer — GBM classifier for project-level risk assessment."""

import os
from pathlib import Path

import joblib
import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


class ProjectRiskScorer:
    """Predicts overall project risk probability from contract + market features."""

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
        "has_token_info",
    ]

    def __init__(self) -> None:
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None

    def load(self) -> None:
        model_path = MODEL_DIR / "project_risk_scorer.joblib"
        try:
            data = joblib.load(model_path)
            self.model = data["model"]
            self.last_trained = data.get("trained_at")
            self.accuracy = data.get("accuracy")
            self.is_loaded = True
        except Exception:
            self.model = None
            self.is_loaded = True

    def predict(self, features: dict) -> dict:
        if self.model is not None:
            return self._predict_model(features)
        return self._predict_heuristic(features)

    def _predict_model(self, features: dict) -> dict:
        x = np.array([[features.get(k, 0) for k in self.FEATURE_KEYS]])
        prob = float(self.model.predict_proba(x)[0][1])  # P(risky)

        risk_factors = []
        if hasattr(self.model, "feature_importances_"):
            imp = self.model.feature_importances_
            pairs = list(zip(self.FEATURE_KEYS, imp))
            pairs.sort(key=lambda p: p[1], reverse=True)
            for key, importance in pairs[:5]:
                risk_factors.append(
                    {
                        "factor": key,
                        "importance": round(float(importance), 4),
                        "value": float(features.get(key, 0)),
                    }
                )

        return {
            "risk_probability": round(prob, 4),
            "risk_level": self._level(prob),
            "risk_factors": risk_factors,
            "model": "gbm-project-risk",
        }

    def _predict_heuristic(self, features: dict) -> dict:
        score = 0
        risk_factors = []

        # Unverified contract
        if not features.get("is_verified", 0):
            score += 30
            risk_factors.append(
                {"factor": "is_verified", "importance": 0.20, "value": 0}
            )

        # High holder concentration
        concentration = features.get("holder_concentration", 0)
        if concentration > 50:
            score += 25
            risk_factors.append(
                {
                    "factor": "holder_concentration",
                    "importance": 0.18,
                    "value": concentration,
                }
            )
        elif concentration > 30:
            score += 15

        # No token info
        if not features.get("has_token_info", 1):
            score += 15
            risk_factors.append(
                {"factor": "has_token_info", "importance": 0.10, "value": 0}
            )

        # Mint capability
        if features.get("has_mint", 0):
            score += 20
            risk_factors.append(
                {"factor": "has_mint", "importance": 0.15, "value": 1}
            )

        # Sell tax > 10%
        sell_tax = features.get("sell_tax", 0)
        if sell_tax > 10:
            score += 15
            risk_factors.append(
                {"factor": "sell_tax", "importance": 0.12, "value": sell_tax}
            )

        # Blacklist capability
        if features.get("has_blacklist", 0):
            score += 15
            risk_factors.append(
                {"factor": "has_blacklist", "importance": 0.10, "value": 1}
            )

        # Owner balance > 20%
        owner_pct = features.get("owner_balance_pct", 0)
        if owner_pct > 20:
            score += 10
            risk_factors.append(
                {
                    "factor": "owner_balance_pct",
                    "importance": 0.08,
                    "value": owner_pct,
                }
            )

        # Top10 holder concentration > 70%
        top10 = features.get("top10_holder_pct", 0)
        if top10 > 70:
            score += 10

        # Very new contract (< 7 days)
        age = features.get("contract_age_days", 365)
        if age < 7:
            score += 10

        # Not open source
        if not features.get("is_open_source", 0):
            score += 5

        score = min(100, score)
        prob = score / 100

        # Sort by importance
        risk_factors.sort(key=lambda f: f["importance"], reverse=True)

        return {
            "risk_probability": round(prob, 4),
            "risk_level": self._level(prob),
            "risk_factors": risk_factors[:5],
            "model": "heuristic-project-risk",
        }

    @staticmethod
    def _level(prob: float) -> str:
        if prob >= 0.75:
            return "critical"
        if prob >= 0.5:
            return "high"
        if prob >= 0.25:
            return "medium"
        return "low"
