"""Training pipeline for pump detection model."""

import logging

import numpy as np

from .pipeline import TrainingPipeline

logger = logging.getLogger(__name__)


def generate_synthetic_pump_data(
    n_samples: int = 10000,
) -> dict[str, np.ndarray]:
    """Generate synthetic pump/dump training data.

    Creates realistic price return sequences with injected pump and dump events.
    Normal returns follow N(0, 0.02), pumps inject spikes > 3 std, dumps inject
    negative spikes > 3 std.

    Returns:
        dict with "X" (features) and "y" (labels: 0=normal, 1=pump, 2=dump)
    """
    rng = np.random.default_rng(42)

    # Feature dimensions: [return, volume_ratio, cusum_up, cusum_down, volatility]
    n_features = 5
    X = np.zeros((n_samples, n_features), dtype=np.float32)
    y = np.zeros(n_samples, dtype=np.int32)

    normal_std = 0.02

    for i in range(n_samples):
        event_roll = rng.random()

        if event_roll < 0.1:
            # Pump event (10%)
            ret = rng.normal(0.08, 0.03)  # Strong positive return
            vol_ratio = rng.uniform(3.0, 15.0)  # High volume
            cusum_up = rng.uniform(0.04, 0.12)
            cusum_down = rng.uniform(0.0, 0.01)
            volatility = rng.uniform(0.04, 0.10)
            y[i] = 1
        elif event_roll < 0.2:
            # Dump event (10%)
            ret = rng.normal(-0.08, 0.03)  # Strong negative return
            vol_ratio = rng.uniform(3.0, 15.0)  # High volume
            cusum_up = rng.uniform(0.0, 0.01)
            cusum_down = rng.uniform(0.04, 0.12)
            volatility = rng.uniform(0.04, 0.10)
            y[i] = 2
        else:
            # Normal (80%)
            ret = rng.normal(0, normal_std)
            vol_ratio = rng.uniform(0.5, 2.5)
            cusum_up = rng.uniform(0.0, 0.02)
            cusum_down = rng.uniform(0.0, 0.02)
            volatility = rng.uniform(0.01, 0.04)
            y[i] = 0

        X[i] = [ret, vol_ratio, cusum_up, cusum_down, volatility]

    return {"X": X, "y": y}


class PumpTrainer(TrainingPipeline):
    """Training pipeline for the CUSUM pump detector."""

    def __init__(self) -> None:
        super().__init__("pump_detector")

    def load_data(self) -> dict[str, np.ndarray]:
        logger.info("Loading pump detection training data...")
        # Use synthetic data for pipeline testing; replace with real data path
        return generate_synthetic_pump_data(n_samples=10000)

    def preprocess(self, data: dict[str, np.ndarray]) -> tuple:
        X, y = data["X"], data["y"]
        n = len(X)
        train_end = int(n * 0.7)
        val_end = int(n * 0.85)
        return (
            X[:train_end],
            X[train_end:val_end],
            X[val_end:],
            y[:train_end],
            y[train_end:val_end],
            y[val_end:],
        )

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
    ):
        from sklearn.ensemble import GradientBoostingClassifier

        model = GradientBoostingClassifier(
            n_estimators=150, max_depth=4, random_state=42
        )
        model.fit(X_train, y_train)
        val_acc = model.score(X_val, y_val)
        logger.info(f"Pump detector validation accuracy: {val_acc:.4f}")
        return model

    def evaluate(self, model, X_test: np.ndarray, y_test: np.ndarray) -> dict:
        from sklearn.metrics import (
            accuracy_score,
            f1_score,
            precision_score,
            recall_score,
        )

        preds = model.predict(X_test)
        return {
            "accuracy": float(accuracy_score(y_test, preds)),
            "precision": float(
                precision_score(y_test, preds, average="weighted", zero_division=0)
            ),
            "recall": float(
                recall_score(y_test, preds, average="weighted", zero_division=0)
            ),
            "f1": float(
                f1_score(y_test, preds, average="weighted", zero_division=0)
            ),
            "test_samples": len(y_test),
        }

    def save(self, model, metrics: dict) -> str:
        import joblib

        path = super().save(model, metrics)
        artifact_path = path.replace(".pkl", "_model.pkl")
        joblib.dump(model, artifact_path)
        return artifact_path


def train_pump_detector(
    data_dir: str = "data/pump", output_dir: str = "models/"
) -> dict:
    """Train pump detection model on labeled data."""
    trainer = PumpTrainer()
    return trainer.run()


if __name__ == "__main__":
    train_pump_detector()
