'use client';

import { useState, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { API_BASE, APP_VERSION } from '@/lib/constants';
import type { MLHealth } from '@/lib/types';

interface HealthData {
  status: string;
  version: string;
  uptime: number;
}

interface ProviderInfo {
  current: string;
  providers: { name: string; available: boolean; reason?: string }[];
}

export default function SettingsPage() {
  const { data: health } = useApi<HealthData>('/health');
  const { data: ml } = useApi<MLHealth>('/v1/market/ml-health');
  const { data: providerInfo, mutate: refreshProvider } = useApi<ProviderInfo>('/v1/provider');
  const { theme, setTheme } = useTheme();
  const [switching, setSwitching] = useState(false);

  const handleProviderChange = useCallback(
    async (name: string) => {
      setSwitching(true);
      try {
        await apiFetch('/v1/provider', {
          method: 'PUT',
          body: JSON.stringify({ provider: name }),
        });
        await refreshProvider();
      } catch (err) {
        console.error('Failed to switch provider:', err);
      } finally {
        setSwitching(false);
      }
    },
    [refreshProvider],
  );

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-lg font-bold">Settings</h2>
      </div>

      <div className="space-y-4 max-w-2xl">
        {/* AI Provider */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-xs font-medium text-[var(--primary)] mb-4 uppercase tracking-wider">
            AI Provider
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-2">Active Provider</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(providerInfo?.providers ?? []).map((p) => {
                  const isActive = providerInfo?.current === p.name;
                  return (
                    <button
                      key={p.name}
                      onClick={() => handleProviderChange(p.name)}
                      disabled={switching || !p.available}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs transition-colors text-left touch-target ${
                        isActive
                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                          : p.available
                            ? 'border-[var(--border)] text-[var(--foreground)] hover:border-[var(--primary)]/50'
                            : 'border-[var(--border)] text-[var(--muted)] opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isActive
                            ? 'bg-[var(--primary)] pulse-dot'
                            : p.available
                              ? 'bg-[var(--success)]'
                              : 'bg-[var(--muted)]'
                        }`}
                      />
                      <div>
                        <div className="font-medium capitalize">{p.name}</div>
                        {!p.available && p.reason && (
                          <div className="text-[10px] text-[var(--muted)]">{p.reason}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!providerInfo && (
                <p className="text-xs text-[var(--muted)] mt-2">
                  Start the backend to manage providers
                </p>
              )}
            </div>
          </div>
        </section>

        {/* API Configuration */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-xs font-medium text-[var(--primary)] mb-4 uppercase tracking-wider">
            API Configuration
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">API URL</label>
              <input
                type="text"
                defaultValue={API_BASE}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-3 py-2 text-xs focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">API Key</label>
              <input
                type="password"
                placeholder="Enter API key"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-3 py-2 text-xs focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>
        </section>

        {/* Dashboard Preferences */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-xs font-medium text-[var(--primary)] mb-4 uppercase tracking-wider">
            Dashboard Preferences
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-3 py-2 text-xs focus:outline-none focus:border-[var(--primary)]"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted)] mb-1">Refresh Interval</label>
              <select
                defaultValue="30"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-3 py-2 text-xs focus:outline-none focus:border-[var(--primary)]"
              >
                <option value="15">15 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">60 seconds</option>
              </select>
            </div>
          </div>
        </section>

        {/* ML Sidecar */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-xs font-medium text-[var(--primary)] mb-4 uppercase tracking-wider">
            ML Sidecar
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Status</span>
              <span className={ml?.available ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                {ml?.available ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {ml?.available && (
              <>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Models Loaded</span>
                  <span className="font-mono">
                    {ml.models.filter((m) => m.loaded).length}/{ml.models.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Uptime</span>
                  <span className="font-mono">{Math.floor(ml.uptime / 3600)}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Predictions Served</span>
                  <span className="font-mono">{ml.predictionsServed?.toLocaleString() ?? '0'}</span>
                </div>
                {/* Model list */}
                <div className="border-t border-[var(--border)] pt-2 mt-2 space-y-1">
                  {ml.models.map((m) => (
                    <div key={m.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full ${m.loaded ? 'bg-[var(--success)]' : 'bg-[var(--muted)]'}`}
                        />
                        <span className="text-[var(--foreground)]">{m.name}</span>
                      </div>
                      <span className="font-mono text-[var(--muted)]">{m.version}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* System Status */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-xs font-medium text-[var(--primary)] mb-4 uppercase tracking-wider">
            System
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">API Status</span>
              <span className={health ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                {health ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {health && (
              <>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Server Version</span>
                  <span className="font-mono">{health.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Uptime</span>
                  <span className="font-mono">{Math.floor(health.uptime / 3600)}h</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* About */}
        <section className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
          <h3 className="text-xs font-medium text-[var(--primary)] mb-4 uppercase tracking-wider">
            About
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Version</span>
              <span className="font-mono">v{APP_VERSION}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Build</span>
              <span className="font-mono text-[var(--primary)]">Mission Control</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">By</span>
              <span>7ayLabs</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
