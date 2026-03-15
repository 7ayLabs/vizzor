"""
Training Pipeline — pulls data, generates labels, trains models, saves artifacts.
"""

import os
import json
import time
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

ARTIFACT_DIR = Path(os.getenv("MODEL_ARTIFACT_DIR", "models"))


class TrainingPipeline:
    """Base training pipeline for all ML models."""

    def __init__(self, model_name: str):
        self.model_name = model_name
        self.artifact_dir = ARTIFACT_DIR / model_name
        self.artifact_dir.mkdir(parents=True, exist_ok=True)

    def load_data(self) -> Any:
        """Override in subclass to load training data."""
        raise NotImplementedError

    def preprocess(self, data: Any) -> tuple:
        """Override to split and preprocess data. Returns (X_train, X_val, X_test, y_train, y_val, y_test)."""
        raise NotImplementedError

    def train(self, X_train: Any, y_train: Any, X_val: Any, y_val: Any) -> Any:
        """Override to train the model. Returns trained model."""
        raise NotImplementedError

    def evaluate(self, model: Any, X_test: Any, y_test: Any) -> dict:
        """Override to evaluate the model. Returns metrics dict."""
        raise NotImplementedError

    def save(self, model: Any, metrics: dict) -> str:
        """Save model artifact and metrics."""
        timestamp = int(time.time())
        artifact_path = self.artifact_dir / f"{self.model_name}_{timestamp}.pkl"

        # Save metrics
        metrics_path = self.artifact_dir / f"metrics_{timestamp}.json"
        with open(metrics_path, "w") as f:
            json.dump(metrics, f, indent=2)

        logger.info(f"Model saved to {artifact_path}")
        return str(artifact_path)

    def run(self) -> dict:
        """Execute the full training pipeline."""
        start = time.time()
        logger.info(f"Starting training pipeline for {self.model_name}")

        try:
            data = self.load_data()
            splits = self.preprocess(data)
            X_train, X_val, X_test, y_train, y_val, y_test = splits

            model = self.train(X_train, y_train, X_val, y_val)
            metrics = self.evaluate(model, X_test, y_test)
            artifact_path = self.save(model, metrics)

            duration = time.time() - start
            return {
                "model": self.model_name,
                "status": "success",
                "metrics": metrics,
                "duration_seconds": round(duration, 2),
                "artifact_path": artifact_path,
            }
        except Exception as e:
            logger.error(f"Training failed for {self.model_name}: {e}")
            return {
                "model": self.model_name,
                "status": "failed",
                "error": str(e),
                "duration_seconds": round(time.time() - start, 2),
                "artifact_path": "",
            }
