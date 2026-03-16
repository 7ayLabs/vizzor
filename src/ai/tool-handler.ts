// ---------------------------------------------------------------------------
// Shared tool handler — bridges AI tool-use to Vizzor core modules
// Extracted from TUI for reuse by Telegram, Discord, and CLI bots.
// ---------------------------------------------------------------------------

import { getAdapter } from '../chains/registry.js';
import { getConfig } from '../config/loader.js';
import { DEFAULT_CHAIN } from '../config/constants.js';
import { analyzeWallet } from '../core/forensics/wallet-analyzer.js';
import { detectRugIndicators } from '../core/forensics/rug-detector.js';
import { fetchMarketData, fetchTokenFromDex, fetchTrendingTokens } from '../core/trends/market.js';
import {
  fetchUpcomingICOs,
  searchICOs,
  getProjectFundingHistory,
  getInvestorPortfolio,
} from '../core/scanner/ico-tracker.js';
import { fetchCryptoNews } from '../data/sources/cryptopanic.js';
import { fetchRecentRaises } from '../data/sources/defillama.js';
import {
  fetchTickerPrice,
  fetchFundingRate,
  fetchOpenInterest,
  fetchKlines,
  fetchOrderBookDepth,
  fetchLongShortRatio,
  fetchTopTraderRatio,
  fetchTakerBuySellRatio,
} from '../data/sources/binance.js';
import {
  calculateVWAP,
  calculateVolumeDelta,
  detectMarketStructure,
  detectFVGs,
  detectSRZones,
  estimateLiquidationZones,
  detectSqueezeConditions,
  computePsychLevel,
} from '../core/technical-analysis/microstructure-indicators.js';
import { calculateATR } from '../core/technical-analysis/indicators.js';
import { checkTokenSecurity } from '../data/sources/goplus.js';
import { fetchFearGreedIndex } from '../data/sources/fear-greed.js';
import { analyzeTechnicals } from '../core/technical-analysis/index.js';
import { generatePrediction } from '../core/trends/predictor.js';
import { detectMarketRegime } from '../core/trends/regime.js';
import { analyzeProject } from '../core/scanner/project-analyzer.js';
import { assessRisk } from '../core/scanner/risk-scorer.js';
import {
  createAgent,
  listAgents,
  getAgentByName,
  getAgentStatus,
  getRecentDecisions,
} from '../core/agent/index.js';
import { getMLClient, initMLClient } from '../ml/client.js';
import { buildFeatureVector } from '../ml/feature-engineer.js';
import { getStoreInstance } from '../data/store-factory.js';
import { sanitizeToolResult } from './sanitize.js';

export async function handleTool(name: string, input: unknown): Promise<unknown> {
  const raw = await handleToolUnsafe(name, input);
  return sanitizeToolResult(raw);
}

async function handleToolUnsafe(name: string, input: unknown): Promise<unknown> {
  const params = input as Record<string, unknown>;

  switch (name) {
    case 'get_token_info': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? DEFAULT_CHAIN);
      const adapter = getAdapter(chain);
      await adapter.connect(undefined, getConfig().etherscanApiKey);
      const info = await adapter.getTokenInfo(address);
      return {
        address: info.address,
        name: info.name,
        symbol: info.symbol,
        decimals: info.decimals,
        totalSupply: info.totalSupply.toString(),
      };
    }

    case 'analyze_wallet': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? DEFAULT_CHAIN);
      const adapter = getAdapter(chain);
      await adapter.connect(undefined, getConfig().etherscanApiKey);
      const analysis = await analyzeWallet(address, adapter);
      return {
        address: analysis.address,
        chain: analysis.chain,
        balance: analysis.balance.toString(),
        transactionCount: analysis.transactionCount,
        riskLevel: analysis.riskLevel,
        patterns: analysis.patterns,
      };
    }

    case 'check_rug_indicators': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? DEFAULT_CHAIN);
      const adapter = getAdapter(chain);
      await adapter.connect(undefined, getConfig().etherscanApiKey);
      const indicators = await detectRugIndicators(address, adapter);
      return {
        isHoneypot: indicators.isHoneypot,
        hasLiquidityLock: indicators.hasLiquidityLock,
        ownerCanMint: indicators.ownerCanMint,
        ownerCanPause: indicators.ownerCanPause,
        hasBlacklist: indicators.hasBlacklist,
        highSellTax: indicators.highSellTax,
        riskScore: indicators.riskScore,
        details: indicators.details,
      };
    }

    case 'get_market_data': {
      const symbol = String(params['symbol'] ?? '');
      // Try Binance first (reliable, no rate limits), enrich with CoinGecko
      try {
        const binance = await fetchTickerPrice(symbol);
        const gecko = await fetchMarketData(symbol).catch(() => null);
        return {
          symbol: binance.symbol,
          name: gecko?.name ?? binance.symbol,
          price: binance.price,
          priceChange24h: binance.change24h,
          priceChange7d: gecko?.priceChange7d ?? null,
          volume24h: gecko?.volume24h ?? null,
          marketCap: gecko?.marketCap ?? null,
          rank: gecko?.rank ?? null,
          source: 'binance+coingecko',
        };
      } catch {
        // Fallback to CoinGecko only
        const data = await fetchMarketData(symbol);
        if (!data) {
          return { error: `No market data found for "${symbol}"` };
        }
        return data;
      }
    }

    case 'search_upcoming_icos': {
      const category = params['category'] ? String(params['category']) : undefined;
      const chain = params['chain'] ? String(params['chain']) : undefined;
      const roundType = params['roundType'] ? String(params['roundType']) : undefined;
      const projects =
        category || chain || roundType
          ? await searchICOs(undefined, category, chain, roundType)
          : await fetchUpcomingICOs();
      return {
        projects: projects.map((p) => ({
          name: p.name,
          category: p.category,
          chain: p.chain,
          roundType: p.roundType,
          raisedAmount: p.raisedAmount,
          valuation: p.valuation,
          investors: p.investors.slice(0, 5),
          startDate: p.startDate,
          description: p.description,
          website: p.website,
        })),
      };
    }

    case 'get_funding_history': {
      const fundingName = String(params['name'] ?? '');
      const type = String(params['type'] ?? 'project');
      if (type === 'investor') {
        const portfolio = await getInvestorPortfolio(fundingName);
        return {
          investor: fundingName,
          investments: portfolio.map((p) => ({
            name: p.name,
            round: p.roundType,
            amount: p.raisedAmount,
            chain: p.chain,
            category: p.category,
            date: p.startDate,
          })),
        };
      }
      const history = await getProjectFundingHistory(fundingName);
      return {
        project: history.name,
        rounds: history.rounds.map((r) => ({
          round: r.roundType,
          amount: r.raisedAmount,
          valuation: r.valuation,
          investors: r.investors.slice(0, 5),
          date: r.startDate,
          previousRounds: r.previousRounds,
        })),
      };
    }

    case 'search_token_dex': {
      const query = String(params['query'] ?? '');
      const pairs = await fetchTokenFromDex(query);
      return {
        results: pairs.slice(0, 5).map((p) => ({
          name: p.baseToken.name,
          symbol: p.baseToken.symbol,
          chain: p.chainId,
          dex: p.dexId,
          priceUsd: p.priceUsd,
          volume24h: p.volume?.h24 ?? 0,
          liquidity: p.liquidity?.usd ?? 0,
          priceChange24h: p.priceChange?.h24 ?? 0,
          marketCap: p.marketCap ?? p.fdv ?? null,
          buys24h: p.txns?.h24?.buys ?? 0,
          sells24h: p.txns?.h24?.sells ?? 0,
          pairAddress: p.pairAddress,
          url: p.url,
        })),
      };
    }

    case 'get_trending': {
      const trending = await fetchTrendingTokens();
      return {
        trending: trending.slice(0, 10).map((t) => ({
          name: t.name,
          symbol: t.symbol,
          chain: t.chain,
          priceUsd: t.priceUsd,
          priceChange24h: t.priceChange24h,
          volume24h: t.volume24h,
          marketCap: t.marketCap,
          source: t.source,
          url: t.url,
        })),
      };
    }

    case 'get_crypto_news': {
      const symbol = params['symbol'] ? String(params['symbol']) : undefined;
      const news = await fetchCryptoNews(symbol, getConfig().cryptopanicApiKey);
      return {
        news: news.slice(0, 10).map((n) => ({
          title: n.title,
          sentiment: n.sentiment,
          source: n.source.title,
          publishedAt: n.publishedAt,
          url: n.url,
        })),
      };
    }

    case 'get_raises': {
      const raises = await fetchRecentRaises(30);
      let filtered = raises;
      if (params['category']) {
        const cat = String(params['category']).toLowerCase();
        filtered = filtered.filter(
          (r) => r.category?.toLowerCase().includes(cat) || r.sector?.toLowerCase().includes(cat),
        );
      }
      if (params['chain']) {
        const ch = String(params['chain']).toLowerCase();
        filtered = filtered.filter((r) => r.chains.some((c) => c.toLowerCase().includes(ch)));
      }
      return {
        raises: filtered.slice(0, 10).map((r) => ({
          name: r.name,
          round: r.round,
          amount: r.amount,
          chains: r.chains,
          sector: r.sector,
          category: r.category,
          leadInvestors: r.leadInvestors,
          date: new Date(r.date * 1000).toISOString().split('T')[0],
        })),
      };
    }

    case 'get_token_security': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? 'ethereum');
      const security = await checkTokenSecurity(address, chain);
      if (!security) {
        return { error: `No security data for ${address} on ${chain}` };
      }
      return {
        contractAddress: security.contractAddress,
        chain: security.chain,
        riskLevel: security.riskLevel,
        isHoneypot: security.isHoneypot,
        isMintable: security.isMintable,
        buyTax: security.buyTax,
        sellTax: security.sellTax,
        isOpenSource: security.isOpenSource,
        isProxy: security.isProxy,
        hiddenOwner: security.hiddenOwner,
        cannotBuy: security.cannotBuy,
        cannotSellAll: security.cannotSellAll,
        isBlacklisted: security.isBlacklisted,
        holderCount: security.holderCount,
        lpHolderCount: security.lpHolderCount,
        creatorPercent: security.creatorPercent,
        ownerPercent: security.ownerPercent,
        trustList: security.trustList,
      };
    }

    case 'get_fear_greed': {
      const data = await fetchFearGreedIndex(7);
      return {
        current: { value: data.current.value, classification: data.current.classification },
        previous: data.previous
          ? { value: data.previous.value, classification: data.previous.classification }
          : null,
        history: data.history.map((h) => ({
          value: h.value,
          classification: h.classification,
          date: new Date(h.timestamp * 1000).toISOString().split('T')[0],
        })),
      };
    }

    case 'get_derivatives_data': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const [fundingResult, oiResult] = await Promise.allSettled([
        fetchFundingRate(symbol),
        fetchOpenInterest(symbol),
      ]);

      const result: Record<string, unknown> = { symbol: symbol.toUpperCase() };
      if (fundingResult.status === 'fulfilled') {
        result['fundingRate'] = fundingResult.value.fundingRate;
        result['fundingRatePct'] = `${(fundingResult.value.fundingRate * 100).toFixed(4)}%`;
        result['markPrice'] = fundingResult.value.markPrice;
      }
      if (oiResult.status === 'fulfilled') {
        result['openInterest'] = oiResult.value.openInterest;
        result['openInterestNotional'] = oiResult.value.notionalValue;
      }
      return result;
    }

    case 'get_technical_analysis': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const timeframe = String(params['timeframe'] ?? '4h');
      const ta = await analyzeTechnicals(symbol, timeframe);
      return {
        symbol: ta.symbol,
        timeframe: ta.timeframe,
        composite: ta.composite,
        signals: ta.signals.map((s) => ({
          name: s.name,
          signal: s.signal,
          strength: s.strength,
          description: s.description,
        })),
        indicators: {
          rsi: ta.indicators.rsi ? Math.round(ta.indicators.rsi * 100) / 100 : null,
          macd: ta.indicators.macd,
          bollingerBands: ta.indicators.bollingerBands,
          ema12: ta.indicators.ema12,
          ema26: ta.indicators.ema26,
          atr: ta.indicators.atr,
        },
      };
    }

    case 'get_prediction': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const prediction = await generatePrediction(symbol);
      return {
        symbol: prediction.symbol,
        direction: prediction.direction,
        confidence: prediction.confidence,
        composite: prediction.composite,
        timeframe: prediction.timeframe,
        signals: prediction.signals,
        reasoning: prediction.reasoning,
        disclaimer: prediction.disclaimer,
      };
    }

    case 'get_ml_prediction': {
      const symbol = String(params['symbol'] ?? 'BTC');
      let mlClient = getMLClient();
      if (!mlClient) {
        try {
          const cfg = getConfig();
          if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
            mlClient = initMLClient(cfg.ml.sidecarUrl);
          }
        } catch {
          // Config not loaded
        }
      }
      if (!mlClient) {
        // Fallback to rule-based prediction
        const prediction = await generatePrediction(symbol);
        return {
          ...prediction,
          mlAvailable: false,
          note: 'ML sidecar not configured; using rule-based prediction',
        };
      }
      const features = await buildFeatureVector(symbol);
      const mlPred = await mlClient.predict(features);
      if (!mlPred) {
        const prediction = await generatePrediction(symbol);
        return {
          ...prediction,
          mlAvailable: false,
          note: 'ML sidecar unavailable; using rule-based prediction',
        };
      }
      return {
        symbol: mlPred.symbol,
        direction: mlPred.direction,
        probability: mlPred.probability,
        confidence: mlPred.confidence,
        model: mlPred.model,
        horizon: mlPred.horizon,
        mlAvailable: true,
        features: {
          rsi: features.rsi,
          macdHistogram: features.macdHistogram,
          bollingerPercentB: features.bollingerPercentB,
          fundingRate: features.fundingRate,
          fearGreed: features.fearGreed,
          rsiSlope: features.rsiSlope,
          volumeRatio: features.volumeRatio,
          emaCrossoverPct: features.emaCrossoverPct,
          atrPct: features.atrPct,
        },
      };
    }

    case 'get_model_accuracy': {
      const model = String(params['model'] ?? 'lstm-predictor');
      const days = params['days'] ? Number(params['days']) : 30;
      const store = getStoreInstance();
      if (!store) {
        return { error: 'DataStore not initialized. ML accuracy requires PostgreSQL backend.' };
      }
      const accuracy = await store.getPredictionAccuracy(model, days);
      return {
        model: accuracy.model,
        period: accuracy.period,
        totalPredictions: accuracy.totalPredictions,
        correctPredictions: accuracy.correctPredictions,
        accuracy: `${(accuracy.accuracy * 100).toFixed(1)}%`,
        byDirection: {
          up: `${(accuracy.byDirection.up.accuracy * 100).toFixed(1)}% (${accuracy.byDirection.up.correct}/${accuracy.byDirection.up.total})`,
          down: `${(accuracy.byDirection.down.accuracy * 100).toFixed(1)}% (${accuracy.byDirection.down.correct}/${accuracy.byDirection.down.total})`,
          sideways: `${(accuracy.byDirection.sideways.accuracy * 100).toFixed(1)}% (${accuracy.byDirection.sideways.correct}/${accuracy.byDirection.sideways.total})`,
        },
      };
    }

    case 'get_rug_ml_analysis': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? DEFAULT_CHAIN);
      // Run both bytecode analysis + ML
      const adapter = getAdapter(chain);
      await adapter.connect(undefined, getConfig().etherscanApiKey);
      const indicators = await detectRugIndicators(address, adapter);

      // Also get GoPlus security data for enrichment
      let goplus = null;
      try {
        goplus = await checkTokenSecurity(address, chain);
      } catch {
        /* GoPlus unavailable */
      }

      // Call ML rug detector directly with enriched features
      let mlClient = getMLClient();
      if (!mlClient) {
        try {
          const cfg = getConfig();
          if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
            mlClient = initMLClient(cfg.ml.sidecarUrl);
          }
        } catch {
          /* config not loaded */
        }
      }

      let mlResult = indicators.mlAnalysis ?? null;
      if (!mlResult && mlClient && goplus) {
        mlResult =
          (await mlClient.predictRug({
            bytecode_size: 0,
            is_verified: goplus.isOpenSource ? 1 : 0,
            holder_concentration: (goplus.creatorPercent ?? 0) + (goplus.ownerPercent ?? 0),
            has_proxy: goplus.isProxy ? 1 : 0,
            has_mint: goplus.isMintable ? 1 : 0,
            has_pause: indicators.ownerCanPause ? 1 : 0,
            has_blacklist: indicators.hasBlacklist ? 1 : 0,
            liquidity_locked: 0,
            buy_tax: goplus.buyTax ?? 0,
            sell_tax: goplus.sellTax ?? 0,
            contract_age_days: 0,
            total_transfers: 0,
            owner_balance_pct: goplus.ownerPercent ?? 0,
            is_open_source: goplus.isOpenSource ? 1 : 0,
            top10_holder_pct: 0,
          })) ?? null;
      }

      return {
        address,
        chain,
        ruleBasedRiskScore: indicators.riskScore,
        mlAnalysis: mlResult ?? { note: 'ML sidecar not available' },
        indicators: {
          isHoneypot: indicators.isHoneypot,
          ownerCanMint: indicators.ownerCanMint,
          ownerCanPause: indicators.ownerCanPause,
          hasBlacklist: indicators.hasBlacklist,
          highSellTax: indicators.highSellTax,
        },
        details: indicators.details,
        goplus: goplus
          ? {
              riskLevel: goplus.riskLevel,
              buyTax: goplus.buyTax,
              sellTax: goplus.sellTax,
              isHoneypot: goplus.isHoneypot,
              isMintable: goplus.isMintable,
              holderCount: goplus.holderCount,
            }
          : null,
      };
    }

    case 'get_wallet_behavior': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? DEFAULT_CHAIN);
      const adapter = getAdapter(chain);
      await adapter.connect(undefined, getConfig().etherscanApiKey);
      const analysis = await analyzeWallet(address, adapter);
      return {
        address: analysis.address,
        chain: analysis.chain,
        balance: analysis.balance.toString(),
        transactionCount: analysis.transactionCount,
        riskLevel: analysis.riskLevel,
        patterns: analysis.patterns,
        mlBehavior: analysis.mlBehavior ?? { note: 'ML sidecar not available' },
      };
    }

    case 'analyze_news_sentiment': {
      const symbol = String(params['symbol'] ?? '');
      let mlClient = getMLClient();
      if (!mlClient) {
        try {
          const cfg = getConfig();
          if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
            mlClient = initMLClient(cfg.ml.sidecarUrl);
          }
        } catch {
          /* config not loaded */
        }
      }

      const news = await fetchCryptoNews(symbol || undefined, getConfig().cryptopanicApiKey);
      if (news.length === 0) {
        return { symbol, sentiment: 'neutral', note: 'No news found' };
      }

      const headlines = news.slice(0, 10).map((n) => n.title);

      if (mlClient) {
        const results = await mlClient.analyzeSentimentBatch(headlines);
        if (results.length > 0) {
          const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
          const avgConf = results.reduce((s, r) => s + r.confidence, 0) / results.length;
          const allTopics = [...new Set(results.flatMap((r) => r.key_topics))];
          return {
            symbol,
            sentiment: avgScore > 0.2 ? 'bullish' : avgScore < -0.2 ? 'bearish' : 'neutral',
            score: Math.round(avgScore * 1000) / 1000,
            confidence: Math.round(avgConf * 100),
            topics: allTopics.slice(0, 5),
            headlines: results.map((r, i) => ({
              title: headlines[i],
              sentiment: r.sentiment,
              score: r.score,
              confidence: r.confidence,
            })),
            model: results[0]?.model ?? 'unknown',
            articleCount: news.length,
          };
        }
      }

      // Fallback: vote-based sentiment
      let pos = 0;
      let neg = 0;
      for (const n of news) {
        if (n.sentiment === 'positive') pos++;
        else if (n.sentiment === 'negative') neg++;
      }
      const score = news.length > 0 ? (pos - neg) / news.length : 0;
      return {
        symbol,
        sentiment: score > 0.2 ? 'bullish' : score < -0.2 ? 'bearish' : 'neutral',
        score,
        confidence: 50,
        topics: [],
        headlines: headlines.map((h, i) => ({
          title: h,
          sentiment: news[i]?.sentiment ?? 'neutral',
        })),
        model: 'vote-count-fallback',
        articleCount: news.length,
      };
    }

    case 'get_market_regime': {
      const symbol = String(params['symbol'] ?? 'BTC');
      // Fetch indicators needed for regime detection
      const ta = await analyzeTechnicals(symbol, '4h');
      const [fgResult, fundingResult] = await Promise.allSettled([
        fetchFearGreedIndex(1),
        fetchFundingRate(symbol),
      ]);
      const fg = fgResult.status === 'fulfilled' ? fgResult.value.current.value : 50;
      const funding = fundingResult.status === 'fulfilled' ? fundingResult.value.fundingRate : 0;
      const price = ta.indicators.ema12 ?? 0;
      const atrVal = ta.indicators.atr ?? 0;
      const atrPct = price > 0 ? (atrVal / price) * 100 : 3;

      const regime = await detectMarketRegime(symbol, {
        returns_1d: 0,
        returns_7d: 0,
        volatility_14d: atrPct,
        volume_ratio: 1,
        rsi: ta.indicators.rsi ?? 50,
        bb_width: ta.indicators.bollingerBands
          ? ((ta.indicators.bollingerBands.upper - ta.indicators.bollingerBands.lower) /
              ta.indicators.bollingerBands.middle) *
            100
          : 0,
        fear_greed: fg,
        funding_rate: funding,
        price_vs_sma200: 0,
      });

      return {
        symbol: symbol.toUpperCase(),
        regime: regime.regime,
        confidence: regime.confidence,
        probabilities: regime.probabilities,
        model: regime.model,
      };
    }

    case 'get_ta_ml_analysis': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const timeframe = String(params['timeframe'] ?? '4h');
      const ta = await analyzeTechnicals(symbol, timeframe);
      return {
        symbol: ta.symbol,
        timeframe: ta.timeframe,
        composite: ta.composite,
        signals: ta.signals.map((s) => ({
          name: s.name,
          signal: s.signal,
          strength: s.strength,
          description: s.description,
        })),
        indicators: {
          rsi: ta.indicators.rsi ? Math.round(ta.indicators.rsi * 100) / 100 : null,
          macd: ta.indicators.macd,
          bollingerBands: ta.indicators.bollingerBands,
          ema12: ta.indicators.ema12,
          ema26: ta.indicators.ema26,
          atr: ta.indicators.atr,
        },
        note: 'ML-enhanced: signals and composite use learned weights when ML sidecar is available',
      };
    }

    case 'get_project_risk_ml': {
      const address = String(params['address'] ?? '');
      const chain = String(params['chain'] ?? DEFAULT_CHAIN);
      const adapter = getAdapter(chain);
      await adapter.connect(undefined, getConfig().etherscanApiKey);
      const analysis = await analyzeProject(address, adapter);
      const risk = assessRisk(analysis);
      return {
        address,
        chain,
        riskScore: risk.score,
        riskLevel: risk.level,
        summary: risk.summary,
        factors: risk.factors,
        mlScore: risk.mlScore ?? null,
        mlLevel: risk.mlLevel ?? null,
        token: analysis.token
          ? {
              name: analysis.token.name,
              symbol: analysis.token.symbol,
              decimals: analysis.token.decimals,
            }
          : null,
        holderConcentration: analysis.holderConcentration,
        contractVerified: analysis.contractVerified,
      };
    }

    case 'get_portfolio_forecast': {
      const agentName = String(params['agentName'] ?? '');
      const agent = getAgentByName(agentName);
      if (!agent) return { error: `Agent "${agentName}" not found` };
      // Forecast requires trade history — currently we return a placeholder
      // since the full trade store integration is agent-specific
      let mlClient = getMLClient();
      if (!mlClient) {
        try {
          const cfg = getConfig();
          if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
            mlClient = initMLClient(cfg.ml.sidecarUrl);
          }
        } catch {
          /* config not loaded */
        }
      }
      if (!mlClient) {
        return {
          agentName,
          error: 'ML sidecar not available for portfolio forecast',
        };
      }

      // Use agent state for basic forecast
      const state = getAgentStatus(agent.id);
      return {
        agentName,
        status: state?.status ?? 'idle',
        cycleCount: state?.cycleCount ?? 0,
        note: 'Portfolio forecast requires trade history. Use calculateMetricsWithForecast() in agent engine for full predictions.',
      };
    }

    case 'create_agent': {
      const agentName = String(params['name'] ?? '');
      const strategy = String(params['strategy'] ?? 'momentum');
      const pairsRaw = String(params['pairs'] ?? 'BTC,ETH');
      const interval = params['interval'] ? Number(params['interval']) : 60;
      const agentPairs = pairsRaw.split(',').map((p) => p.trim().toUpperCase());
      const agent = createAgent(agentName, strategy, agentPairs, interval);
      return {
        id: agent.id,
        name: agent.name,
        strategy: agent.strategy,
        pairs: agent.pairs,
        interval: agent.interval,
        message: `Agent "${agent.name}" created. Use /agent start ${agent.name} to activate.`,
      };
    }

    case 'list_agents': {
      const agents = listAgents();
      return {
        agents: agents.map((a) => {
          const status = getAgentStatus(a.id);
          return {
            name: a.name,
            strategy: a.strategy,
            pairs: a.pairs,
            interval: a.interval,
            status: status?.status ?? 'idle',
            cycleCount: status?.cycleCount ?? 0,
          };
        }),
      };
    }

    case 'get_agent_status': {
      const agentName = String(params['name'] ?? '');
      const agent = getAgentByName(agentName);
      if (!agent) return { error: `Agent "${agentName}" not found` };
      const state = getAgentStatus(agent.id);
      if (!state) return { error: `Agent "${agentName}" not found` };
      const decisions = getRecentDecisions(agent.id, 5);
      return {
        name: state.config.name,
        status: state.status,
        strategy: state.config.strategy,
        pairs: state.config.pairs,
        cycleCount: state.cycleCount,
        error: state.error,
        recentDecisions: decisions.map((d) => ({
          symbol: d.symbol,
          action: d.decision.action,
          confidence: d.decision.confidence,
          reasoning: d.decision.reasoning,
          timestamp: new Date(d.timestamp).toISOString(),
        })),
      };
    }

    case 'get_ml_model_health': {
      let mlClient = getMLClient();
      if (!mlClient) {
        try {
          const cfg = getConfig();
          if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
            mlClient = initMLClient(cfg.ml.sidecarUrl);
          }
        } catch {
          /* config not loaded */
        }
      }
      if (!mlClient) {
        return { error: 'ML sidecar not configured' };
      }
      const health = await mlClient.getModelHealth();
      if (!health) {
        return { error: 'ML sidecar not responding' };
      }
      return {
        models: health.models.map((m) => ({
          name: m.name,
          version: m.version,
          loaded: m.loaded,
          lastTrained: m.lastTrained,
          accuracy: m.accuracy,
        })),
        uptime: health.uptime,
        predictionsServed: health.predictionsServed,
      };
    }

    case 'classify_user_intent': {
      const text = String(params['text'] ?? '');
      let mlClient = getMLClient();
      if (!mlClient) {
        try {
          const cfg = getConfig();
          if (cfg.ml?.enabled && cfg.ml.sidecarUrl) {
            mlClient = initMLClient(cfg.ml.sidecarUrl);
          }
        } catch {
          /* config not loaded */
        }
      }
      if (!mlClient) {
        return { error: 'ML sidecar not configured for intent classification' };
      }
      const intent = await mlClient.classifyIntent(text);
      if (!intent) {
        return { error: 'Intent classification failed' };
      }
      return {
        intent: intent.intent,
        confidence: intent.confidence,
        secondaryIntent: intent.secondary_intent,
        detectedTokens: intent.detected_tokens,
        detectedAddresses: intent.detected_addresses,
        model: intent.model,
      };
    }

    case 'run_backtest': {
      const { BacktestEngine } = await import('../core/backtest/engine.js');
      const engine = new BacktestEngine({
        strategy: String(params['strategy'] ?? 'momentum'),
        pair: String(params['pair'] ?? 'BTCUSDT'),
        from: String(params['from'] ?? ''),
        to: String(params['to'] ?? ''),
        initialCapital: 10000,
        timeframe: String(params['timeframe'] ?? '4h'),
        slippageBps: 10,
        commissionPct: 0.1,
      });
      const result = await engine.run();
      return {
        strategy: result.config.strategy,
        pair: result.config.pair,
        period: `${result.config.from} → ${result.config.to}`,
        metrics: result.metrics,
        tradeCount: result.trades.length,
        lastTrades: result.trades.slice(-5).map((t) => ({
          entry: t.entryPrice,
          exit: t.exitPrice,
          pnl: t.pnl,
          pnlPct: t.pnlPct,
          side: t.side,
        })),
      };
    }

    case 'get_chronovisor_prediction': {
      // Dynamic import to avoid circular deps
      const { getChronoVisor } = await import('../core/chronovisor/engine.js');
      const engine = getChronoVisor();
      const horizons = params['horizons']
        ? (String(params['horizons'])
            .split(',')
            .map((h) => h.trim()) as ('1h' | '4h' | '1d' | '7d')[])
        : (['1h', '4h', '1d'] as const);
      const result = await engine.predict(String(params['symbol']), [...horizons]);
      return result;
    }

    case 'scan_trenches': {
      const { DexPairTracker } = await import('../data/sources/dex-pair-tracker.js');
      const tracker = new DexPairTracker();
      const chain = String(params['chain'] || 'solana');
      const minLiq = Number(params['minLiquidity'] || 1000);
      const limit = Number(params['limit'] || 10);
      const pairs = await tracker.detectNewPairs(chain, 30);
      const filtered = pairs.filter((p) => p.liquidity >= minLiq).slice(0, limit);
      return { chain, results: filtered, count: filtered.length };
    }

    case 'preview_trade': {
      return {
        symbol: String(params['symbol']),
        action: String(params['action']),
        amountUsd: Number(params['amountUsd']),
        chain: String(params['chain'] || 'ethereum'),
        estimatedFees: { dexFee: '0.3%', estimatedGas: '$2-5' },
        slippageEstimate: '0.1-0.5%',
        safetyCheck: 'pending',
        note: 'Use execute_trade to proceed after reviewing this preview.',
      };
    }

    // -----------------------------------------------------------------------
    // Microstructure & Order Flow tools
    // -----------------------------------------------------------------------

    case 'get_market_structure': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const timeframe = String(params['timeframe'] ?? '1h');
      const klines = await fetchKlines(symbol, timeframe, 100);
      const highs = klines.map((k) => k.high);
      const lows = klines.map((k) => k.low);
      const structure = detectMarketStructure(highs, lows);
      return {
        symbol: symbol.toUpperCase(),
        timeframe,
        currentPrice: klines[klines.length - 1]?.close ?? 0,
        ...(structure ?? {
          bias: 'ranging',
          swingHighs: [],
          swingLows: [],
          sequence: [],
          lastBreak: null,
        }),
      };
    }

    case 'get_fvg_analysis': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const timeframe = String(params['timeframe'] ?? '1h');
      const klines = await fetchKlines(symbol, timeframe, 100);
      const highs = klines.map((k) => k.high);
      const lows = klines.map((k) => k.low);
      const closes = klines.map((k) => k.close);
      const atr = calculateATR(highs, lows, closes);
      const fvgs = detectFVGs(highs, lows, closes, atr);
      return {
        symbol: symbol.toUpperCase(),
        timeframe,
        currentPrice: closes[closes.length - 1] ?? 0,
        fvgs: fvgs.slice(0, 10),
        totalFound: fvgs.length,
        unfilledCount: fvgs.filter((f) => !f.filled).length,
      };
    }

    case 'get_vwap': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const timeframe = String(params['timeframe'] ?? '1h');
      const klines = await fetchKlines(symbol, timeframe, 100);
      const vwap = calculateVWAP(
        klines.map((k) => k.high),
        klines.map((k) => k.low),
        klines.map((k) => k.close),
        klines.map((k) => k.volume),
      );
      return {
        symbol: symbol.toUpperCase(),
        timeframe,
        currentPrice: klines[klines.length - 1]?.close ?? 0,
        ...(vwap ?? { vwap: 0, upperBand: 0, lowerBand: 0, deviation: 0 }),
      };
    }

    case 'get_volume_delta': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const timeframe = String(params['timeframe'] ?? '1h');
      const klines = await fetchKlines(symbol, timeframe, 100);
      const delta = calculateVolumeDelta(
        klines.map((k) => k.open),
        klines.map((k) => k.close),
        klines.map((k) => k.volume),
      );
      return {
        symbol: symbol.toUpperCase(),
        timeframe,
        currentPrice: klines[klines.length - 1]?.close ?? 0,
        ...(delta ?? { delta: 0, cumulativeDelta: [], deltaMA: 0, divergence: 'none' }),
      };
    }

    case 'get_liquidation_map': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const [ticker, oi] = await Promise.all([fetchTickerPrice(symbol), fetchOpenInterest(symbol)]);
      const liqZones = estimateLiquidationZones(ticker.price, oi.openInterest);
      const psychLevel = computePsychLevel(ticker.price, symbol);
      return {
        symbol: symbol.toUpperCase(),
        currentPrice: ticker.price,
        openInterest: oi.openInterest,
        openInterestNotional: oi.notionalValue,
        nearestPsychLevel: psychLevel,
        ...liqZones,
      };
    }

    case 'get_order_book_depth': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const depth = Number(params['depth'] || 20);
      const ob = await fetchOrderBookDepth(symbol, depth);
      return ob;
    }

    case 'get_sr_zones': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const timeframe = String(params['timeframe'] ?? '1h');
      const klines = await fetchKlines(symbol, timeframe, 100);
      const zones = detectSRZones(
        klines.map((k) => k.high),
        klines.map((k) => k.low),
        klines.map((k) => k.close),
      );
      return {
        symbol: symbol.toUpperCase(),
        timeframe,
        currentPrice: klines[klines.length - 1]?.close ?? 0,
        zones: zones.slice(0, 10),
        totalZones: zones.length,
      };
    }

    case 'get_squeeze_detector': {
      const symbol = String(params['symbol'] ?? 'BTC');
      const results = await Promise.allSettled([
        fetchFundingRate(symbol),
        fetchOpenInterest(symbol),
        fetchLongShortRatio(symbol),
        fetchTopTraderRatio(symbol),
        fetchTakerBuySellRatio(symbol),
        fetchKlines(symbol, '1h', 100),
        fetchOrderBookDepth(symbol, 20),
      ]);

      const funding = results[0].status === 'fulfilled' ? results[0].value : null;
      const oi = results[1].status === 'fulfilled' ? results[1].value : null;
      const ls = results[2].status === 'fulfilled' ? results[2].value : null;
      const topTrader = results[3].status === 'fulfilled' ? results[3].value : null;
      const taker = results[4].status === 'fulfilled' ? results[4].value : null;
      const klines = results[5].status === 'fulfilled' ? results[5].value : [];
      const ob = results[6].status === 'fulfilled' ? results[6].value : null;

      const currentPrice = klines[klines.length - 1]?.close ?? funding?.markPrice ?? 0;
      const highs = klines.map((k) => k.high);
      const lows = klines.map((k) => k.low);
      const closes = klines.map((k) => k.close);

      const structure = detectMarketStructure(highs, lows);
      const volDelta = calculateVolumeDelta(
        klines.map((k) => k.open),
        closes,
        klines.map((k) => k.volume),
      );
      const atr = calculateATR(highs, lows, closes);
      const liqZones = oi ? estimateLiquidationZones(currentPrice, oi.openInterest) : null;
      const latestLSRatio = ls?.history[ls.history.length - 1]?.longShortRatio ?? null;
      const latestTopRatio =
        topTrader?.history[topTrader.history.length - 1]?.longShortRatio ?? null;

      const squeeze = detectSqueezeConditions(
        funding?.fundingRate ?? null,
        latestLSRatio,
        latestTopRatio,
        structure,
        volDelta,
        liqZones,
        ob?.imbalanceRatio ?? null,
        currentPrice,
        atr,
      );

      return {
        symbol: symbol.toUpperCase(),
        currentPrice,
        shortSqueeze: squeeze.shortSqueeze,
        longSqueeze: squeeze.longSqueeze,
        supportingData: {
          fundingRate: funding?.fundingRate ?? null,
          openInterest: oi?.notionalValue ?? null,
          longShortRatio: latestLSRatio,
          topTraderRatio: latestTopRatio,
          takerBuySellRatio: taker?.history[taker.history.length - 1]?.buySellRatio ?? null,
          orderBookImbalance: ob?.imbalanceRatio ?? null,
          marketBias: structure?.bias ?? 'unknown',
          volumeDeltaDivergence: volDelta?.divergence ?? 'unknown',
        },
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
