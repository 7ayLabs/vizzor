"""Vizzor ML Sidecar — FastAPI server for ML inference."""

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from .models.lstm_predictor import LSTMPredictor
from .models.signal_classifier import SignalClassifier
from .models.anomaly_detector import AnomalyDetector

# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class FeatureVector(BaseModel):
    rsi: float = 50.0
    macdHistogram: float = 0.0
    bollingerPercentB: float = 0.5
    ema12: float = 0.0
    ema26: float = 0.0
    atr: float = 0.0
    obv: float = 0.0
    fundingRate: float = 0.0
    fearGreed: float = 50.0
    priceChange24h: float = 0.0
    rsiSlope: float = 0.0
    volumeRatio: float = 1.0
    emaCrossoverPct: float = 0.0
    atrPct: float = 0.0
    symbol: str = "BTC"
    timestamp: int = 0


class PredictionResponse(BaseModel):
    symbol: str
    direction: str  # up | down | sideways
    probability: float
    model: str
    horizon: str
    confidence: int


class BatchRequest(BaseModel):
    features: list[FeatureVector]


class BatchResponse(BaseModel):
    predictions: list[PredictionResponse]


class TokenFlow(BaseModel):
    symbol: str
    amount: float
    from_addr: str = ""
    to_addr: str = ""
    timestamp: int = 0
    type: str = "transfer"


class FlowRequest(BaseModel):
    flows: list[TokenFlow]


class AnomalyResponse(BaseModel):
    symbol: str
    score: float
    isAnomaly: bool
    type: str
    details: str


class AnomaliesResponse(BaseModel):
    anomalies: list[AnomalyResponse]


# ---------------------------------------------------------------------------
# Model instances
# ---------------------------------------------------------------------------

lstm = LSTMPredictor()
classifier = SignalClassifier()
anomaly_detector = AnomalyDetector()
start_time = time.time()
predictions_served = 0


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load models on startup."""
    lstm.load()
    classifier.load()
    anomaly_detector.load()
    yield


app = FastAPI(
    title="Vizzor ML Sidecar",
    version="0.6.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.post("/predict", response_model=PredictionResponse)
async def predict(features: FeatureVector) -> PredictionResponse:
    global predictions_served
    predictions_served += 1

    # Use signal classifier for primary prediction
    result = classifier.predict(features.model_dump())

    return PredictionResponse(
        symbol=features.symbol,
        direction=result["direction"],
        probability=result["probability"],
        model=result["model"],
        horizon="4h",
        confidence=int(result["probability"] * 100),
    )


@app.post("/predict/batch", response_model=BatchResponse)
async def predict_batch(req: BatchRequest) -> BatchResponse:
    global predictions_served
    predictions_served += len(req.features)

    preds = []
    for fv in req.features:
        result = classifier.predict(fv.model_dump())
        preds.append(
            PredictionResponse(
                symbol=fv.symbol,
                direction=result["direction"],
                probability=result["probability"],
                model=result["model"],
                horizon="4h",
                confidence=int(result["probability"] * 100),
            )
        )
    return BatchResponse(predictions=preds)


@app.post("/anomalies", response_model=AnomaliesResponse)
async def detect_anomalies(req: FlowRequest) -> AnomaliesResponse:
    results = []
    for flow in req.flows:
        result = anomaly_detector.detect(flow.model_dump())
        results.append(
            AnomalyResponse(
                symbol=flow.symbol,
                score=result["score"],
                isAnomaly=result["is_anomaly"],
                type=result["type"],
                details=result["details"],
            )
        )
    return AnomaliesResponse(anomalies=results)


@app.get("/health")
async def health():
    return {
        "models": [
            {
                "name": "lstm-predictor",
                "version": lstm.version,
                "loaded": lstm.is_loaded,
                "lastTrained": lstm.last_trained,
                "accuracy": lstm.accuracy,
            },
            {
                "name": "signal-classifier",
                "version": classifier.version,
                "loaded": classifier.is_loaded,
                "lastTrained": classifier.last_trained,
                "accuracy": classifier.accuracy,
            },
            {
                "name": "anomaly-detector",
                "version": anomaly_detector.version,
                "loaded": anomaly_detector.is_loaded,
                "lastTrained": anomaly_detector.last_trained,
                "accuracy": None,
            },
        ],
        "uptime": int(time.time() - start_time),
        "predictionsServed": predictions_served,
    }
