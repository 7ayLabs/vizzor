"""Training script for the LSTM price direction predictor."""

import os
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from .data_loader import load_ohlcv, create_sequences

MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))

SYMBOLS = [
    "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX",
    "LINK", "UNI", "ATOM", "NEAR", "ARB", "OP", "SUI", "APT",
]


class PriceLSTM(nn.Module):
    """LSTM model for price direction classification."""

    def __init__(self, input_size: int = 5, hidden_size: int = 64, num_layers: int = 2):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, dropout=0.2)
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, 3),  # 3 classes: down, sideways, up
        )

    def forward(self, x):
        lstm_out, _ = self.lstm(x)
        last_hidden = lstm_out[:, -1, :]
        return self.fc(last_hidden)


def train(days: int = 90, epochs: int = 50, batch_size: int = 32, lr: float = 1e-3):
    """Train LSTM on historical OHLCV data from all major symbols."""
    print(f"Loading data ({days} days)...")

    all_X, all_y = [], []
    for symbol in SYMBOLS:
        try:
            df = load_ohlcv(symbol, "4h", days)
            if len(df) < 200:
                print(f"  {symbol}: insufficient data ({len(df)} rows), skipping")
                continue
            X, y = create_sequences(df, window=100, horizon=4)
            all_X.append(X)
            all_y.append(y)
            print(f"  {symbol}: {len(X)} sequences")
        except Exception as e:
            print(f"  {symbol}: error — {e}")

    if not all_X:
        print("No training data available. Ensure data collector has run.")
        return

    X = np.concatenate(all_X)
    y = np.concatenate(all_y)
    print(f"Total: {len(X)} sequences, class distribution: {np.bincount(y)}")

    # Split 80/20
    split = int(len(X) * 0.8)
    X_train, X_val = X[:split], X[split:]
    y_train, y_val = y[:split], y[split:]

    train_ds = TensorDataset(torch.tensor(X_train), torch.tensor(y_train))
    val_ds = TensorDataset(torch.tensor(X_val), torch.tensor(y_val))
    train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_dl = DataLoader(val_ds, batch_size=batch_size)

    model = PriceLSTM()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    criterion = nn.CrossEntropyLoss()

    best_val_acc = 0.0
    for epoch in range(epochs):
        model.train()
        total_loss = 0
        for X_batch, y_batch in train_dl:
            optimizer.zero_grad()
            output = model(X_batch)
            loss = criterion(output, y_batch)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        # Validation
        model.eval()
        correct, total = 0, 0
        with torch.no_grad():
            for X_batch, y_batch in val_dl:
                output = model(X_batch)
                preds = output.argmax(dim=-1)
                correct += (preds == y_batch).sum().item()
                total += len(y_batch)

        val_acc = correct / max(1, total)
        avg_loss = total_loss / len(train_dl)

        if (epoch + 1) % 10 == 0:
            print(f"Epoch {epoch + 1}/{epochs} — loss: {avg_loss:.4f}, val_acc: {val_acc:.3f}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            MODEL_DIR.mkdir(parents=True, exist_ok=True)
            torch.save(model, MODEL_DIR / "lstm_predictor.pt")

    print(f"Training complete. Best validation accuracy: {best_val_acc:.3f}")
    print(f"Model saved to {MODEL_DIR / 'lstm_predictor.pt'}")


if __name__ == "__main__":
    train()
