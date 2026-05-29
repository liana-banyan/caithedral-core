/**
 * CAI™ Core — Root App component
 * v0.1.8 · KniPr006
 *
 * Panels:
 *   Dashboard    — Caithedral™ stats + Banyan Metric™ score
 *   Conjunction  — CAI™ Core Conjunction Window (multi-vendor MCP dispatch)
 *   Substrate    — substrate query/write interface
 *   Substrated   — Substrated Folders manager (v0.1.8)
 *   Dev          — Banyan Metric™ Ledger Viewer (v0.1.8)
 *   Settings     — core settings
 */

import React, { useState } from 'react';
import { PearlGallery } from './components/PearlGallery.js';
import { PhoebePlane } from './components/PhoebePlane.js';
import { WhisperBar } from './components/WhisperBar.js';

type Panel = 'dashboard' | 'conjunction' | 'substrate' | 'substrated' | 'dev' | 'pearls' | 'phoebe' | 'settings';

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
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>Keystone I · Designed to Be Copied</div>
        </div>
        <nav style={{ marginTop: 8 }}>
          {([
            ['dashboard', 'Dashboard'],
            ['conjunction', 'Conjunction'],
            ['substrate', 'Substrate'],
            ['substrated', '✓ Substrated'],
            ['dev', 'Banyan Metric™'],
            ['pearls', 'Pearl Gallery™'],
            ['phoebe', 'Phoebe™'],
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
        {activePanel === 'substrated' && <SubstratedFoldersPanel />}
        {activePanel === 'dev' && <BanyanMetricLedgerPanel />}
        {activePanel === 'pearls' && <PearlGallery />}
        {activePanel === 'phoebe' && <PhoebePlane />}
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
        <strong style={{ color: '#aaa' }}>Caithedral Core Keystone I</strong>
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

// ─── CAI™ Core Conjunction Panel ─────────────────────────────────────────────

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
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>CAI™ Core Conjunction</h1>
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

// ─── Substrated Folders Panel (v0.1.8) ───────────────────────────────────────

interface CaiCoreApi {
  substratedFolders: {
    list: () => Promise<string[]>;
    add: (p?: string) => Promise<{ ok: boolean; paths: string[] }>;
    remove: (p: string) => Promise<{ ok: boolean; paths: string[] }>;
  };
  cfp: {
    getCathedralId: () => Promise<string>;
    getPeers: () => Promise<Array<{ peer_id: string; address: string; entry_count: number }>>;
  };
  banyanMetric: {
    getLatest: () => Promise<{ score: { composite: number; CW: number; WC: number; SC: number; RR: number; DR: number; CM: number }; session_id: string; bp_session: string; timestamp: string } | null>;
    getTrend: (n?: number) => Promise<Array<{ score: { composite: number }; session_id: string; bp_session: string; timestamp: string }>>;
  };
  moneyPenny: {
    getDualView: () => Promise<{ combined_usd: number } | null>;
    getTotals: () => Promise<unknown>;
  };
  app: { openExternal: (u: string) => void };
}

function getCai(): CaiCoreApi | null {
  return (window as unknown as { caiCore?: CaiCoreApi }).caiCore ?? null;
}

function SubstratedFoldersPanel() {
  const [folders, setFolders] = React.useState<string[]>([]);
  const [cathedralId, setCathedralId] = React.useState('');
  const [peers, setPeers] = React.useState<Array<{ peer_id: string; address: string; entry_count: number }>>([]);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const cai = getCai();
    if (!cai) return;
    const [f, cid, p] = await Promise.all([
      cai.substratedFolders.list(),
      cai.cfp.getCathedralId(),
      cai.cfp.getPeers(),
    ]);
    setFolders(f);
    setCathedralId(cid);
    setPeers(p);
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const addFolder = async () => {
    setLoading(true);
    const cai = getCai();
    if (!cai) { setLoading(false); return; }
    const result = await cai.substratedFolders.add();
    setFolders(result.paths);
    setLoading(false);
  };

  const removeFolder = async (path: string) => {
    const cai = getCai();
    if (!cai) return;
    const result = await cai.substratedFolders.remove(path);
    setFolders(result.paths);
  };

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>✓ Substrated Folders</h1>
      <p style={{ color: '#666', fontSize: 12, marginBottom: 20 }}>
        CAI™ Core reads <strong style={{ color: '#aaa' }}>only</strong> the folders you mark here.
        Files are never modified — Eblet™ records are written to{' '}
        <code style={{ color: '#7c6af7' }}>~/.cai_core/</code>. Shell overlay: v0.1.9 native DLL.
      </p>

      <button
        onClick={addFolder}
        disabled={loading}
        style={{
          padding: '8px 18px', background: loading ? '#333' : '#22c55e',
          color: '#000', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 13, fontWeight: 700, marginBottom: 16,
        }}
      >
        {loading ? 'Selecting…' : '+ Add Substrated Folder'}
      </button>

      {folders.length === 0 ? (
        <div style={{ padding: 20, background: '#111', borderRadius: 6, color: '#555', fontSize: 12 }}>
          No folders substrated yet. Click "Add Substrated Folder" to begin.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {folders.map((f) => (
            <div key={f} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', background: '#111', border: '1px solid #1a2e1a', borderRadius: 6,
            }}>
              <span style={{ color: '#22c55e', fontSize: 14, flexShrink: 0 }}>✓</span>
              <span style={{ flex: 1, fontSize: 12, color: '#ccc', wordBreak: 'break-all' }}>{f}</span>
              <span style={{ fontSize: 10, color: '#555', flexShrink: 0, marginRight: 4 }}>Substrated</span>
              <button
                onClick={() => removeFolder(f)}
                style={{
                  padding: '3px 8px', background: 'transparent', border: '1px solid #333',
                  borderRadius: 3, color: '#666', cursor: 'pointer', fontSize: 11,
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 28, padding: 14, background: '#0d1117', border: '1px solid #1e2533', borderRadius: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#7c6af7', marginBottom: 8 }}>CFP Federation (v0.1.8 scaffold)</div>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>
          Cathedral ID: <code style={{ color: '#aaa' }}>{cathedralId || '…'}</code>
        </div>
        <div style={{ fontSize: 11, color: '#555' }}>
          URI: <code style={{ color: '#7c6af7' }}>{cathedralId ? `cai://federate/${cathedralId}` : '…'}</code>
        </div>
        <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>
          Peers discovered (UDP 239.255.42.42:42424): <strong style={{ color: '#aaa' }}>{peers.length}</strong>
        </div>
        {peers.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {peers.slice(0, 5).map((p) => (
              <div key={p.peer_id} style={{ fontSize: 10, color: '#444' }}>
                {p.address} · {p.entry_count} entries
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10, color: '#333', marginTop: 10 }}>
          Body exchange deferred to v0.1.9 · Manifest schema exchange active
        </div>
      </div>
    </div>
  );
}

// ─── Banyan Metric™ Ledger Viewer (v0.1.8) ────────────────────────────────────

interface BmRow {
  score: { composite: number; CW: number; WC: number; SC: number; RR: number; DR: number; CM: number };
  session_id: string;
  bp_session: string;
  timestamp: string;
}

function BanyanMetricLedgerPanel() {
  const [rows, setRows] = React.useState<BmRow[]>([]);
  const [latest, setLatest] = React.useState<BmRow | null>(null);

  React.useEffect(() => {
    const cai = getCai();
    if (!cai) return;
    cai.banyanMetric.getLatest().then((r) => r && setLatest(r as BmRow));
    cai.banyanMetric.getTrend(10).then((t) => setRows((t as BmRow[]).slice().reverse()));
  }, []);

  const dim = (label: string, val: number, weight: string) => (
    <div key={label} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid #1a1a1a',
    }}>
      <div>
        <span style={{ fontSize: 12, color: '#ccc', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10, color: '#444', marginLeft: 6 }}>w={weight}</span>
      </div>
      <div style={{
        fontSize: 14, fontWeight: 700,
        color: val >= 80 ? '#22c55e' : val >= 50 ? '#f59e0b' : '#ef4444',
      }}>
        {val.toFixed(1)}
      </div>
    </div>
  );

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Banyan Metric™ Ledger</h1>
      <p style={{ color: '#666', fontSize: 12, marginBottom: 20 }}>
        6-dimension AI session scoring · CW · WC · SC · RR · DR · CM
      </p>

      {latest ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ padding: 16, background: '#111', border: '1px solid #222', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Composite Score</div>
            <div style={{
              fontSize: 36, fontWeight: 900,
              color: latest.score.composite >= 80 ? '#22c55e' : latest.score.composite >= 50 ? '#f59e0b' : '#ef4444',
            }}>
              {latest.score.composite.toFixed(2)}
              <span style={{ fontSize: 16, color: '#444' }}>/100</span>
            </div>
            <div style={{ fontSize: 10, color: '#444', marginTop: 6 }}>
              Session: {latest.session_id?.slice(0, 16)} · {latest.bp_session}
            </div>
          </div>
          <div style={{ padding: 16, background: '#111', border: '1px solid #222', borderRadius: 8 }}>
            {dim('CW — Context Window', latest.score.CW, '0.20')}
            {dim('WC — Work Completed', latest.score.WC, '0.20')}
            {dim('SC — Substrate Contrib', latest.score.SC, '0.15')}
            {dim('RR — Retrieval Rate', latest.score.RR, '0.20')}
            {dim('DR — Drift Rate', latest.score.DR, '0.10')}
            {dim('CM — Cost Mitigation', latest.score.CM, '0.15')}
          </div>
        </div>
      ) : (
        <div style={{ padding: 20, background: '#111', borderRadius: 6, color: '#555', fontSize: 12, marginBottom: 24 }}>
          No Banyan Metric™ records yet. Records are written when a session appends a score row.
        </div>
      )}

      {rows.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 8 }}>Session History (last 10)</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #222' }}>
                  {['Session', 'BP', 'Composite', 'CW', 'WC', 'SC', 'RR', 'DR', 'CM', 'Timestamp'].map((h) => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: '#555', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #111' }}>
                    <td style={{ padding: '5px 8px', color: '#aaa' }}>{r.session_id?.slice(0, 12)}</td>
                    <td style={{ padding: '5px 8px', color: '#666' }}>{r.bp_session}</td>
                    <td style={{ padding: '5px 8px', fontWeight: 700, color: r.score.composite >= 80 ? '#22c55e' : '#f59e0b' }}>
                      {r.score.composite.toFixed(1)}
                    </td>
                    {(['CW', 'WC', 'SC', 'RR', 'DR', 'CM'] as Array<keyof typeof r.score>).map((d) => (
                      <td key={d} style={{ padding: '5px 8px', color: '#666' }}>{r.score[d].toFixed(1)}</td>
                    ))}
                    <td style={{ padding: '5px 8px', color: '#444' }}>{new Date(r.timestamp).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        CAI™ Core v0.1.8 · SSPL-1.0 + Cooperative Patent Pledge #2260<br />
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
