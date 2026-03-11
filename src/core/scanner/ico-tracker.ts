export interface ICOProject {
  id: string;
  name: string;
  symbol: string;
  category: string;
  chain: string;
  status: 'upcoming' | 'active' | 'ended';
  startDate: string | null;
  endDate: string | null;
  description: string;
  website: string | null;
  raisedAmount: number | null;
  targetAmount: number | null;
}

export async function fetchUpcomingICOs(): Promise<ICOProject[]> {
  // TODO: Integrate with ICO tracking APIs (ICODrops, CoinGecko, DeFiLlama)
  // For now returns empty — will be populated with real API calls
  return [];
}

export async function fetchActiveICOs(): Promise<ICOProject[]> {
  // TODO: Integrate with ICO tracking APIs
  return [];
}

export async function searchICOs(
  _query?: string,
  _category?: string,
  _chain?: string,
): Promise<ICOProject[]> {
  // TODO: Search/filter ICOs from tracked sources
  return [];
}
