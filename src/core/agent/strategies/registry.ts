// ---------------------------------------------------------------------------
// Strategy registry — extensible strategy management + JSON DSL parser
// ---------------------------------------------------------------------------

import type { AgentStrategy, AgentSignals, AgentDecision, AgentAction } from '../types.js';

const strategies = new Map<string, AgentStrategy>();

export function registerStrategy(strategy: AgentStrategy): void {
  strategies.set(strategy.name, strategy);
}

export function getRegisteredStrategy(name: string): AgentStrategy | undefined {
  return strategies.get(name);
}

export function listRegisteredStrategies(): string[] {
  return Array.from(strategies.keys());
}

// ---------------------------------------------------------------------------
// Strategy DSL — parse JSON rule sets into AgentStrategy
// ---------------------------------------------------------------------------

export interface StrategyRule {
  if: string; // e.g. "rsi < 30 AND macdHistogram > 0"
  then: AgentAction;
  weight: number;
}

export interface StrategyDSL {
  name: string;
  description?: string;
  rules: StrategyRule[];
}

export function parseStrategyDSL(dsl: StrategyDSL): AgentStrategy {
  return {
    name: dsl.name,
    description: dsl.description ?? `Custom strategy: ${dsl.name}`,
    evaluate(signals: AgentSignals): AgentDecision {
      return evaluateDSL(dsl.rules, signals);
    },
  };
}

function evaluateDSL(rules: StrategyRule[], signals: AgentSignals): AgentDecision {
  const reasoning: string[] = [];
  let buyScore = 0;
  let sellScore = 0;

  for (const rule of rules) {
    if (evaluateCondition(rule.if, signals)) {
      if (rule.then === 'buy') {
        buyScore += rule.weight;
        reasoning.push(`Rule matched (buy, weight ${rule.weight}): ${rule.if}`);
      } else if (rule.then === 'sell') {
        sellScore += rule.weight;
        reasoning.push(`Rule matched (sell, weight ${rule.weight}): ${rule.if}`);
      }
    }
  }

  const totalWeight = rules.reduce((sum, r) => sum + r.weight, 0) || 1;

  if (buyScore > sellScore && buyScore > totalWeight * 0.3) {
    return {
      action: 'buy',
      confidence: Math.min(95, Math.round((buyScore / totalWeight) * 100)),
      reasoning,
    };
  }
  if (sellScore > buyScore && sellScore > totalWeight * 0.3) {
    return {
      action: 'sell',
      confidence: Math.min(95, Math.round((sellScore / totalWeight) * 100)),
      reasoning,
    };
  }
  return {
    action: 'hold',
    confidence: 50,
    reasoning: [...reasoning, 'No strong signal — holding'],
  };
}

function evaluateCondition(condition: string, signals: AgentSignals): boolean {
  // Parse simple conditions: "rsi < 30 AND macdHistogram > 0"
  const parts = condition.split(/\s+AND\s+/i);

  return parts.every((part) => {
    const match = part.trim().match(/^(\w+)\s*(<=?|>=?|==|!=)\s*(-?[\d.]+)$/);
    if (!match) return false;

    const [, field, op, valueStr] = match;
    const signalValue = signals[field as keyof AgentSignals];
    if (signalValue === null || signalValue === undefined) return false;

    const value = parseFloat(valueStr);
    const sv = Number(signalValue);

    switch (op) {
      case '<':
        return sv < value;
      case '<=':
        return sv <= value;
      case '>':
        return sv > value;
      case '>=':
        return sv >= value;
      case '==':
        return sv === value;
      case '!=':
        return sv !== value;
      default:
        return false;
    }
  });
}
