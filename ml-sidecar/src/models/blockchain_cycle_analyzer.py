"""Blockchain Cycle Analyzer — cycle phase detection from on-chain fundamentals."""

import os
from pathlib import Path

import joblib
import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

PHASES = ["accumulation", "early_markup", "late_markup", "distribution", "markdown"]

# Asymmetric phase scores (from plan)
PHASE_SCORES = {
    "accumulation": 50,
    "early_markup": 70,
    "late_markup": 15,
    "distribution": -45,
    "markdown": -65,
}

# Phase boundaries as % of cycle
PHASE_BOUNDARIES = {
    "accumulation": (0, 35),
    "early_markup": (35, 55),
    "late_markup": (55, 70),
    "distribution": (70, 85),
    "markdown": (85, 100),
}


class BlockchainCycleAnalyzer:
    """Detects BTC cycle phase from on-chain metrics using trained model or heuristic."""

    FEATURE_KEYS = [
        "halving_cycle_progress",
        "days_since_halving",
        "days_to_next_halving",
        "block_reward",
        "hashrate_change_30d",
        "difficulty_change_14d",
        "nvt_ratio",
        "mvrv_z_score",
        "inflation_rate",
        "fee_revenue_share",
        "mempool_size_mb",
        "avg_fee_rate",
        "hash_ribbon_signal",
    ]

    def __init__(self) -> None:
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None

    def load(self) -> None:
        model_path = MODEL_DIR / "blockchain_cycle_analyzer.joblib"
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
        pred = self.model.predict(x)
        phase_idx = int(pred[0])
        phase = PHASES[phase_idx] if phase_idx < len(PHASES) else "accumulation"

        try:
            probs = self.model.predict_proba(x)[0]
            confidence = float(probs[phase_idx]) * 100
        except Exception:
            confidence = 65.0

        return self._build_response(phase, confidence, features, "xgb-blockchain-cycle")

    def _predict_heuristic(self, features: dict) -> dict:
        progress = features.get("halving_cycle_progress", 0)
        mvrv = features.get("mvrv_z_score", 1.5)
        nvt = features.get("nvt_ratio", 55)
        hashrate_chg = features.get("hashrate_change_30d", 0)
        hash_ribbon = features.get("hash_ribbon_signal", 0)

        # Primary: cycle progress determines base phase
        phase = "accumulation"
        for p, (lo, hi) in PHASE_BOUNDARIES.items():
            if lo <= progress < hi:
                phase = p
                break

        # Secondary: MVRV Z-Score can override phase detection
        confidence = 55.0

        if mvrv < 0:
            # Strong buy signal — likely accumulation regardless of progress
            if phase not in ("accumulation", "markdown"):
                phase = "accumulation"
            confidence = 75.0
        elif mvrv > 6:
            # Extreme overvaluation — likely distribution/markdown
            if phase in ("accumulation", "early_markup"):
                phase = "distribution"
            confidence = 80.0
        elif mvrv > 4:
            # Getting expensive
            if phase == "early_markup":
                phase = "late_markup"
            confidence = 65.0

        # NVT adjustment
        if nvt > 80 and phase in ("early_markup", "late_markup"):
            phase = "distribution"
            confidence = max(confidence, 60.0)
        elif nvt < 30 and phase == "markdown":
            phase = "accumulation"
            confidence = max(confidence, 60.0)

        # Hash ribbon golden cross in accumulation = strong signal
        if hash_ribbon == 1 and phase == "accumulation":
            confidence = min(90.0, confidence + 15)

        # Hashrate declining significantly
        if hashrate_chg < -15 and phase in ("late_markup", "distribution"):
            phase = "markdown"
            confidence = max(confidence, 65.0)

        return self._build_response(phase, confidence, features, "heuristic-blockchain-cycle")

    def _build_response(self, phase: str, confidence: float, features: dict, model: str) -> dict:
        mvrv = features.get("mvrv_z_score", 1.5)
        nvt = features.get("nvt_ratio", 55)
        inflation = features.get("inflation_rate", 0.83)
        hashrate_chg = features.get("hashrate_change_30d", 0)
        hash_ribbon = features.get("hash_ribbon_signal", 0)

        # Fair value estimate based on MVRV and cycle phase
        # Simple heuristic: use phase score to estimate relative value
        phase_score = PHASE_SCORES.get(phase, 0)

        # deviation from fair: positive = overvalued, negative = undervalued
        # MVRV Z > 3 = overvalued, MVRV Z < 1 = undervalued
        deviation = (mvrv - 1.5) * 15  # rough scaling

        # Risk factors
        risk_factors = []

        if abs(mvrv) > 3:
            risk_factors.append({
                "factor": "mvrv_extreme",
                "importance": 0.35,
                "value": round(mvrv, 4),
            })

        if nvt > 70:
            risk_factors.append({
                "factor": "nvt_elevated",
                "importance": 0.25,
                "value": round(nvt, 4),
            })
        elif nvt < 30:
            risk_factors.append({
                "factor": "nvt_undervalued",
                "importance": 0.20,
                "value": round(nvt, 4),
            })

        if hashrate_chg < -10:
            risk_factors.append({
                "factor": "hashrate_declining",
                "importance": 0.20,
                "value": round(hashrate_chg, 4),
            })

        if hash_ribbon == -1:
            risk_factors.append({
                "factor": "hash_ribbon_death_cross",
                "importance": 0.30,
                "value": -1,
            })
        elif hash_ribbon == 1:
            risk_factors.append({
                "factor": "hash_ribbon_golden_cross",
                "importance": 0.30,
                "value": 1,
            })

        if inflation > 2.0:
            risk_factors.append({
                "factor": "high_inflation",
                "importance": 0.10,
                "value": round(inflation, 4),
            })

        # Sort by importance descending, limit to 5
        risk_factors.sort(key=lambda x: x["importance"], reverse=True)
        risk_factors = risk_factors[:5]

        return {
            "cycle_phase": phase,
            "phase_confidence": round(min(100, max(0, confidence)), 2),
            "fair_value_estimate": round(phase_score, 2),
            "deviation_from_fair": round(deviation, 2),
            "risk_factors": risk_factors,
            "model": model,
        }
