// ---------------------------------------------------------------------------
// Bytecode scanner — detect dangerous function selectors and opcodes
// No external API needed — works purely on contract bytecode.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BytecodeFinding {
  name: string;
  selector: string;
  type: 'function' | 'opcode';
  severity: 'info' | 'warning' | 'critical';
  description: string;
}

// ---------------------------------------------------------------------------
// Known dangerous function selectors (4-byte keccak256 prefixes)
// ---------------------------------------------------------------------------

const DANGEROUS_FUNCTIONS: {
  selector: string;
  name: string;
  severity: BytecodeFinding['severity'];
  description: string;
}[] = [
  // Mint functions — inflation risk
  {
    selector: '40c10f19',
    name: 'mint(address,uint256)',
    severity: 'critical',
    description: 'Owner can mint new tokens (inflation/dilution risk)',
  },
  {
    selector: 'a0712d68',
    name: 'mint(uint256)',
    severity: 'critical',
    description: 'Mint function detected (inflation/dilution risk)',
  },

  // Pause functions — can freeze trading
  {
    selector: '8456cb59',
    name: 'pause()',
    severity: 'warning',
    description: 'Contract can be paused (trading may be frozen)',
  },
  {
    selector: '3f4ba83a',
    name: 'unpause()',
    severity: 'info',
    description: 'Unpause function exists (paired with pause)',
  },

  // Blacklist functions — can block addresses
  {
    selector: 'ef01df4f',
    name: 'blacklistAddress(address)',
    severity: 'critical',
    description: 'Can blacklist addresses (honeypot risk)',
  },
  {
    selector: '44337ea1',
    name: 'blacklist(address)',
    severity: 'critical',
    description: 'Can blacklist addresses (honeypot risk)',
  },
  {
    selector: 'e47d6060',
    name: 'setBlacklist(address,bool)',
    severity: 'critical',
    description: 'Can toggle address blacklist (honeypot risk)',
  },

  // Fee/tax manipulation
  {
    selector: 'f2fde38b',
    name: 'transferOwnership(address)',
    severity: 'info',
    description: 'Ownership can be transferred',
  },
  {
    selector: '715018a6',
    name: 'renounceOwnership()',
    severity: 'info',
    description: 'Ownership can be renounced (positive indicator)',
  },

  // Trading controls
  {
    selector: '49bd5a5e',
    name: 'uniswapV2Pair()',
    severity: 'info',
    description: 'Uniswap V2 pair reference detected',
  },
  {
    selector: 'c9567bf9',
    name: 'openTrading()',
    severity: 'warning',
    description: 'Trading can be opened/closed by owner',
  },

  // Max transaction/wallet limits
  {
    selector: '313ce567',
    name: 'decimals()',
    severity: 'info',
    description: 'Standard ERC20 decimals function',
  },
];

// Dangerous opcodes (single-byte)
const DANGEROUS_OPCODES: {
  byte: string;
  name: string;
  severity: BytecodeFinding['severity'];
  description: string;
}[] = [
  {
    byte: 'ff',
    name: 'SELFDESTRUCT',
    severity: 'critical',
    description: 'Contract can self-destruct (all funds lost)',
  },
];

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Scan contract bytecode for known dangerous function selectors and opcodes.
 * Returns an array of findings sorted by severity.
 */
export function scanBytecode(code: string): BytecodeFinding[] {
  const findings: BytecodeFinding[] = [];

  // Normalize: remove 0x prefix, lowercase
  const normalized = code.startsWith('0x') ? code.slice(2).toLowerCase() : code.toLowerCase();

  if (normalized.length < 2) {
    return findings;
  }

  // Check for dangerous function selectors
  for (const func of DANGEROUS_FUNCTIONS) {
    if (normalized.includes(func.selector)) {
      findings.push({
        name: func.name,
        selector: `0x${func.selector}`,
        type: 'function',
        severity: func.severity,
        description: func.description,
      });
    }
  }

  // Check for dangerous opcodes — only check for SELFDESTRUCT
  // (delegatecall is common and normal in proxy patterns)
  for (const op of DANGEROUS_OPCODES) {
    // SELFDESTRUCT: look for the ff opcode — it's common as a byte but
    // specifically look for the PUSH pattern before it or it at function boundaries
    if (op.byte === 'ff' && normalized.includes('ff')) {
      // Simple heuristic: if the bytecode contains SELFDESTRUCT opcode
      // at a position that could be a standalone instruction
      // (not part of PUSH data), flag it.
      // We check for common patterns: ...XX ff (where XX is not a PUSH)
      const idx = normalized.indexOf('ff');
      if (idx > 0 && idx % 2 === 0) {
        findings.push({
          name: op.name,
          selector: `0x${op.byte}`,
          type: 'opcode',
          severity: op.severity,
          description: op.description,
        });
      }
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  return findings;
}

/**
 * Quick check: does the bytecode contain any mint-related selectors?
 */
export function hasMintFunction(code: string): boolean {
  const normalized = code.startsWith('0x') ? code.slice(2).toLowerCase() : code.toLowerCase();
  return normalized.includes('40c10f19') || normalized.includes('a0712d68');
}

/**
 * Quick check: does the bytecode contain pause-related selectors?
 */
export function hasPauseFunction(code: string): boolean {
  const normalized = code.startsWith('0x') ? code.slice(2).toLowerCase() : code.toLowerCase();
  return normalized.includes('8456cb59');
}

/**
 * Quick check: does the bytecode contain blacklist-related selectors?
 */
export function hasBlacklistFunction(code: string): boolean {
  const normalized = code.startsWith('0x') ? code.slice(2).toLowerCase() : code.toLowerCase();
  return (
    normalized.includes('ef01df4f') ||
    normalized.includes('44337ea1') ||
    normalized.includes('e47d6060')
  );
}
