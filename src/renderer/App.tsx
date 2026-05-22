/**
 * CAI™ Core — Root App component
 * v0.1.7 · BP051 NOVACULA SEG-CC-7
 *
 * Panels:
 *   Dashboard    — Caithedral™ stats + Banyan Metric™ score
 *   Conjunction  — CAI Core Conjunction Window (multi-vendor MCP dispatch)
 *   Substrate    — substrate query/write interface
 *   Settings     — core settings (stripped of LB-specific items)
 */

import React, { useState } from 'react';

type Panel = 'dashboard' | 'conjunction' | 'substrate' | 'settings';

export function App() {
  const [activePanel, setActivePanel] = useState<Panel>('dashboard');

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0a', color: '#e0e0e0' }}>
      {/* Sidebar */}
      <aside style={{
        width: 200,
        background: '#111',
        borderRight: '1px solid #222',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 0',
      }}>
        <div style={{ padding: '0 16px 20px', borderBottom: '1px solid #222' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>CAI™ Core</div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>v0.1.7 · Designed to Be Copied</div>
        </div>
        <nav style={{ marginTop: 8 }}>
          {([
            ['dashboard', 'Dashboard'],
            ['conjunction', 'Conjunction'],
            ['substrate', 'Substrate'],
            ['settings', 'Settings'],
          ] as [Panel, string][]).map(([panel, label]) => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 16px',
                background: activePanel === panel ? '#1a1a2e' : 'transparent',
                color: activePanel === panel ? '#7c6af7' : '#aaa',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: activePanel === panel ? 600 : 400,
                borderLeft: `3px solid ${activePanel === panel ? '#7c6af7' : 'transparent'}`,
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', padding: '0 16px 16px', fontSize: 10, color: '#444' }}>
          SSPL-1.0 + Patent Pledge #2260
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {activePanel === 'dashboard' && <DashboardPanel />}
        {activePanel === 'conjunction' && <ConjunctionPanel />}
        {activePanel === 'substrate' && <SubstratePanel />}
        {activePanel === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}

// ─── Dashboard Panel ──────────────────────────────────────────────────────────

function DashboardPanel() {
  const [bmScore, setBmScore] = React.useState<{ composite: number } | null>(null);
  const [mpView, setMpView] = React.useState<{ combined_usd: number } | null>(null);

  React.useEffect(() => {
    const cai = (window as unknown as { caiCore?: {
      banyanMetric: { getLatest: () => Promise<{ score: { composite: number } } | null> };
      moneyPenny: { getDualView: () => Promise<{ combined_usd: number } | null> };
    } }).caiCore;
    if (!cai) return;
    cai.banyanMetric.getLatest().then((r) => r && setBmScore(r.score));
    cai.moneyPenny.getDualView().then((r) => r && setMpView(r));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>CAI™ Core Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard label="Banyan Metric™" value={bmScore ? `${bmScore.composite}/100` : '—'} />
        <StatCard label="MoneyPenny™ Saved" value={mpView ? `$${mpView.combined_usd.toFixed(4)}` : '—'} />
        <StatCard label="Architecture" value="Caithedral™ active" />
        <StatCard label="License" value="SSPL-1.0" />
      </div>
      <div style={{ marginTop: 32, padding: 16, background: '#111', borderRadius: 8, fontSize: 12, color: '#666', lineHeight: 1.8 }}>
        <strong style={{ color: '#aaa' }}>CAI™ Core v0.1.7</strong>
        {' · '}Cooperative AI Memory Architecture
        {' · '}Reference Implementation
        {' · '}Designed to Be Copied
        <br />
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); (window as unknown as { caiCore?: { app: { openExternal: (u: string) => void } } }).caiCore?.app.openExternal('https://mnemosynec.ai'); }}
          style={{ color: '#7c6af7' }}
        >
          mnemosynec.ai
        </a>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{value}</div>
    </div>
  );
}

// ─── CAI Core Conjunction Panel ───────────────────────────────────────────────

function ConjunctionPanel() {
  const [prompt, setPrompt] = useState('');
  const [vendor, setVendor] = useState('cpu_only');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dispatch = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const cai = (window as unknown as { caiCore?: { mcp: { dispatch: (p: string, v: string) => Promise<{ synthesized: string | null }> } } }).caiCore;
      const r = await cai?.mcp.dispatch(prompt, vendor);
      setResult(r?.synthesized ?? '[no result]');
    } catch (err) {
      setResult(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>CAI Core Conjunction</h1>
      <p style={{ color: '#666', fontSize: 12, marginBottom: 24 }}>
        Multi-vendor symmetric dispatch · no privileged orchestrator
      </p>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: '#aaa', display: 'block', marginBottom: 6 }}>Vendor</label>
        <select
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          style={{ background: '#111', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: '6px 10px', fontSize: 12 }}
        >
          <option value="cpu_only">CPU-only (Caithedral™ · zero cost)</option>
          <option value="ollama">Local Ollama</option>
          <option value="claude">Claude</option>
          <option value="all_in_conjunction">All in Conjunction</option>
        </select>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter prompt…"
        style={{
          width: '100%', minHeight: 120, background: '#111', color: '#e0e0e0',
          border: '1px solid #333', borderRadius: 4, padding: 10, fontSize: 12,
          resize: 'vertical', fontFamily: 'inherit',
        }}
      />
      <button
        onClick={dispatch}
        disabled={loading || !prompt.trim()}
        style={{
          marginTop: 12, padding: '8px 20px', background: loading ? '#333' : '#7c6af7',
          color: '#fff', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 13, fontWeight: 600,
        }}
      >
        {loading ? 'Dispatching…' : 'Dispatch'}
      </button>
      {result && (
        <div style={{
          marginTop: 16, padding: 12, background: '#111', border: '1px solid #222',
          borderRadius: 4, fontSize: 12, color: '#ccc', whiteSpace: 'pre-wrap',
        }}>
          {result}
        </div>
      )}
    </div>
  );
}

// ─── Substrate Panel ──────────────────────────────────────────────────────────

function SubstratePanel() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const cai = (window as unknown as { caiCore?: { substrate: { query: (t: string) => Promise<{ hit: boolean; record?: { text: string }; routing: string; latency_ms: number }> } } }).caiCore;
      const r = await cai?.substrate.query(query);
      if (r?.hit && r.record) {
        setResult(`[${r.routing} · ${r.latency_ms}ms]\n${r.record.text}`);
      } else {
        setResult(`[${r?.routing ?? 'miss'} · ${r?.latency_ms ?? 0}ms] No substrate hit`);
      }
    } catch (err) {
      setResult(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Substrate</h1>
      <p style={{ color: '#666', fontSize: 12, marginBottom: 24 }}>Caithedral™ CPU-only retrieval · zero LLM inference</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Query the substrate…"
          style={{
            flex: 1, background: '#111', color: '#e0e0e0', border: '1px solid #333',
            borderRadius: 4, padding: '8px 10px', fontSize: 12,
          }}
        />
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          style={{
            padding: '8px 16px', background: loading ? '#333' : '#7c6af7',
            color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          Query
        </button>
      </div>
      {result && (
        <div style={{
          padding: 12, background: '#111', border: '1px solid #222',
          borderRadius: 4, fontSize: 12, color: '#ccc', whiteSpace: 'pre-wrap',
        }}>
          {result}
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Settings</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 500 }}>
        <SettingItem label="CAI™ Core Home" description="Substrate data directory (CAI_CORE_HOME env var)" />
        <SettingItem label="Ollama Base URL" description="Local inference endpoint (default: http://localhost:11434)" />
        <SettingItem label="Anthropic API Key" description="Optional — for Claude backend in Conjunction" />
        <SettingItem label="Frame Mode" description="ai_burst · normal · fallback" />
        <SettingItem label="Download URL" description="https://mnemosynec.ai/download/ (canonical · no USB redistribution)" />
      </div>
      <div style={{ marginTop: 32, fontSize: 11, color: '#444', lineHeight: 1.8 }}>
        CAI™ Core v0.1.7 · SSPL-1.0 + Cooperative Patent Pledge #2260<br />
        © 2026 Liana Banyan Corporation · Wyoming · 50-year charter
      </div>
    </div>
  );
}

function SettingItem({ label, description }: { label: string; description: string }) {
  return (
    <div style={{ padding: 12, background: '#111', border: '1px solid #222', borderRadius: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#555' }}>{description}</div>
    </div>
  );
}
