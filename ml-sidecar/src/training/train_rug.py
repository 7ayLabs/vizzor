"""Rug detection model training script."""

import logging
import numpy as np
from .pipeline import TrainingPipeline

logger = logging.getLogger(__name__)


class RugTrainer(TrainingPipeline):
    def __init__(self):
        super().__init__("rug_detector")

    def load_data(self):
        # Load from feature store / CSV / database
        logger.info("Loading rug detection training data...")
        # Placeholder: generate synthetic data for pipeline testing
        n = 1000
        X = np.random.randn(n, 15).astype(np.float32)
        y = (X[:, 0] + X[:, 2] + X[:, 4] > 1.5).astype(np.int32)
        return {"X": X, "y": y}

    def preprocess(self, data):
        X, y = data["X"], data["y"]
        n = len(X)
        train_end = int(n * 0.7)
        val_end = int(n * 0.85)
        return (
            X[:train_end], X[train_end:val_end], X[val_end:],
            y[:train_end], y[train_end:val_end], y[val_end:],
        )

    def train(self, X_train, y_train, X_val, y_val):
        from sklearn.ensemble import GradientBoostingClassifier
        model = GradientBoostingClassifier(n_estimators=100, max_depth=5, random_state=42)
        model.fit(X_train, y_train)
        val_acc = model.score(X_val, y_val)
        logger.info(f"Validation accuracy: {val_acc:.4f}")
        return model

    def evaluate(self, model, X_test, y_test):
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
        preds = model.predict(X_test)
        return {
            "accuracy": float(accuracy_score(y_test, preds)),
            "precision": float(precision_score(y_test, preds, zero_division=0)),
            "recall": float(recall_score(y_test, preds, zero_division=0)),
            "f1": float(f1_score(y_test, preds, zero_division=0)),
            "test_samples": len(y_test),
        }

    def save(self, model, metrics):
        import joblib
        path = super().save(model, metrics)
        artifact_path = path.replace(".pkl", "_model.pkl")
        joblib.dump(model, artifact_path)
        return artifact_path
