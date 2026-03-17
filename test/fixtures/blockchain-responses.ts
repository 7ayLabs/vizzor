// ---------------------------------------------------------------------------
// Mock data for blockchain fundamentals tests — v0.12.5
// ---------------------------------------------------------------------------

export const mockBlockchainInfoHashrate = 750000000000;
export const mockBlockchainInfoDifficulty = 95672703408e6;
export const mockBlockchainInfoBlockCount = 889_000;
export const mockBlockchainInfoTotalBtc = 1974000000000000; // in satoshis

export const mockMempoolInfo = {
  count: 45000,
  vsize: 125000000,
  total_fee: 2.5,
};

export const mockDifficultyAdjustment = {
  progressPercent: 45.2,
  difficultyChange: 2.3,
  estimatedRetargetDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
  remainingBlocks: 1120,
  remainingTime: 672000,
};

export const mockHashrateMining = {
  currentHashrate: 750000000000000000000, // H/s
  currentDifficulty: 95672703408000000,
};

export const mockFeesRecommended = {
  fastestFee: 25,
  halfHourFee: 15,
  hourFee: 8,
};

export const mockMarketCapChart = {
  values: [
    { x: Date.now() - 4 * 86400000, y: 1.8e12 },
    { x: Date.now() - 3 * 86400000, y: 1.82e12 },
    { x: Date.now() - 2 * 86400000, y: 1.85e12 },
    { x: Date.now() - 86400000, y: 1.87e12 },
    { x: Date.now(), y: 1.9e12 },
  ],
};

export const mockTxVolumeChart = {
  values: [
    { x: Date.now() - 4 * 86400000, y: 30e9 },
    { x: Date.now() - 3 * 86400000, y: 32e9 },
    { x: Date.now() - 2 * 86400000, y: 28e9 },
    { x: Date.now() - 86400000, y: 35e9 },
    { x: Date.now(), y: 33e9 },
  ],
};

export const mockPriceChart3Y = {
  values: Array.from({ length: 365 }, (_, i) => ({
    x: Date.now() - (365 - i) * 86400000,
    y: 40000 + Math.sin(i * 0.05) * 20000 + i * 50,
  })),
};

export const mockTotalBitcoinsChart = {
  values: [
    { x: Date.now() - 86400000, y: 19_700_000 },
    { x: Date.now(), y: 19_700_050 },
  ],
};

export const mockTxFeesChart = {
  values: Array.from({ length: 30 }, (_, i) => ({
    x: Date.now() - (30 - i) * 86400000,
    y: 500000 + Math.random() * 200000,
  })),
};

export const mockMinerRevenueChart = {
  values: Array.from({ length: 30 }, (_, i) => ({
    x: Date.now() - (30 - i) * 86400000,
    y: 30000000 + Math.random() * 5000000,
  })),
};

// Halving cycle reference data
export const HALVING_BLOCK_INTERVALS = {
  epoch0: 0, // Genesis
  epoch1: 210_000, // 2012
  epoch2: 420_000, // 2016
  epoch3: 630_000, // 2020
  epoch4: 840_000, // 2024
  epoch5: 1_050_000, // 2028 (future)
};

// Expected phase boundaries for epoch 4 (blocks 840,000 - 1,050,000)
export const EPOCH4_PHASES = {
  accumulationEnd: 840_000 + Math.round(210_000 * 0.35), // 913,500
  earlyMarkupEnd: 840_000 + Math.round(210_000 * 0.55), // 955,500
  lateMarkupEnd: 840_000 + Math.round(210_000 * 0.7), // 987,000
  distributionEnd: 840_000 + Math.round(210_000 * 0.85), // 1,018,500
  markdownEnd: 1_050_000,
};
