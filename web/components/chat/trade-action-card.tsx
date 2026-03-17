'use client';

import { useState } from 'react';
import { CryptoIcon } from '@/components/ui/crypto-icon';
import { Modal } from '@/components/ui/modal';
import { PriceAlertModal } from '@/components/ui/price-alert-modal';
import { apiFetch } from '@/lib/api';

interface TradeActionCardProps {
  symbol: string;
  price: number;
  change24h: number;
  safetyScore?: number;
  onBuy?: (symbol: string, amount: number) => void;
  onSell?: (symbol: string, amount: number) => void;
  onConfigureAgent?: (symbol: string) => void;
}

type ModalView = 'trade' | 'agent' | 'alert';

export function TradeActionCard({
  symbol,
  price,
  change24h,
  safetyScore,
  onBuy,
  onSell,
  onConfigureAgent,
}: TradeActionCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [modalView, setModalView] = useState<ModalView>('trade');
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');

  // Agent config state
  const [agentName, setAgentName] = useState(`${symbol.toLowerCase()}-agent`);
  const [strategy, setStrategy] = useState('momentum');
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState('');
  const [deploySuccess, setDeploySuccess] = useState(false);

  const isPositive = change24h >= 0;

  const closeModal = () => setShowModal(false);

  const handleAction = (type: 'buy' | 'sell') => {
    setAction(type);
    setModalView('trade');
    setShowModal(true);
  };

  const handleConfigureAgent = () => {
    setAgentName(`${symbol.toLowerCase()}-agent`);
    setStrategy('momentum');
    setDeployError('');
    setDeploySuccess(false);
    setModalView('agent');
    setShowModal(true);
    onConfigureAgent?.(symbol);
  };

  const handleAlert = () => {
    setModalView('alert');
    setShowModal(true);
  };

  const handleConfirm = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;
    if (action === 'buy') onBuy?.(symbol, numAmount);
    else onSell?.(symbol, numAmount);
    setShowModal(false);
    setAmount('');
  };

  const handleDeployAgent = async () => {
    if (!agentName.trim()) return;
    setDeploying(true);
    setDeployError('');
    try {
      await apiFetch('/v1/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: agentName,
          strategy,
          pairs: [`${symbol}/USDT`],
          interval: 60,
        }),
      });
      await apiFetch(`/v1/agents/${agentName}/start`, { method: 'POST' });
      setDeploySuccess(true);
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Failed to deploy agent');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <>
      <div className="glass-card p-3 flex items-center gap-3 max-w-sm">
        <CryptoIcon symbol={symbol} size={32} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white text-sm">{symbol}</div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--text-secondary)]">
              $
              {price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 6,
              })}
            </span>
            <span className={isPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
              {isPositive ? '+' : ''}
              {change24h.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => handleAction('buy')}
            className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--success)] hover:border-[var(--success)]/30 transition-colors"
          >
            BUY
          </button>
          <button
            onClick={() => handleAction('sell')}
            className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--danger)] hover:border-[var(--danger)]/30 transition-colors"
          >
            SELL
          </button>
          <button
            onClick={handleConfigureAgent}
            className="px-2 py-1.5 rounded-lg border border-white/[0.08] text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition-colors"
            title="Configure Agent"
          >
            <i className="fa-solid fa-robot" />
          </button>
          <button
            onClick={handleAlert}
            className="px-2 py-1.5 rounded-lg border border-white/[0.08] text-xs text-[var(--text-secondary)] hover:text-yellow-400 hover:border-yellow-400/30 transition-colors"
            title="Price Alert"
          >
            <i className="fa-solid fa-bell" />
          </button>
        </div>
      </div>

      <Modal open={showModal} onClose={closeModal}>
        {modalView === 'alert' ? (
          <PriceAlertModal symbol={symbol} initialPrice={price} onClose={closeModal} />
        ) : modalView === 'agent' ? (
          <AgentContent
            symbol={symbol}
            agentName={agentName}
            setAgentName={setAgentName}
            strategy={strategy}
            setStrategy={setStrategy}
            deploying={deploying}
            deployError={deployError}
            deploySuccess={deploySuccess}
            onDeploy={() => void handleDeployAgent()}
            onClose={closeModal}
          />
        ) : (
          <TradeContent
            symbol={symbol}
            action={action}
            amount={amount}
            setAmount={setAmount}
            slippage={slippage}
            setSlippage={setSlippage}
            safetyScore={safetyScore}
            onConfirm={handleConfirm}
            onClose={closeModal}
          />
        )}
      </Modal>
    </>
  );
}

/* ── Trade modal inner content ── */

function TradeContent({
  symbol,
  action,
  amount,
  setAmount,
  slippage,
  setSlippage,
  safetyScore,
  onConfirm,
  onClose,
}: {
  symbol: string;
  action: 'buy' | 'sell';
  amount: string;
  setAmount: (v: string) => void;
  slippage: string;
  setSlippage: (v: string) => void;
  safetyScore?: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold">
        {action === 'buy' ? 'Buy' : 'Sell'} {symbol}
      </h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Amount (USD)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/[0.2]"
          />
        </div>

        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Slippage (%)</label>
          <input
            type="number"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/[0.2]"
          />
        </div>

        {safetyScore !== undefined && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">Safety Score</span>
            <span
              className={
                safetyScore >= 70
                  ? 'text-[var(--success)]'
                  : safetyScore >= 40
                    ? 'text-yellow-500'
                    : 'text-[var(--danger)]'
              }
            >
              {safetyScore}/100
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>Est. Fee</span>
          <span>~0.3% + gas</span>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 rounded-lg border border-white/[0.08] text-sm text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            action === 'buy'
              ? 'bg-[var(--success)]/20 text-[var(--success)] hover:bg-[var(--success)]/30'
              : 'bg-[var(--danger)]/20 text-[var(--danger)] hover:bg-[var(--danger)]/30'
          }`}
        >
          Confirm {action === 'buy' ? 'Buy' : 'Sell'}
        </button>
      </div>
    </div>
  );
}

/* ── Agent modal inner content ── */

function AgentContent({
  symbol,
  agentName,
  setAgentName,
  strategy,
  setStrategy,
  deploying,
  deployError,
  deploySuccess,
  onDeploy,
  onClose,
}: {
  symbol: string;
  agentName: string;
  setAgentName: (v: string) => void;
  strategy: string;
  setStrategy: (v: string) => void;
  deploying: boolean;
  deployError: string;
  deploySuccess: boolean;
  onDeploy: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold flex items-center gap-2">
        <i className="fa-solid fa-robot text-[var(--accent)]" />
        Configure Agent for {symbol}
      </h3>

      {deploySuccess ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[var(--success)] text-sm">
            <i className="fa-solid fa-check-circle" />
            Agent &quot;{agentName}&quot; deployed and started
          </div>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 rounded-lg border border-white/[0.08] text-sm text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
          >
            Close
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">Agent Name</label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/[0.2]"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-white/[0.2]"
            >
              <option value="momentum">Momentum</option>
              <option value="trend-following">Trend Following</option>
              <option value="ml-adaptive">ML Adaptive</option>
            </select>
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Pair</span>
            <span>{symbol}/USDT</span>
          </div>

          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Interval</span>
            <span>60s</span>
          </div>

          {deployError && <div className="text-xs text-[var(--danger)]">{deployError}</div>}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-white/[0.08] text-sm text-[var(--text-secondary)] hover:bg-white/[0.06] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onDeploy}
              disabled={deploying}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
            >
              {deploying ? 'Deploying...' : 'Deploy Agent'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
