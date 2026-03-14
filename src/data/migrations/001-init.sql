-- Vizzor PostgreSQL + TimescaleDB initial schema
-- Requires: PostgreSQL 15+ with TimescaleDB extension

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Cache table (mirrors SQLite cache)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache (expires_at);

-- ---------------------------------------------------------------------------
-- Agent tables (mirrors SQLite agents)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  strategy TEXT NOT NULL,
  pairs JSONB NOT NULL,
  interval_seconds INTEGER NOT NULL DEFAULT 60,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_decisions (
  id BIGSERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  reasoning JSONB NOT NULL,
  signals JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_agent ON agent_decisions (agent_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- OHLCV time-series (TimescaleDB hypertable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ohlcv (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume DOUBLE PRECISION NOT NULL,
  trades INTEGER NOT NULL DEFAULT 0
);

-- Convert to hypertable (idempotent check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'ohlcv'
  ) THEN
    PERFORM create_hypertable('ohlcv', 'time');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_tf ON ohlcv (symbol, timeframe, time DESC);

-- Unique constraint to prevent duplicate candles
CREATE UNIQUE INDEX IF NOT EXISTS idx_ohlcv_unique
  ON ohlcv (symbol, timeframe, time);

-- ---------------------------------------------------------------------------
-- ML predictions tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  model TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down', 'sideways')),
  probability DOUBLE PRECISION NOT NULL,
  horizon TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '{}',
  actual_outcome TEXT,
  actual_change_pct DOUBLE PRECISION,
  was_correct BOOLEAN,
  predicted_at TIMESTAMPTZ NOT NULL,
  evaluated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_predictions_model ON predictions (model, predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_symbol ON predictions (symbol, predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_eval ON predictions (model, was_correct)
  WHERE was_correct IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Market snapshots (enriched data for ML features)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_snapshots (
  time TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  volume_24h DOUBLE PRECISION,
  market_cap DOUBLE PRECISION,
  fear_greed INTEGER,
  funding_rate DOUBLE PRECISION,
  open_interest DOUBLE PRECISION,
  rsi DOUBLE PRECISION,
  macd_histogram DOUBLE PRECISION,
  bollinger_pct_b DOUBLE PRECISION
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'market_snapshots'
  ) THEN
    PERFORM create_hypertable('market_snapshots', 'time');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_snapshots_symbol ON market_snapshots (symbol, time DESC);

-- ---------------------------------------------------------------------------
-- Alerts log (for n8n dedup and analytics)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  symbol TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts (type, created_at DESC);

-- ---------------------------------------------------------------------------
-- API keys (for REST API auth)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  rate_limit INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash) WHERE revoked_at IS NULL;
