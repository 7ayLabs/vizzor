import type { ChainAdapter } from '../../chains/types.js';

export interface AuditResult {
  address: string;
  chain: string;
  hasCode: boolean;
  codeSize: number;
  findings: AuditFinding[];
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
}

export interface AuditFinding {
  title: string;
  description: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

export async function auditContract(address: string, adapter: ChainAdapter): Promise<AuditResult> {
  const code = await adapter.getContractCode(address).catch(() => '');
  const findings: AuditFinding[] = [];

  const hasCode = code.length > 2;

  if (!hasCode) {
    findings.push({
      title: 'No Contract Code',
      description: 'Address does not contain contract bytecode. This may be an EOA.',
      severity: 'critical',
      category: 'deployment',
    });

    return {
      address,
      chain: adapter.chainId,
      hasCode: false,
      codeSize: 0,
      findings,
      overallRisk: 'critical',
    };
  }

  const codeSize = (code.length - 2) / 2; // hex string minus 0x, each byte = 2 chars

  if (codeSize < 100) {
    findings.push({
      title: 'Minimal Contract',
      description: `Contract bytecode is very small (${codeSize} bytes). May be a proxy or minimal implementation.`,
      severity: 'medium',
      category: 'size',
    });
  }

  if (codeSize > 24576) {
    findings.push({
      title: 'Large Contract',
      description: `Contract bytecode is ${codeSize} bytes, approaching the 24KB deployment limit.`,
      severity: 'info',
      category: 'size',
    });
  }

  // TODO: Add more audit checks:
  // - Proxy pattern detection (delegatecall)
  // - Selfdestruct detection
  // - Known vulnerability signatures
  // - Storage layout analysis

  const overallRisk = determineOverallRisk(findings);

  return {
    address,
    chain: adapter.chainId,
    hasCode,
    codeSize,
    findings,
    overallRisk,
  };
}

function determineOverallRisk(findings: AuditFinding[]): AuditResult['overallRisk'] {
  if (findings.some((f) => f.severity === 'critical')) return 'critical';
  if (findings.some((f) => f.severity === 'high')) return 'high';
  if (findings.some((f) => f.severity === 'medium')) return 'medium';
  return 'low';
}
