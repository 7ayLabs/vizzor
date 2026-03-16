"""Training script for the Random Forest signal classifier."""

import os
from pathlib import Path

import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

from .data_loader import load_ohlcv

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

SYMBOLS = [
    "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX",
    "LINK", "UNI", "ATOM", "NEAR", "ARB", "OP", "SUI", "APT",
]

# Simple TA feature computation from raw OHLCV
def compute_features(df):
    """Compute TA features from OHLCV DataFrame for classifier training."""
    closes = df["close"].values
    highs = df["high"].values
    lows = df["low"].values
    volumes = df["volume"].values

    features, labels = [], []

    for i in range(50, len(closes) - 4):
        window = closes[i - 50 : i]

        # RSI(14)
        deltas = np.diff(window[-15:])
        gains = np.maximum(deltas, 0)
        losses = np.abs(np.minimum(deltas, 0))
        avg_gain = np.mean(gains) if len(gains) > 0 else 0
        avg_loss = np.mean(losses) if len(losses) > 0 else 1e-10
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))

        # EMA12, EMA26
        ema12 = np.mean(window[-12:])
        ema26 = np.mean(window[-26:])

        # MACD histogram proxy
        macd_hist = ema12 - ema26

        # ATR(14)
        atr_vals = []
        for j in range(i - 14, i):
            tr = max(
                highs[j] - lows[j],
                abs(highs[j] - closes[j - 1]),
                abs(lows[j] - closes[j - 1]),
            )
            atr_vals.append(tr)
        atr = np.mean(atr_vals)

        # Volume ratio
        vol_avg = np.mean(volumes[i - 20 : i])
        vol_ratio = volumes[i] / vol_avg if vol_avg > 0 else 1

        # Bollinger %B
        sma20 = np.mean(window[-20:])
        std20 = np.std(window[-20:])
        upper = sma20 + 2 * std20
        lower = sma20 - 2 * std20
        bb_pctb = (closes[i] - lower) / (upper - lower) if (upper - lower) > 0 else 0.5

        # Price as base
        price = closes[i]
        ema_cross_pct = ((ema12 - ema26) / price * 100) if price > 0 else 0
        atr_pct = (atr / price * 100) if price > 0 else 0

        # RSI slope (3 periods)
        if i >= 53:
            older_window = closes[i - 53 : i - 3]
            older_deltas = np.diff(older_window[-15:])
            older_gains = np.maximum(older_deltas, 0)
            older_losses = np.abs(np.minimum(older_deltas, 0))
            older_rs = np.mean(older_gains) / (np.mean(older_losses) + 1e-10)
            older_rsi = 100 - (100 / (1 + older_rs))
            rsi_slope = rsi - older_rsi
        else:
            rsi_slope = 0

        feat = [
            rsi, macd_hist, bb_pctb, ema12, ema26,
            atr, 0,  # OBV placeholder
            0,  # funding rate placeholder
            50,  # fear/greed placeholder
            0,  # price change 24h placeholder
            rsi_slope, vol_ratio, ema_cross_pct, atr_pct,
        ]
        features.append(feat)

        # Label: 4-candle forward return
        future_close = closes[i + 4]
        pct = (future_close - price) / price * 100
        if pct > 1.0:
            labels.append("buy")
        elif pct < -1.0:
            labels.append("sell")
        else:
            labels.append("hold")

    return np.array(features, dtype=np.float32), np.array(labels)


def train(days: int = 90):
    """Train Random Forest classifier on historical data."""
    print(f"Loading data ({days} days)...")

    all_X, all_y = [], []
    for symbol in SYMBOLS:
        try:
            df = load_ohlcv(symbol, "4h", days)
            if len(df) < 100:
                print(f"  {symbol}: insufficient data ({len(df)} rows), skipping")
                continue
            X, y = compute_features(df)
            all_X.append(X)
            all_y.append(y)
            print(f"  {symbol}: {len(X)} samples")
        except Exception as e:
            print(f"  {symbol}: error — {e}")

    if not all_X:
        print("No training data available.")
        return

    X = np.concatenate(all_X)
    y = np.concatenate(all_y)
    unique, counts = np.unique(y, return_counts=True)
    print(f"Total: {len(X)} samples, classes: {dict(zip(unique, counts))}")

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_split=10,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))

    accuracy = (y_pred == y_test).mean()
    print(f"Test accuracy: {accuracy:.3f}")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_DIR / "signal_classifier.joblib")
    print(f"Model saved to {MODEL_DIR / 'signal_classifier.joblib'}")


if __name__ == "__main__":
    train()
