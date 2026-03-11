import { describe, it, expect } from 'vitest';
import { assessRisk } from '@/core/scanner/risk-scorer.js';
import type { ProjectAnalysis, RiskIndicator } from '@/core/scanner/project-analyzer.js';

function makeIndicator(overrides: Partial<RiskIndicator> = {}): RiskIndicator {
  return {
    name: 'test_indicator',
    detected: false,
    severity: 'low',
    points: 10,
    description: 'A test indicator',
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<ProjectAnalysis> = {}): ProjectAnalysis {
  return {
    token: null,
    contractVerified: true,
    hasSourceCode: true,
    holderConcentration: 0,
    topHolders: [],
    riskIndicators: [],
    riskScore: 0,
    ...overrides,
  };
}

describe('assessRisk', () => {
  it('returns low risk when riskScore is 0', () => {
    const result = assessRisk(makeAnalysis({ riskScore: 0 }));
    expect(result.level).toBe('low');
    expect(result.score).toBe(0);
    expect(result.factors).toHaveLength(0);
  });

  it('returns medium risk for scores 21-50', () => {
    const result = assessRisk(makeAnalysis({ riskScore: 35 }));
    expect(result.level).toBe('medium');
    expect(result.score).toBe(35);
  });

  it('returns high risk for scores 51-75', () => {
    const result = assessRisk(makeAnalysis({ riskScore: 60 }));
    expect(result.level).toBe('high');
    expect(result.score).toBe(60);
  });

  it('returns critical risk for scores above 75', () => {
    const result = assessRisk(makeAnalysis({ riskScore: 85 }));
    expect(result.level).toBe('critical');
  });

  it('collects detected risk indicators as factors', () => {
    const indicators = [
      makeIndicator({ name: 'mint', detected: true, points: 20, description: 'Owner can mint' }),
      makeIndicator({ name: 'pause', detected: false, points: 15, description: 'Can pause' }),
      makeIndicator({ name: 'honeypot', detected: true, points: 30, description: 'Honeypot risk' }),
    ];
    const result = assessRisk(makeAnalysis({ riskScore: 50, riskIndicators: indicators }));
    expect(result.factors).toHaveLength(2);
    expect(result.factors[0]).toContain('mint');
    expect(result.factors[1]).toContain('honeypot');
  });

  it('includes a summary string', () => {
    const result = assessRisk(makeAnalysis({ riskScore: 10 }));
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('summary varies by risk level', () => {
    const low = assessRisk(makeAnalysis({ riskScore: 5 }));
    const critical = assessRisk(makeAnalysis({ riskScore: 90 }));
    expect(low.summary).not.toBe(critical.summary);
  });
});
