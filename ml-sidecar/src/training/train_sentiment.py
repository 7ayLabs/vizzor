"""Sentiment NLP model training script."""

import logging
import numpy as np
from .pipeline import TrainingPipeline

logger = logging.getLogger(__name__)


class SentimentTrainer(TrainingPipeline):
    def __init__(self):
        super().__init__("sentiment_nlp")

    def load_data(self):
        logger.info("Loading sentiment training data...")
        n = 500
        X = [f"Headline {i} about crypto" for i in range(n)]
        y = np.random.choice(["bullish", "bearish", "neutral"], size=n)
        return {"X": X, "y": y}

    def preprocess(self, data):
        X, y = data["X"], data["y"]
        n = len(X)
        t1, t2 = int(n * 0.7), int(n * 0.85)
        return X[:t1], X[t1:t2], X[t2:], y[:t1], y[t1:t2], y[t2:]

    def train(self, X_train, y_train, X_val, y_val):
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import Pipeline

        model = Pipeline([
            ("tfidf", TfidfVectorizer(max_features=5000)),
            ("clf", LogisticRegression(max_iter=1000)),
        ])
        model.fit(X_train, y_train)
        val_acc = model.score(X_val, y_val)
        logger.info(f"Validation accuracy: {val_acc:.4f}")
        return model

    def evaluate(self, model, X_test, y_test):
        from sklearn.metrics import accuracy_score, classification_report
        preds = model.predict(X_test)
        return {
            "accuracy": float(accuracy_score(y_test, preds)),
            "test_samples": len(y_test),
        }

    def save(self, model, metrics):
        import joblib
        path = super().save(model, metrics)
        artifact_path = path.replace(".pkl", "_model.pkl")
        joblib.dump(model, artifact_path)
        return artifact_path
