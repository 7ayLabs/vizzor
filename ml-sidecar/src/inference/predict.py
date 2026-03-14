"""Inference module — loads trained models and runs predictions."""

import os
from pathlib import Path

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))


def load_all_models():
    """Load all available trained models from disk.

    Returns dict of model_name -> loaded model object.
    """
    models = {}

    lstm_path = MODEL_DIR / "lstm_predictor.pt"
    if lstm_path.exists():
        import torch
        models["lstm"] = torch.load(lstm_path, weights_only=True)

    clf_path = MODEL_DIR / "signal_classifier.joblib"
    if clf_path.exists():
        import joblib
        models["classifier"] = joblib.load(clf_path)

    anomaly_path = MODEL_DIR / "anomaly_detector.joblib"
    if anomaly_path.exists():
        import joblib
        models["anomaly"] = joblib.load(anomaly_path)

    return models


def get_model_versions() -> dict[str, str]:
    """Get version info for all available models."""
    versions = {}
    for name in ["lstm_predictor.pt", "signal_classifier.joblib", "anomaly_detector.joblib"]:
        path = MODEL_DIR / name
        if path.exists():
            stat = path.stat()
            versions[name] = f"mtime:{stat.st_mtime:.0f}"
        else:
            versions[name] = "not-trained"
    return versions
