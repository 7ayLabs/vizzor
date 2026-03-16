// ---------------------------------------------------------------------------
// GoPlus Security API client — token security checks, no auth required
// https://docs.gopluslabs.io/
// Rate limit: ~30 req/min
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.gopluslabs.io/api/v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenSecurity {
  contractAddress: string;
  chain: string;
  isOpenSource: boolean;
  isProxy: boolean;
  isMintable: boolean;
  canTakeBackOwnership: boolean;
  ownerChangeBalance: boolean;
  hiddenOwner: boolean;
  selfDestruct: boolean;
  externalCall: boolean;
  isHoneypot: boolean;
  buyTax: number;
  sellTax: number;
  cannotBuy: boolean;
  cannotSellAll: boolean;
  slippageModifiable: boolean;
  isBlacklisted: boolean;
  isWhitelisted: boolean;
  antiWhaleModifiable: boolean;
  tradingCooldown: boolean;
  personalSlippageModifiable: boolean;
  holderCount: number;
  lpHolderCount: number;
  totalSupply: string;
  creatorAddress: string;
  creatorPercent: number;
  ownerAddress: string;
  ownerPercent: number;
  lpTotalSupplyPercent: number;
  isInDex: boolean;
  dexInfo: { name: string; liquidity: string; pair: string }[];
  trustList: boolean;
  riskLevel: 'safe' | 'warning' | 'danger';
}

export interface AddressSecurity {
  address: string;
  isContract: boolean;
  maliciousAddress: boolean;
  honeypotRelated: boolean;
  phishing: boolean;
  blacklistDoubt: boolean;
  dataSources: string[];
}

// ---------------------------------------------------------------------------
// Chain ID mapping
// ---------------------------------------------------------------------------

const CHAIN_IDS: Record<string, string> = {
  ethereum: '1',
  bsc: '56',
  polygon: '137',
  arbitrum: '42161',
  optimism: '10',
  base: '8453',
  avalanche: '43114',
  solana: 'solana',
  sui: 'sui',
  aptos: 'aptos',
  ton: 'ton',
};

function resolveChainId(chain: string): string {
  return CHAIN_IDS[chain.toLowerCase()] ?? chain;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GoPlus API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Check token security for a contract address on a specific chain.
 */
export async function checkTokenSecurity(
  contractAddress: string,
  chain: string,
): Promise<TokenSecurity | null> {
  const chainId = resolveChainId(chain);
  const data = await fetchJson<{
    code: number;
    result: Record<string, Record<string, unknown>>;
  }>(
    `${BASE_URL}/token_security/${encodeURIComponent(chainId)}?contract_addresses=${encodeURIComponent(contractAddress.toLowerCase())}`,
  );

  if (data.code !== 1) return null;

  const addr = contractAddress.toLowerCase();
  const raw = data.result[addr];
  if (!raw) return null;

  const toBool = (v: unknown): boolean => v === '1' || v === 1 || v === true;
  const toNum = (v: unknown): number => (v != null ? parseFloat(String(v)) : 0);

  const buyTax = toNum(raw['buy_tax']);
  const sellTax = toNum(raw['sell_tax']);
  const isHoneypot = toBool(raw['is_honeypot']);
  const isMintable = toBool(raw['is_mintable']);

  let riskLevel: TokenSecurity['riskLevel'] = 'safe';
  if (isHoneypot || sellTax > 0.5 || isMintable) {
    riskLevel = 'danger';
  } else if (sellTax > 0.1 || buyTax > 0.1 || toBool(raw['hidden_owner'])) {
    riskLevel = 'warning';
  }

  return {
    contractAddress: addr,
    chain,
    isOpenSource: toBool(raw['is_open_source']),
    isProxy: toBool(raw['is_proxy']),
    isMintable,
    canTakeBackOwnership: toBool(raw['can_take_back_ownership']),
    ownerChangeBalance: toBool(raw['owner_change_balance']),
    hiddenOwner: toBool(raw['hidden_owner']),
    selfDestruct: toBool(raw['selfdestruct']),
    externalCall: toBool(raw['external_call']),
    isHoneypot,
    buyTax,
    sellTax,
    cannotBuy: toBool(raw['cannot_buy']),
    cannotSellAll: toBool(raw['cannot_sell_all']),
    slippageModifiable: toBool(raw['slippage_modifiable']),
    isBlacklisted: toBool(raw['is_blacklisted']),
    isWhitelisted: toBool(raw['is_whitelisted']),
    antiWhaleModifiable: toBool(raw['anti_whale_modifiable']),
    tradingCooldown: toBool(raw['trading_cooldown']),
    personalSlippageModifiable: toBool(raw['personal_slippage_modifiable']),
    holderCount: toNum(raw['holder_count']),
    lpHolderCount: toNum(raw['lp_holder_count']),
    totalSupply: String(raw['total_supply'] ?? '0'),
    creatorAddress: String(raw['creator_address'] ?? ''),
    creatorPercent: toNum(raw['creator_percent']),
    ownerAddress: String(raw['owner_address'] ?? ''),
    ownerPercent: toNum(raw['owner_percent']),
    lpTotalSupplyPercent: toNum(raw['lp_total_supply_percent']),
    isInDex: toBool(raw['is_in_dex']),
    dexInfo: Array.isArray(raw['dex'])
      ? (raw['dex'] as { name: string; liquidity: string; pair: string }[])
      : [],
    trustList: toBool(raw['trust_list']),
    riskLevel,
  };
}

/**
 * Check if an address is associated with malicious activity.
 */
export async function checkAddressSecurity(
  address: string,
  chain: string,
): Promise<AddressSecurity | null> {
  const chainId = resolveChainId(chain);
  const data = await fetchJson<{
    code: number;
    result: Record<string, unknown>;
  }>(
    `${BASE_URL}/address_security/${encodeURIComponent(chainId)}?address=${encodeURIComponent(address.toLowerCase())}`,
  );

  if (data.code !== 1) return null;
  const raw = data.result;

  const toBool = (v: unknown): boolean => v === '1' || v === 1 || v === true;

  return {
    address: address.toLowerCase(),
    isContract: toBool(raw['contract_address']),
    maliciousAddress: toBool(raw['malicious_address']),
    honeypotRelated: toBool(raw['honeypot_related_address']),
    phishing: toBool(raw['phishing_activities']),
    blacklistDoubt: toBool(raw['blacklist_doubt']),
    dataSources: Array.isArray(raw['data_source']) ? (raw['data_source'] as string[]) : [],
  };
}

/**
 * Check token approval security for an address.
 */
export async function checkApprovalSecurity(
  contractAddress: string,
  chain: string,
): Promise<{ isApprovalAbuse: boolean; approvalRisk: string }> {
  const chainId = resolveChainId(chain);
  const data = await fetchJson<{
    code: number;
    result: Record<string, unknown>;
  }>(
    `${BASE_URL}/approval_security/${encodeURIComponent(chainId)}?contract_addresses=${encodeURIComponent(contractAddress.toLowerCase())}`,
  );

  if (data.code !== 1) {
    return { isApprovalAbuse: false, approvalRisk: 'unknown' };
  }

  const raw = data.result;
  return {
    isApprovalAbuse: raw['is_approval_abuse'] === '1',
    approvalRisk: String(raw['approval_risk'] ?? 'none'),
  };
}
