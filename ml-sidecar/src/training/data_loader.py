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
