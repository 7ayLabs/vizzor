'use client';

import { API_BASE } from '@/lib/constants';

const TOOL_CATEGORIES = [
  {
    name: 'On-Chain Analysis',
    tools: [
      {
        name: 'get_token_info',
        desc: 'Token info — name, symbol, supply, holders for a contract address',
      },
      {
        name: 'analyze_wallet',
        desc: 'Wallet analysis — transaction patterns, holdings, behavioral signals',
      },
      {
        name: 'check_rug_indicators',
        desc: 'Rug detection — honeypot, liquidity lock, mint/pause, risk score',
      },
    ],
  },
  {
    name: 'Market Data',
    tools: [
      {
        name: 'get_market_data',
        desc: 'Live price, volume, market cap, 24h change for any symbol',
      },
      {
        name: 'search_token_dex',
        desc: 'DexScreener search — find tokens by name, symbol, or address',
      },
      { name: 'get_trending', desc: 'Top trending tokens from DexScreener + CoinGecko' },
    ],
  },
  {
    name: 'Security & Sentiment',
    tools: [
      {
        name: 'get_token_security',
        desc: 'GoPlus security check — honeypot, tax, mint, blacklist, holders',
      },
      { name: 'get_fear_greed', desc: 'Fear & Greed Index — current + 7-day history' },
      {
        name: 'get_derivatives_data',
        desc: 'Binance Futures — funding rate, open interest, mark price',
      },
    ],
  },
  {
    name: 'News & Fundraising',
    tools: [
      { name: 'get_crypto_news', desc: 'CryptoPanic headlines with sentiment analysis' },
      { name: 'get_raises', desc: 'DeFiLlama — recent fundraising rounds, amounts, investors' },
      { name: 'search_upcoming_icos', desc: 'Upcoming ICOs and launches by category/chain' },
      { name: 'get_funding_history', desc: 'Complete funding history for a project or investor' },
    ],
  },
  {
    name: 'Technical Analysis & Prediction',
    tools: [
      {
        name: 'get_technical_analysis',
        desc: 'RSI, MACD, Bollinger Bands, EMA, ATR — composite direction',
      },
      {
        name: 'get_prediction',
        desc: 'Multi-signal composite prediction (tech + sentiment + derivatives)',
      },
    ],
  },
  {
    name: 'ML-Enhanced',
    tools: [
      {
        name: 'get_ml_prediction',
        desc: 'LSTM/RF model prediction — direction, probability, confidence',
      },
      { name: 'get_model_accuracy', desc: 'Model accuracy stats — % correct by direction' },
      { name: 'get_rug_ml_analysis', desc: 'ML rug detection — bytecode + GoPlus features' },
      {
        name: 'get_wallet_behavior',
        desc: 'LSTM behavior classification — whale, bot, sniper, etc.',
      },
      {
        name: 'analyze_news_sentiment',
        desc: 'DistilBERT NLP sentiment — bullish/bearish/neutral',
      },
      { name: 'get_market_regime', desc: 'HMM regime detection — bull, bear, ranging, volatile' },
      {
        name: 'get_ta_ml_analysis',
        desc: 'RF-weighted technical analysis — more accurate signals',
      },
      { name: 'get_project_risk_ml', desc: 'GBM risk classifier with feature importance' },
      {
        name: 'get_portfolio_forecast',
        desc: 'ML forward-looking performance predictions for agents',
      },
      { name: 'get_ml_model_health', desc: 'Health status of all ML models' },
      { name: 'classify_user_intent', desc: 'NLP intent classification for user queries' },
    ],
  },
  {
    name: 'Agents & Backtesting',
    tools: [
      { name: 'create_agent', desc: 'Create autonomous trading agent with strategy and pairs' },
      { name: 'list_agents', desc: 'List all agents with status and configuration' },
      { name: 'get_agent_status', desc: 'Detailed agent status — cycles, recent signals' },
      { name: 'run_backtest', desc: 'Historical backtest with metrics and simulated trades' },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="p-3 sm:p-5 max-w-4xl">
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-lg font-bold">Documentation</h2>
      </div>

      {/* Chat usage */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 mb-4">
        <h3 className="text-sm font-bold mb-2">AI Chat</h3>
        <p className="text-xs text-[var(--muted)] mb-3">
          The AI Chat is your primary interface to Vizzor. Ask natural language questions and the AI
          will automatically call the right tools to fetch live data and provide analysis.
        </p>
        <div className="space-y-1 text-xs">
          <p className="text-[var(--foreground)]">Example queries:</p>
          <ul className="list-disc list-inside text-[var(--muted)] space-y-0.5">
            <li>&quot;What is the price of BTC?&quot;</li>
            <li>&quot;Show me trending tokens on Solana&quot;</li>
            <li>&quot;Is this token safe? 0x1234...&quot;</li>
            <li>&quot;Predict ETH for the next week&quot;</li>
            <li>&quot;Analyze wallet 0xdead...&quot;</li>
            <li>&quot;What are the latest crypto news?&quot;</li>
            <li>&quot;Create an agent named alpha with momentum strategy&quot;</li>
          </ul>
        </div>
      </div>

      {/* API docs link */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 mb-4">
        <h3 className="text-sm font-bold mb-2">REST API</h3>
        <p className="text-xs text-[var(--muted)]">
          The Vizzor API is available at <code className="text-[var(--primary)]">{API_BASE}</code>.
          Interactive OpenAPI docs are available at{' '}
          <a
            href={`${API_BASE}/docs`}
            target="_blank"
            rel="noopener"
            className="text-[var(--primary)] underline"
          >
            /docs
          </a>{' '}
          in development mode.
        </p>
      </div>

      {/* Tools reference */}
      <h3 className="text-sm font-bold mb-3">
        Available AI Tools ({TOOL_CATEGORIES.reduce((acc, c) => acc + c.tools.length, 0)})
      </h3>
      <div className="space-y-4">
        {TOOL_CATEGORIES.map((cat) => (
          <div
            key={cat.name}
            className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4"
          >
            <h4 className="text-xs font-bold text-[var(--primary)] mb-2">{cat.name}</h4>
            <div className="space-y-1.5">
              {cat.tools.map((tool) => (
                <div key={tool.name} className="flex items-start gap-2 text-xs">
                  <code className="shrink-0 text-[10px] text-[var(--accent-purple)] bg-[var(--background)] px-1.5 py-0.5 rounded font-mono">
                    {tool.name}
                  </code>
                  <span className="text-[var(--muted)]">{tool.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
