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
from .models.trend_scorer import TrendScorer
from .models.ta_interpreter import TAInterpreter
from .models.regime_detector import RegimeDetector
from .models.strategy_bandit import StrategyBandit
from .models.project_risk_scorer import ProjectRiskScorer
from .models.portfolio_optimizer import PortfolioOptimizer
from .models.intent_classifier import IntentClassifier

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


# --- Trend Scoring ---


class TrendFeatures(BaseModel):
    price_change_24h: float = 0.0
    price_change_7d: float = 0.0
    volume_24h: float = 0.0
    market_cap: float = 0.0
    volume_to_mcap_ratio: float = 0.0
    rank: float = 0.0


class TrendScoreResponse(BaseModel):
    score: float
    direction: str
    confidence: float
    feature_importances: dict[str, float]
    model: str


# --- TA Interpretation ---


class TAFeatures(BaseModel):
    rsi: float = 50.0
    macd_histogram: float = 0.0
    macd_line: float = 0.0
    macd_signal: float = 0.0
    bb_percent_b: float = 0.5
    bb_bandwidth: float = 0.0
    ema12: float = 0.0
    ema26: float = 0.0
    ema_cross_pct: float = 0.0
    atr: float = 0.0
    atr_pct: float = 0.0
    obv: float = 0.0
    price_change: float = 0.0


class TASignal(BaseModel):
    name: str
    direction: str
    strength: float
    description: str


class TAResponse(BaseModel):
    signals: list[TASignal]
    weights: dict[str, float]
    composite: dict[str, object]
    model: str


# --- Strategy Bandit ---


class StrategyFeatures(BaseModel):
    rsi: float = 50.0
    macd_histogram: float = 0.0
    ema12: float = 0.0
    ema26: float = 0.0
    bollinger_pct_b: float = 0.5
    atr: float = 0.0
    obv: float = 0.0
    funding_rate: float = 0.0
    fear_greed: float = 50.0
    price_change_24h: float = 0.0
    price: float = 0.0
    regime: str = "ranging"


class StrategyResponse(BaseModel):
    action: str
    confidence: float
    position_size_pct: float
    reasoning: list[str]
    model: str


# --- Regime Detection ---


class RegimeFeatures(BaseModel):
    returns_1d: float = 0.0
    returns_7d: float = 0.0
    volatility_14d: float = 3.0
    volume_ratio: float = 1.0
    rsi: float = 50.0
    bb_width: float = 0.0
    fear_greed: float = 50.0
    funding_rate: float = 0.0
    price_vs_sma200: float = 0.0


class RegimeResponse(BaseModel):
    regime: str
    confidence: float
    probabilities: dict[str, float]
    model: str


# --- Project Risk ---


class ProjectRiskFeatures(BaseModel):
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
    has_token_info: int = 1


class ProjectRiskResponse(BaseModel):
    risk_probability: float
    risk_level: str
    risk_factors: list[RugRiskFactor]
    model: str


# --- Portfolio Optimization ---


class PortfolioFeatures(BaseModel):
    total_value: float = 10000.0
    cash: float = 10000.0
    win_rate: float = 0.5
    max_drawdown: float = 0.0
    avg_win: float = 0.05
    avg_loss: float = 0.03
    regime: str = "ranging"
    atr_pct: float = 3.0


class PortfolioOptResponse(BaseModel):
    position_size_pct: float
    stop_loss_multiplier: float
    take_profit_multiplier: float
    max_allocation_pct: int
    reasoning: list[str]
    model: str


# --- Intent Classification ---


class IntentRequest(BaseModel):
    text: str


class IntentResponse(BaseModel):
    intent: str
    confidence: float
    secondary_intent: str | None
    detected_tokens: list[str]
    detected_addresses: list[str]
    model: str


# --- Bytecode Risk ---


class BytecodeFeatures(BaseModel):
    bytecode_size: int = 0
    is_verified: int = 0
    has_selfdestruct: int = 0
    has_delegatecall: int = 0
    selector_count: int = 0
    opcode_entropy: float = 0.0
    has_mint: int = 0
    has_pause: int = 0
    has_blacklist: int = 0
    has_proxy: int = 0


class BytecodeRiskResponse(BaseModel):
    rug_probability: float
    risk_level: str
    risk_factors: list[RugRiskFactor]
    model: str


# --- Portfolio Forward Prediction ---


class PortfolioPredFeatures(BaseModel):
    returns_history: list[float] = []
    sharpe_history: list[float] = []
    drawdown_history: list[float] = []


class PortfolioPredResponse(BaseModel):
    predicted_return: float
    predicted_sharpe: float
    predicted_max_drawdown: float
    confidence: float
    model: str


# ---------------------------------------------------------------------------
# Model instances
# ---------------------------------------------------------------------------

lstm = LSTMPredictor()
classifier = SignalClassifier()
anomaly_detector = AnomalyDetector()
rug_detector = RugDetector()
wallet_classifier = WalletClassifier()
sentiment_analyzer = SentimentAnalyzer()
trend_scorer = TrendScorer()
ta_interpreter = TAInterpreter()
regime_detector = RegimeDetector()
strategy_bandit = StrategyBandit()
project_risk_scorer = ProjectRiskScorer()
portfolio_optimizer = PortfolioOptimizer()
intent_classifier = IntentClassifier()
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
    trend_scorer.load()
    ta_interpreter.load()
    regime_detector.load()
    strategy_bandit.load()
    project_risk_scorer.load()
    portfolio_optimizer.load()
    intent_classifier.load()
    yield


app = FastAPI(
    title="Vizzor ML Sidecar",
    version="0.11.0",
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


# --- New v0.11.0 Endpoints ---


@app.post("/predict/trend", response_model=TrendScoreResponse)
async def predict_trend(features: TrendFeatures) -> TrendScoreResponse:
    global predictions_served
    predictions_served += 1
    result = trend_scorer.predict(features.model_dump())
    return TrendScoreResponse(**result)


@app.post("/predict/ta", response_model=TAResponse)
async def predict_ta(features: TAFeatures) -> TAResponse:
    global predictions_served
    predictions_served += 1
    result = ta_interpreter.predict(features.model_dump())
    return TAResponse(
        signals=[TASignal(**s) for s in result["signals"]],
        weights=result["weights"],
        composite=result["composite"],
        model=result["model"],
    )


@app.post("/predict/regime", response_model=RegimeResponse)
async def predict_regime(features: RegimeFeatures) -> RegimeResponse:
    global predictions_served
    predictions_served += 1
    result = regime_detector.predict(features.model_dump())
    return RegimeResponse(**result)


@app.post("/predict/strategy", response_model=StrategyResponse)
async def predict_strategy(features: StrategyFeatures) -> StrategyResponse:
    global predictions_served
    predictions_served += 1
    result = strategy_bandit.predict(features.model_dump())
    return StrategyResponse(**result)


@app.post("/predict/project-risk", response_model=ProjectRiskResponse)
async def predict_project_risk(features: ProjectRiskFeatures) -> ProjectRiskResponse:
    global predictions_served
    predictions_served += 1
    result = project_risk_scorer.predict(features.model_dump())
    return ProjectRiskResponse(
        risk_probability=result["risk_probability"],
        risk_level=result["risk_level"],
        risk_factors=[RugRiskFactor(**f) for f in result["risk_factors"]],
        model=result["model"],
    )


@app.post("/predict/portfolio-opt", response_model=PortfolioOptResponse)
async def predict_portfolio_opt(features: PortfolioFeatures) -> PortfolioOptResponse:
    global predictions_served
    predictions_served += 1
    result = portfolio_optimizer.optimize(features.model_dump())
    return PortfolioOptResponse(**result)


@app.post("/predict/intent", response_model=IntentResponse)
async def predict_intent(req: IntentRequest) -> IntentResponse:
    global predictions_served
    predictions_served += 1
    result = intent_classifier.classify(req.text)
    return IntentResponse(**result)


@app.post("/predict/bytecode-risk", response_model=BytecodeRiskResponse)
async def predict_bytecode_risk(features: BytecodeFeatures) -> BytecodeRiskResponse:
    global predictions_served
    predictions_served += 1
    # Extend rug detector with bytecode-specific features
    rug_features = {
        "bytecode_size": features.bytecode_size,
        "is_verified": features.is_verified,
        "holder_concentration": 0,
        "has_proxy": features.has_proxy,
        "has_mint": features.has_mint,
        "has_pause": features.has_pause,
        "has_blacklist": features.has_blacklist,
        "liquidity_locked": 0,
        "buy_tax": 0,
        "sell_tax": 0,
        "contract_age_days": 0,
        "total_transfers": 0,
        "owner_balance_pct": 0,
        "is_open_source": features.is_verified,
        "top10_holder_pct": 0,
    }
    result = rug_detector.predict(rug_features)

    # Adjust based on bytecode-specific features
    prob = result["rug_probability"]
    if features.has_selfdestruct:
        prob = min(1.0, prob + 0.2)
    if features.has_delegatecall:
        prob = min(1.0, prob + 0.1)
    if features.opcode_entropy < 3.0 and features.bytecode_size > 100:
        prob = min(1.0, prob + 0.05)

    risk_level = (
        "critical" if prob >= 0.75
        else "high" if prob >= 0.5
        else "medium" if prob >= 0.25
        else "low"
    )

    factors = result["risk_factors"]
    if features.has_selfdestruct:
        factors.append({"factor": "has_selfdestruct", "importance": 0.25, "value": 1})
    if features.has_delegatecall:
        factors.append({"factor": "has_delegatecall", "importance": 0.15, "value": 1})

    return BytecodeRiskResponse(
        rug_probability=round(prob, 4),
        risk_level=risk_level,
        risk_factors=[RugRiskFactor(**f) for f in factors[:5]],
        model=result["model"] + "+bytecode",
    )


@app.post("/predict/portfolio-forward", response_model=PortfolioPredResponse)
async def predict_portfolio_forward(features: PortfolioPredFeatures) -> PortfolioPredResponse:
    global predictions_served
    predictions_served += 1
    result = portfolio_optimizer.forecast(features.model_dump())
    return PortfolioPredResponse(**result)


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
            {
                "name": "trend-scorer",
                "version": trend_scorer.version,
                "loaded": trend_scorer.is_loaded,
                "lastTrained": trend_scorer.last_trained,
                "accuracy": trend_scorer.accuracy,
            },
            {
                "name": "ta-interpreter",
                "version": ta_interpreter.version,
                "loaded": ta_interpreter.is_loaded,
                "lastTrained": ta_interpreter.last_trained,
                "accuracy": ta_interpreter.accuracy,
            },
            {
                "name": "regime-detector",
                "version": regime_detector.version,
                "loaded": regime_detector.is_loaded,
                "lastTrained": regime_detector.last_trained,
                "accuracy": regime_detector.accuracy,
            },
            {
                "name": "strategy-bandit",
                "version": strategy_bandit.version,
                "loaded": strategy_bandit.is_loaded,
                "lastTrained": strategy_bandit.last_trained,
                "accuracy": strategy_bandit.accuracy,
            },
            {
                "name": "project-risk-scorer",
                "version": project_risk_scorer.version,
                "loaded": project_risk_scorer.is_loaded,
                "lastTrained": project_risk_scorer.last_trained,
                "accuracy": project_risk_scorer.accuracy,
            },
            {
                "name": "portfolio-optimizer",
                "version": portfolio_optimizer.version,
                "loaded": portfolio_optimizer.is_loaded,
                "lastTrained": portfolio_optimizer.last_trained,
                "accuracy": portfolio_optimizer.accuracy,
            },
            {
                "name": "intent-classifier",
                "version": intent_classifier.version,
                "loaded": intent_classifier.is_loaded,
                "lastTrained": intent_classifier.last_trained,
                "accuracy": intent_classifier.accuracy,
            },
        ],
        "uptime": int(time.time() - start_time),
        "predictionsServed": predictions_served,
    }
