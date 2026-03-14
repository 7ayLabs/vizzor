"""Vizzor ML Sidecar — FastAPI server for ML inference."""

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from .models.lstm_predictor import LSTMPredictor
from .models.signal_classifier import SignalClassifier
from .models.anomaly_detector import AnomalyDetector
from .models.rug_detector import RugDetector
from .models.wallet_classifier import WalletClassifier
from .models.sentiment_analyzer import SentimentAnalyzer

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


# --- Rug Detection ---


class RugFeatures(BaseModel):
    bytecode_size: int = 0
    is_verified: int = 0
    holder_concentration: float = 0.0
    has_proxy: int = 0
    has_mint: int = 0
    has_pause: int = 0
    has_blacklist: int = 0
    liquidity_locked: int = 0
    buy_tax: float = 0.0
    sell_tax: float = 0.0
    contract_age_days: int = 0
    total_transfers: int = 0
    owner_balance_pct: float = 0.0
    is_open_source: int = 0
    top10_holder_pct: float = 0.0


class RugRiskFactor(BaseModel):
    factor: str
    importance: float
    value: float


class RugResponse(BaseModel):
    rug_probability: float
    risk_level: str
    risk_factors: list[RugRiskFactor]
    model: str


# --- Wallet Classification ---


class WalletFeatures(BaseModel):
    tx_count: int = 0
    avg_value_eth: float = 0.0
    max_value_eth: float = 0.0
    avg_gas_used: float = 0.0
    unique_recipients: int = 0
    unique_methods: int = 0
    time_span_hours: float = 0.0
    avg_interval_seconds: float = 3600.0
    min_interval_seconds: float = 60.0
    contract_interaction_pct: float = 0.0
    self_transfer_pct: float = 0.0
    high_value_tx_pct: float = 0.0
    failed_tx_pct: float = 0.0
    token_diversity: int = 0


class WalletResponse(BaseModel):
    behavior_type: str
    confidence: float
    risk_score: float
    secondary_type: str | None
    indicators: list[str]
    model: str


# --- Sentiment NLP ---


class SentimentRequest(BaseModel):
    text: str


class SentimentBatchRequest(BaseModel):
    texts: list[str]


class SentimentResponse(BaseModel):
    sentiment: str  # bullish | bearish | neutral
    confidence: float
    score: float  # -1 to +1
    key_topics: list[str]
    model: str


class SentimentBatchResponse(BaseModel):
    results: list[SentimentResponse]


# ---------------------------------------------------------------------------
# Model instances
# ---------------------------------------------------------------------------

lstm = LSTMPredictor()
classifier = SignalClassifier()
anomaly_detector = AnomalyDetector()
rug_detector = RugDetector()
wallet_classifier = WalletClassifier()
sentiment_analyzer = SentimentAnalyzer()
start_time = time.time()
predictions_served = 0


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load models on startup."""
    lstm.load()
    classifier.load()
    anomaly_detector.load()
    rug_detector.load()
    wallet_classifier.load()
    sentiment_analyzer.load()
    yield


app = FastAPI(
    title="Vizzor ML Sidecar",
    version="0.10.0",
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


@app.post("/predict/rug", response_model=RugResponse)
async def predict_rug(features: RugFeatures) -> RugResponse:
    global predictions_served
    predictions_served += 1

    result = rug_detector.predict(features.model_dump())

    return RugResponse(
        rug_probability=result["rug_probability"],
        risk_level=result["risk_level"],
        risk_factors=[RugRiskFactor(**f) for f in result["risk_factors"]],
        model=result["model"],
    )


@app.post("/predict/wallet", response_model=WalletResponse)
async def predict_wallet(features: WalletFeatures) -> WalletResponse:
    global predictions_served
    predictions_served += 1

    result = wallet_classifier.classify(features.model_dump())

    return WalletResponse(
        behavior_type=result["behavior_type"],
        confidence=result["confidence"],
        risk_score=result["risk_score"],
        secondary_type=result["secondary_type"],
        indicators=result["indicators"],
        model=result["model"],
    )


@app.post("/predict/sentiment", response_model=SentimentResponse)
async def predict_sentiment(req: SentimentRequest) -> SentimentResponse:
    global predictions_served
    predictions_served += 1

    result = sentiment_analyzer.analyze(req.text)

    return SentimentResponse(
        sentiment=result["sentiment"],
        confidence=result["confidence"],
        score=result["score"],
        key_topics=result["key_topics"],
        model=result["model"],
    )


@app.post("/predict/sentiment/batch", response_model=SentimentBatchResponse)
async def predict_sentiment_batch(req: SentimentBatchRequest) -> SentimentBatchResponse:
    global predictions_served
    predictions_served += len(req.texts)

    results = sentiment_analyzer.analyze_batch(req.texts)

    return SentimentBatchResponse(
        results=[
            SentimentResponse(
                sentiment=r["sentiment"],
                confidence=r["confidence"],
                score=r["score"],
                key_topics=r["key_topics"],
                model=r["model"],
            )
            for r in results
        ]
    )


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
            {
                "name": "rug-detector",
                "version": rug_detector.version,
                "loaded": rug_detector.is_loaded,
                "lastTrained": rug_detector.last_trained,
                "accuracy": rug_detector.accuracy,
            },
            {
                "name": "wallet-classifier",
                "version": wallet_classifier.version,
                "loaded": wallet_classifier.is_loaded,
                "lastTrained": wallet_classifier.last_trained,
                "accuracy": wallet_classifier.accuracy,
            },
            {
                "name": "sentiment-analyzer",
                "version": sentiment_analyzer.version,
                "loaded": sentiment_analyzer.is_loaded,
                "lastTrained": sentiment_analyzer.last_trained,
                "accuracy": sentiment_analyzer.accuracy,
            },
        ],
        "uptime": int(time.time() - start_time),
        "predictionsServed": predictions_served,
    }
