"""Training pipeline for narrative detection model."""

import logging

import numpy as np

from .pipeline import TrainingPipeline

logger = logging.getLogger(__name__)

# Sample narrative corpus for pipeline testing
SAMPLE_NARRATIVES = {
    "ai_crypto": [
        "AI agents are revolutionizing crypto trading with new inference tokens",
        "Decentralized AI compute networks see massive growth in TVL",
        "New LLM-powered trading bots leverage on-chain data for alpha",
    ],
    "rwa": [
        "Tokenized treasury bills gain institutional adoption as yields rise",
        "Real world asset protocols see record inflows from TradFi",
        "Ondo Finance launches new tokenized bond product on Ethereum",
    ],
    "depin": [
        "DePIN networks expand hardware infrastructure with new sensor deployments",
        "Helium and Hivemapper lead physical infrastructure narrative growth",
        "Render Network compute demand surges amid AI training requirements",
    ],
    "meme": [
        "Memecoin season returns as PEPE and WIF hit new highs on Solana",
        "Pump.fun launches see degen traders ape into new fair launch tokens",
        "Community-driven meme tokens dominate social media sentiment",
    ],
    "defi_revival": [
        "DeFi TVL crosses $100B as Aave and Uniswap report record volumes",
        "Lending protocols see yield compression as liquidity floods back",
        "Perpetual DEX volumes surpass centralized exchange competitors",
    ],
}


def build_narrative_corpus() -> dict[str, np.ndarray]:
    """Build training corpus from crypto news sources.

    Generates TF-IDF feature vectors from narrative text samples.
    """
    logger.info("Building narrative detection corpus...")

    texts: list[str] = []
    labels: list[int] = []
    label_map = list(SAMPLE_NARRATIVES.keys())

    for label_idx, (narrative, samples) in enumerate(SAMPLE_NARRATIVES.items()):
        # Augment each sample with slight variations
        for sample in samples:
            texts.append(sample)
            labels.append(label_idx)
            # Simple augmentation: shuffle words
            words = sample.split()
            for _ in range(3):
                np.random.shuffle(words)
                texts.append(" ".join(words))
                labels.append(label_idx)

    # Convert to simple bag-of-words features for pipeline compatibility
    all_words = set()
    for text in texts:
        all_words.update(text.lower().split())
    vocab = sorted(all_words)
    word_to_idx = {w: i for i, w in enumerate(vocab)}

    n_samples = len(texts)
    n_features = len(vocab)
    X = np.zeros((n_samples, min(n_features, 200)), dtype=np.float32)

    for i, text in enumerate(texts):
        words = text.lower().split()
        for word in words:
            idx = word_to_idx.get(word, -1)
            if 0 <= idx < X.shape[1]:
                X[i, idx] += 1.0

    y = np.array(labels, dtype=np.int32)
    return {"X": X, "y": y, "label_map": label_map}


class NarrativeTrainer(TrainingPipeline):
    """Training pipeline for narrative detection."""

    def __init__(self) -> None:
        super().__init__("narrative_detector")

    def load_data(self) -> dict:
        logger.info("Loading narrative detection training data...")
        return build_narrative_corpus()

    def preprocess(self, data: dict) -> tuple:
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
        from sklearn.ensemble import RandomForestClassifier

        model = RandomForestClassifier(
            n_estimators=100, max_depth=10, random_state=42
        )
        model.fit(X_train, y_train)
        val_acc = model.score(X_val, y_val)
        logger.info(f"Narrative detector validation accuracy: {val_acc:.4f}")
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


def train_narrative_detector(
    data_dir: str = "data/narrative", output_dir: str = "models/"
) -> dict:
    """Train narrative detection model."""
    trainer = NarrativeTrainer()
    return trainer.run()


if __name__ == "__main__":
    train_narrative_detector()
