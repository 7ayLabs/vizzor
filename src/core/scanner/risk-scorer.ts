import type { ProjectAnalysis } from './project-analyzer.js';

export interface RiskAssessment {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  factors: string[];
}

export function assessRisk(analysis: ProjectAnalysis): RiskAssessment {
  const { riskScore, riskIndicators } = analysis;

  const level = getRiskLevel(riskScore);
  const factors = riskIndicators
    .filter((i) => i.detected)
    .map((i) => `${i.name}: ${i.description} (+${i.points})`);

  const summary = buildSummary(level, factors.length);

  return { score: riskScore, level, summary, factors };
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
