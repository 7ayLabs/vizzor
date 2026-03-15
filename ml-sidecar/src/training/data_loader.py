"""Data loader — reads OHLCV from PostgreSQL for model training."""

import os

import numpy as np
import pandas as pd
import psycopg2


def get_connection():
    """Create PostgreSQL connection from DATABASE_URL env var."""
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return psycopg2.connect(url)


def load_ohlcv(symbol: str, timeframe: str = "4h", days: int = 90) -> pd.DataFrame:
    """Load OHLCV data for a symbol from PostgreSQL.

    Returns DataFrame with columns: time, open, high, low, close, volume, trades
    """
    conn = get_connection()
    query = """
        SELECT time, open, high, low, close, volume, trades
        FROM ohlcv
        WHERE symbol = %s AND timeframe = %s AND time >= NOW() - make_interval(days => %s)
        ORDER BY time ASC
    """
    df = pd.read_sql(query, conn, params=(symbol, timeframe, days))
    conn.close()
    return df


def create_sequences(df: pd.DataFrame, window: int = 100, horizon: int = 4):
    """Create training sequences from OHLCV DataFrame.

    Args:
        df: OHLCV DataFrame
        window: lookback window size
        horizon: prediction horizon in candles

    Returns:
        X: numpy array of shape (n_samples, window, n_features)
        y: numpy array of labels (0=down, 1=sideways, 2=up)
    """
    cols = ["open", "high", "low", "close", "volume"]
    data = df[cols].values

    # Normalize each window independently
    X, y = [], []
    for i in range(window, len(data) - horizon):
        window_data = data[i - window : i]
        # Normalize by first close in window
        base_price = window_data[0, 3]
        if base_price == 0:
            continue
        normalized = window_data / base_price
        X.append(normalized)

        # Label: price change over horizon
        future_close = data[i + horizon - 1, 3]
        current_close = data[i - 1, 3]
        pct_change = (future_close - current_close) / current_close * 100

        if pct_change > 1.0:
            y.append(2)  # up
        elif pct_change < -1.0:
            y.append(0)  # down
        else:
            y.append(1)  # sideways

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int64)


def load_signals_dataset(days: int = 90) -> pd.DataFrame:
    """Load agent decisions with outcomes for signal classifier training.

    Returns DataFrame with signal features and outcome labels.
    """
    conn = get_connection()
    query = """
        SELECT
            d.signals,
            d.action,
            d.confidence,
            d.created_at,
            d.symbol
        FROM agent_decisions d
        WHERE d.created_at >= EXTRACT(EPOCH FROM NOW() - make_interval(days => %s)) * 1000
        ORDER BY d.created_at ASC
    """
    df = pd.read_sql(query, conn, params=(days,))
    conn.close()
    return df


def load_predictions(days: int = 30) -> pd.DataFrame:
    """Load model predictions with actual outcomes for evaluation.

    Returns DataFrame with prediction features, predicted labels, and actual labels.
    """
    conn = get_connection()
    query = """
        SELECT
            p.model_name,
            p.symbol,
            p.predicted_label,
            p.actual_label,
            p.confidence,
            p.features,
            p.created_at
        FROM model_predictions p
        WHERE p.created_at >= EXTRACT(EPOCH FROM NOW() - make_interval(days => %s)) * 1000
          AND p.actual_label IS NOT NULL
        ORDER BY p.created_at ASC
    """
    df = pd.read_sql(query, conn, params=(days,))
    conn.close()
    return df


def load_rug_labels(days: int = 180) -> pd.DataFrame:
    """Load labelled rug pull data for supervised training.

    Returns DataFrame with contract features and rug pull labels (0 = safe, 1 = rug).
    """
    conn = get_connection()
    query = """
        SELECT
            r.contract_address,
            r.chain,
            r.bytecode_size,
            r.is_verified,
            r.holder_concentration,
            r.has_proxy,
            r.has_mint,
            r.has_pause,
            r.has_blacklist,
            r.liquidity_locked,
            r.buy_tax,
            r.sell_tax,
            r.contract_age_days,
            r.total_transfers,
            r.owner_balance_pct,
            r.is_open_source,
            r.top10_holder_pct,
            r.is_rug
        FROM rug_labels r
        WHERE r.created_at >= EXTRACT(EPOCH FROM NOW() - make_interval(days => %s)) * 1000
        ORDER BY r.created_at ASC
    """
    df = pd.read_sql(query, conn, params=(days,))
    conn.close()
    return df


def generate_labels(
    df: pd.DataFrame,
    horizon: int = 4,
    up_threshold: float = 1.0,
    down_threshold: float = -1.0,
) -> np.ndarray:
    """Generate classification labels from OHLCV data based on forward returns.

    Args:
        df: OHLCV DataFrame with a 'close' column.
        horizon: Number of candles to look forward.
        up_threshold: Percentage threshold for 'up' label.
        down_threshold: Percentage threshold for 'down' label.

    Returns:
        numpy array of labels: 0 = down, 1 = sideways, 2 = up.
        Array length is len(df) - horizon (last `horizon` rows have no label).
    """
    closes = df["close"].values
    n = len(closes) - horizon
    labels = np.empty(n, dtype=np.int64)

    for i in range(n):
        current = closes[i]
        future = closes[i + horizon]
        if current == 0:
            labels[i] = 1  # sideways fallback
            continue
        pct_change = (future - current) / current * 100

        if pct_change > up_threshold:
            labels[i] = 2  # up
        elif pct_change < down_threshold:
            labels[i] = 0  # down
        else:
            labels[i] = 1  # sideways

    return labels
