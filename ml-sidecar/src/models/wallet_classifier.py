"""LSTM-based wallet behavior classifier.

Input: transaction sequence features (tx_count, avg_value, avg_gas,
       unique_recipients, unique_methods, time_spread, etc.)
Output: behavior_type classification + confidence + risk_score.

Classifies wallets as: normal_trader, bot, whale, sniper, mev_bot,
mixer_user, rug_deployer.

Trained on labeled wallet transaction sequences. Heuristic fallback.
"""

import os
from pathlib import Path

import numpy as np

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

BEHAVIOR_TYPES = [
    "normal_trader",
    "bot",
    "whale",
    "sniper",
    "mev_bot",
    "mixer_user",
    "rug_deployer",
]

# Aggregated transaction features (from raw tx sequence)
AGG_FEATURE_KEYS = [
    "tx_count",
    "avg_value_eth",
    "max_value_eth",
    "avg_gas_used",
    "unique_recipients",
    "unique_methods",
    "time_span_hours",
    "avg_interval_seconds",
    "min_interval_seconds",
    "contract_interaction_pct",
    "self_transfer_pct",
    "high_value_tx_pct",
    "failed_tx_pct",
    "token_diversity",
]


class WalletClassifier:
    def __init__(self):
        self.version = "0.1.0"
        self.is_loaded = False
        self.last_trained: str | None = None
        self.accuracy: float | None = None
        self.model = None

    def load(self):
        """Load trained model or use heuristic."""
        model_path = MODEL_DIR / "wallet_classifier.joblib"
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

    def classify(self, features: dict) -> dict:
        """Classify wallet behavior.

        Args:
            features: Aggregated transaction features for a wallet.

        Returns:
            dict with: behavior_type, confidence, risk_score,
                        secondary_type, indicators, model
        """
        if self.model is not None:
            return self._classify_model(features)
        return self._classify_heuristic(features)

    def _classify_model(self, features: dict) -> dict:
        """Run inference through trained classifier."""
        X = np.array([[features.get(k, 0) for k in AGG_FEATURE_KEYS]])
        proba = self.model.predict_proba(X)[0]
        classes = list(self.model.classes_)

        idx = int(np.argmax(proba))
        primary = classes[idx]
        confidence = float(proba[idx])

        # Second most likely
        sorted_idx = np.argsort(proba)[::-1]
        secondary = classes[sorted_idx[1]] if len(sorted_idx) > 1 else None

        risk_map = {
            "normal_trader": 0.1,
            "whale": 0.3,
            "bot": 0.4,
            "sniper": 0.6,
            "mev_bot": 0.5,
            "mixer_user": 0.8,
            "rug_deployer": 0.95,
        }

        return {
            "behavior_type": primary,
            "confidence": round(confidence, 3),
            "risk_score": risk_map.get(primary, 0.5),
            "secondary_type": secondary,
            "indicators": self._extract_indicators(features, primary),
            "model": f"wallet-classifier-{self.version}",
        }

    def _classify_heuristic(self, features: dict) -> dict:
        """Rule-based wallet classification until model is trained."""
        tx_count = features.get("tx_count", 0)
        avg_value = features.get("avg_value_eth", 0)
        max_value = features.get("max_value_eth", 0)
        avg_gas = features.get("avg_gas_used", 0)
        unique_recipients = features.get("unique_recipients", 0)
        unique_methods = features.get("unique_methods", 0)
        time_span = features.get("time_span_hours", 0)
        avg_interval = features.get("avg_interval_seconds", 3600)
        min_interval = features.get("min_interval_seconds", 60)
        contract_pct = features.get("contract_interaction_pct", 0)
        self_transfer_pct = features.get("self_transfer_pct", 0)
        high_value_pct = features.get("high_value_tx_pct", 0)
        failed_pct = features.get("failed_tx_pct", 0)
        token_diversity = features.get("token_diversity", 0)

        scores: dict[str, float] = {t: 0.0 for t in BEHAVIOR_TYPES}

        # --- Bot detection ---
        if min_interval < 5 and tx_count > 50:
            scores["bot"] += 0.35
        if avg_interval < 30 and tx_count > 100:
            scores["bot"] += 0.25
        if contract_pct > 0.9 and unique_methods <= 3:
            scores["bot"] += 0.20

        # --- Sniper detection ---
        if min_interval < 3 and avg_gas > 200000:
            scores["sniper"] += 0.30
        if failed_pct > 0.3 and avg_gas > 150000:
            scores["sniper"] += 0.25
        if token_diversity > 20 and time_span < 48:
            scores["sniper"] += 0.20

        # --- MEV bot detection ---
        if avg_gas > 300000 and min_interval < 5:
            scores["mev_bot"] += 0.30
        if failed_pct > 0.4 and contract_pct > 0.95:
            scores["mev_bot"] += 0.25
        if self_transfer_pct > 0.1 and avg_gas > 200000:
            scores["mev_bot"] += 0.15

        # --- Whale detection ---
        if max_value > 100:
            scores["whale"] += 0.35
        if avg_value > 10:
            scores["whale"] += 0.25
        if high_value_pct > 0.3:
            scores["whale"] += 0.20

        # --- Mixer detection ---
        if self_transfer_pct > 0.3:
            scores["mixer_user"] += 0.25
        if unique_recipients > 50 and avg_value < 1:
            scores["mixer_user"] += 0.20
        if token_diversity <= 2 and unique_recipients > 30:
            scores["mixer_user"] += 0.20

        # --- Rug deployer detection ---
        if unique_methods > 10 and contract_pct > 0.8 and tx_count < 200:
            scores["rug_deployer"] += 0.25
        if high_value_pct > 0.5 and unique_recipients < 5:
            scores["rug_deployer"] += 0.20

        # --- Normal trader baseline ---
        scores["normal_trader"] += 0.20
        if 10 < avg_interval < 86400:
            scores["normal_trader"] += 0.10
        if 0.1 < avg_value < 10:
            scores["normal_trader"] += 0.10
        if 0.05 < failed_pct < 0.15:
            scores["normal_trader"] += 0.05

        # Find top behavior
        sorted_types = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        primary = sorted_types[0][0]
        primary_score = sorted_types[0][1]
        secondary = sorted_types[1][0] if len(sorted_types) > 1 else None

        # Normalize confidence
        total = sum(s for _, s in sorted_types) or 1.0
        confidence = primary_score / total

        risk_map = {
            "normal_trader": 0.1,
            "whale": 0.3,
            "bot": 0.4,
            "sniper": 0.6,
            "mev_bot": 0.5,
            "mixer_user": 0.8,
            "rug_deployer": 0.95,
        }

        return {
            "behavior_type": primary,
            "confidence": round(confidence, 3),
            "risk_score": risk_map.get(primary, 0.5),
            "secondary_type": secondary,
            "indicators": self._extract_indicators(features, primary),
            "model": "wallet-classifier-heuristic",
        }

    @staticmethod
    def _extract_indicators(features: dict, behavior_type: str) -> list[str]:
        """Generate human-readable indicators explaining the classification."""
        indicators = []
        tx_count = features.get("tx_count", 0)
        avg_interval = features.get("avg_interval_seconds", 3600)
        min_interval = features.get("min_interval_seconds", 60)
        avg_value = features.get("avg_value_eth", 0)
        max_value = features.get("max_value_eth", 0)
        contract_pct = features.get("contract_interaction_pct", 0)
        failed_pct = features.get("failed_tx_pct", 0)
        avg_gas = features.get("avg_gas_used", 0)

        if behavior_type == "bot":
            indicators.append(f"High frequency: {tx_count} txs, avg {avg_interval:.0f}s apart")
            if contract_pct > 0.8:
                indicators.append(f"Contract-heavy: {contract_pct*100:.0f}% contract calls")
        elif behavior_type == "sniper":
            indicators.append(f"Sub-second execution: min interval {min_interval:.1f}s")
            indicators.append(f"High gas: avg {avg_gas:,.0f} gas per tx")
            if failed_pct > 0.2:
                indicators.append(f"High failure rate: {failed_pct*100:.0f}% failed txs")
        elif behavior_type == "whale":
            indicators.append(f"Large values: avg {avg_value:.2f} ETH, max {max_value:.2f} ETH")
        elif behavior_type == "mev_bot":
            indicators.append(f"MEV patterns: high gas ({avg_gas:,.0f}), rapid execution")
            if failed_pct > 0.3:
                indicators.append(f"Many reverts: {failed_pct*100:.0f}% failure rate")
        elif behavior_type == "mixer_user":
            indicators.append("Mixing patterns: many small transfers to unique addresses")
        elif behavior_type == "rug_deployer":
            indicators.append("Deploy-and-drain pattern detected")
        else:
            indicators.append(f"Normal activity: {tx_count} transactions over time")

        return indicators
