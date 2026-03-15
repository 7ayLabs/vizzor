"""Trend scorer model training script."""

import logging
import numpy as np
from .pipeline import TrainingPipeline

logger = logging.getLogger(__name__)


class TrendTrainer(TrainingPipeline):
    def __init__(self):
        super().__init__("trend_scorer")

    def load_data(self):
        logger.info("Loading trend scoring training data...")
        n = 1000
        X = np.random.randn(n, 6).astype(np.float32)
        y = np.clip(X[:, 0] * 30 + X[:, 1] * 20 + np.random.randn(n) * 10, -100, 100).astype(np.float32)
        return {"X": X, "y": y}

    def preprocess(self, data):
        X, y = data["X"], data["y"]
        n = len(X)
        t1, t2 = int(n * 0.7), int(n * 0.85)
        return X[:t1], X[t1:t2], X[t2:], y[:t1], y[t1:t2], y[t2:]

    def train(self, X_train, y_train, X_val, y_val):
        from sklearn.ensemble import RandomForestRegressor
        model = RandomForestRegressor(n_estimators=100, max_depth=8, random_state=42)
        model.fit(X_train, y_train)
        val_score = model.score(X_val, y_val)
        logger.info(f"Validation R²: {val_score:.4f}")
        return model

    def evaluate(self, model, X_test, y_test):
        from sklearn.metrics import mean_absolute_error, r2_score
        preds = model.predict(X_test)
        return {
            "r2": float(r2_score(y_test, preds)),
            "mae": float(mean_absolute_error(y_test, preds)),
            "test_samples": len(y_test),
        }

    def save(self, model, metrics):
        import joblib
        path = super().save(model, metrics)
        artifact_path = path.replace(".pkl", "_model.pkl")
        joblib.dump(model, artifact_path)
        return artifact_path
