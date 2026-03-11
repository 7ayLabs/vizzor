// ---------------------------------------------------------------------------
// Platform-agnostic response format
// ---------------------------------------------------------------------------

/** Structured response returned by every Vizzor core module. */
export interface VizzorResponse {
  title: string;
  type: 'scan' | 'trends' | 'track' | 'ico' | 'audit' | 'chat';
  sections: ResponseSection[];
  /** Risk score between 0 (minimal risk) and 100 (extreme risk). */
  riskScore?: number;
  /** Arbitrary metadata attached by the producing module. */
  metadata?: Record<string, unknown>;
}

/** A single section inside a {@link VizzorResponse}. */
export interface ResponseSection {
  heading: string;
  content: string;
  type: 'text' | 'table' | 'list' | 'code' | 'warning' | 'success' | 'error';
  /** Structured table data — only present when `type` is `'table'`. */
  data?: TableData;
}

/** Row/column data for table-type sections. */
export interface TableData {
  headers: string[];
  rows: string[][];
}

/**
 * Every platform adapter must implement this interface.
 *
 * The return type is intentionally `string | object` so that CLI adapters can
 * return a printable string while bot adapters (Discord, Telegram) can return
 * rich embed objects.
 */
export interface ResponseAdapter {
  render(response: VizzorResponse): string | object;
}
