import chalk from 'chalk';
import { createInterface } from 'node:readline';
import { getConfig } from '../../config/loader.js';
import { DEFAULT_CHAIN } from '../../config/constants.js';
import { setConfig, setToolHandler, analyze } from '../../ai/client.js';
import { buildChatSystemPrompt } from '../../ai/prompts/chat.js';
import { VIZZOR_TOOLS } from '../../ai/tools.js';
import { getAdapter } from '../../chains/registry.js';
import {
  fetchMarketData,
  fetchTokenFromDex,
  fetchTrendingTokens,
} from '../../core/trends/market.js';
import {
  fetchUpcomingICOs,
  searchICOs,
  getProjectFundingHistory,
  getInvestorPortfolio,
} from '../../core/scanner/ico-tracker.js';
import { fetchCryptoNews } from '../../data/sources/cryptopanic.js';
import { fetchRecentRaises } from '../../data/sources/defillama.js';
import {
  fetchTickerPrice,
  fetchFundingRate,
  fetchOpenInterest,
} from '../../data/sources/binance.js';
import { checkTokenSecurity } from '../../data/sources/goplus.js';
import { fetchFearGreedIndex } from '../../data/sources/fear-greed.js';
import { detectRugIndicators } from '../../core/forensics/rug-detector.js';
import { analyzeTechnicals } from '../../core/technical-analysis/index.js';
import { generatePrediction } from '../../core/trends/predictor.js';

export async function handleChat(): Promise<void> {
  const config = getConfig();

  // Initialise the AI provider
  setConfig(config);

  // Register tool handler for on-chain lookups
  setToolHandler(async (name: string, input: unknown) => {
    const params = input as Record<string, unknown>;
    const chain = String(params['chain'] ?? DEFAULT_CHAIN);

    switch (name) {
      case 'get_token_info': {
        const adapter = getAdapter(chain);
        await adapter.connect(undefined, config.etherscanApiKey);
        const info = await adapter.getTokenInfo(String(params['address'] ?? ''));
        await adapter.disconnect();
        return info;
      }

      case 'analyze_wallet': {
        const { analyzeWallet } = await import('../../core/forensics/wallet-analyzer.js');
        const adapter = getAdapter(chain);
        await adapter.connect(undefined, config.etherscanApiKey);
        const result = await analyzeWallet(String(params['address'] ?? ''), adapter);
        await adapter.disconnect();
        return result;
      }

      case 'check_rug_indicators': {
        const adapter = getAdapter(chain);
        await adapter.connect(undefined, config.etherscanApiKey);
        const indicators = await detectRugIndicators(String(params['address'] ?? ''), adapter);
        await adapter.disconnect();
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
          const data = await fetchMarketData(symbol);
          if (!data) return { error: `No market data found for "${symbol}"` };
          return data;
        }
      }

      case 'search_upcoming_icos': {
        const category = params['category'] ? String(params['category']) : undefined;
        const chain_ = params['chain'] ? String(params['chain']) : undefined;
        const roundType = params['roundType'] ? String(params['roundType']) : undefined;
        const projects =
          category || chain_ || roundType
            ? await searchICOs(undefined, category, chain_, roundType)
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
        const fname = String(params['name'] ?? '');
        const type = String(params['type'] ?? 'project');
        if (type === 'investor') {
          const portfolio = await getInvestorPortfolio(fname);
          return {
            investor: fname,
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
        const history = await getProjectFundingHistory(fname);
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
        const news = await fetchCryptoNews(symbol, config.cryptopanicApiKey);
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
        const secChain = String(params['chain'] ?? 'ethereum');
        const security = await checkTokenSecurity(address, secChain);
        if (!security) {
          return { error: `No security data for ${address} on ${secChain}` };
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

      default:
        return { error: `Unknown tool: ${name}` };
    }
  });

  console.log();
  console.log(chalk.bold(`Vizzor Chat (${config.ai.provider})`));
  console.log(chalk.dim('AI-powered crypto intelligence. Type "exit" to quit.'));
  console.log(chalk.dim('Ask about projects, tokens, wallets, or market trends.'));
  console.log();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('vizzor> '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log(chalk.dim('Goodbye.'));
      rl.close();
      return;
    }

    try {
      process.stdout.write(chalk.dim('Thinking...\r'));
      const response = await analyze(buildChatSystemPrompt(), input, VIZZOR_TOOLS);
      process.stdout.write('\r' + ' '.repeat(20) + '\r');
      console.log();
      console.log(response);
      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error: ${message}`));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
