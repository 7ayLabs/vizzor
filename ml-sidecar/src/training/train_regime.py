"""Regime detector model training script."""

import logging
import numpy as np
from .pipeline import TrainingPipeline

logger = logging.getLogger(__name__)

REGIMES = ["trending_bull", "trending_bear", "ranging", "volatile", "capitulation"]


class RegimeTrainer(TrainingPipeline):
    def __init__(self):
        super().__init__("regime_detector")

    def load_data(self):
        logger.info("Loading regime detection training data...")
        n = 1000
        X = np.random.randn(n, 9).astype(np.float32)
        y = np.random.randint(0, len(REGIMES), size=n)
        return {"X": X, "y": y}

    def preprocess(self, data):
        X, y = data["X"], data["y"]
        n = len(X)
        t1, t2 = int(n * 0.7), int(n * 0.85)
        return X[:t1], X[t1:t2], X[t2:], y[:t1], y[t1:t2], y[t2:]

    def train(self, X_train, y_train, X_val, y_val):
        from sklearn.ensemble import RandomForestClassifier
        model = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
        model.fit(X_train, y_train)
        val_acc = model.score(X_val, y_val)
        logger.info(f"Validation accuracy: {val_acc:.4f}")
        return model

    def evaluate(self, model, X_test, y_test):
        from sklearn.metrics import accuracy_score, classification_report
        preds = model.predict(X_test)
        report = classification_report(y_test, preds, target_names=REGIMES, output_dict=True, zero_division=0)
        return {
            "accuracy": float(accuracy_score(y_test, preds)),
            "per_class": {k: v for k, v in report.items() if k in REGIMES},
            "test_samples": len(y_test),
        }

    def save(self, model, metrics):
        import joblib
        path = super().save(model, metrics)
        artifact_path = path.replace(".pkl", "_model.pkl")
        joblib.dump(model, artifact_path)
        return artifact_path
