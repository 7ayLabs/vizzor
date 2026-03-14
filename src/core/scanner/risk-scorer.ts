import type { ProjectAnalysis } from './project-analyzer.js';

export interface RiskAssessment {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  factors: string[];
  mlScore?: number;
  mlLevel?: string;
}

export function assessRisk(analysis: ProjectAnalysis): RiskAssessment {
  const { riskScore, riskIndicators, mlRisk } = analysis;

  // Use ML risk probability if available, else fall back to point sum
  const effectiveScore = mlRisk ? Math.round(mlRisk.risk_probability * 100) : riskScore;
  const level = getRiskLevel(effectiveScore);

  const factors = riskIndicators
    .filter((i) => i.detected)
    .map((i) => `${i.name}: ${i.description} (+${i.points})`);

  // Add ML risk factors if available
  if (mlRisk) {
    for (const f of mlRisk.risk_factors) {
      factors.push(`ML: ${f.factor} (importance: ${(f.importance * 100).toFixed(1)}%)`);
    }
  }

  const summary = buildSummary(level, factors.length);

  return {
    score: effectiveScore,
    level,
    summary,
    factors,
    mlScore: mlRisk ? Math.round(mlRisk.risk_probability * 100) : undefined,
    mlLevel: mlRisk?.risk_level,
  };
}

function getRiskLevel(score: number): RiskAssessment['level'] {
  if (score <= 20) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'critical';
}

function buildSummary(level: RiskAssessment['level'], factorCount: number): string {
  switch (level) {
    case 'low':
      return 'Project shows minimal risk indicators. Standard due diligence recommended.';
    case 'medium':
      return `Project has ${factorCount} risk factor(s) detected. Proceed with caution.`;
    case 'high':
      return `Project has significant risk indicators. Thorough investigation recommended before any interaction.`;
    case 'critical':
      return `Project shows critical risk signals. High probability of scam or rug pull.`;
  }
}
