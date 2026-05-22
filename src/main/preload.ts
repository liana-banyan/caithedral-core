/**
 * CAI™ Core — Electron Preload
 * v0.1.7 · BP051 NOVACULA SEG-CC-7
 * Exposes safe IPC bridge to renderer via contextBridge.
 * Strip: no auth, no federation token, no member marks.
 */

import { contextBridge, ipcRenderer } from 'electron';

// ─── Types (exposed to renderer) ──────────────────────────────────────────────

export type FrameMode = 'ai_burst' | 'normal' | 'fallback';

export interface SubstrateQueryResult {
  hit: boolean;
  record?: { id: string; text: string; source: string; keywords: string[]; ts: string };
  score?: number;
  routing: 'substrate_hit' | 'local_ollama' | 'cloud_escalation' | 'peer_sync' | 'miss';
  latency_ms: number;
  cloud_cost_avoided_usd: number;
}

// ─── API surface ──────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('caiCore', {
  // ── Substrate / Caithedral™ ──────────────────────────────────────────────────
  substrate: {
    query: (text: string) => ipcRenderer.invoke('substrate:query', text) as Promise<SubstrateQueryResult>,
    write: (record: { id: string; text: string; source: string }) => ipcRenderer.invoke('substrate:write', record),
    getMode: () => ipcRenderer.invoke('substrate:mode'),
    setMode: (mode: string | null) => ipcRenderer.invoke('substrate:setMode', mode),
  },

  // ── Pheromone ────────────────────────────────────────────────────────────────
  pheromone: {
    propagate: (trigger: string, sessionId?: string) => ipcRenderer.invoke('pheromone:propagate', trigger, sessionId),
    getEntities: () => ipcRenderer.invoke('pheromone:entities'),
    propagateROM: (sessionId?: string) => ipcRenderer.invoke('pheromone:propagateROM', sessionId),
  },

  // ── Wrasse ───────────────────────────────────────────────────────────────────
  wrasse: {
    preInject: (text: string, sessionId?: string) => ipcRenderer.invoke('wrasse:preInject', text, sessionId),
    registerTrigger: (phrase: string, entityId: string) => ipcRenderer.invoke('wrasse:registerTrigger', phrase, entityId),
    getTriggers: () => ipcRenderer.invoke('wrasse:getTriggers'),
    getStats: () => ipcRenderer.invoke('wrasse:getStats'),
  },

  // ── MCP ──────────────────────────────────────────────────────────────────────
  mcp: {
    dispatch: (prompt: string, vendor?: string) => ipcRenderer.invoke('mcp:dispatch', prompt, vendor),
    getState: () => ipcRenderer.invoke('mcp:getState'),
    selectVendor: (vendor: string) => ipcRenderer.invoke('mcp:selectVendor', vendor),
  },

  // ── AutoBaton CVT ────────────────────────────────────────────────────────────
  autoBaton: {
    dispatch: (request: unknown) => ipcRenderer.invoke('autobaton:dispatch', request),
    getWave: (waveId: string) => ipcRenderer.invoke('autobaton:getWave', waveId),
    abort: (waveId: string) => ipcRenderer.invoke('autobaton:abort', waveId),
    getSummary: () => ipcRenderer.invoke('autobaton:summary'),
  },

  // ── Banyan Metric™ / MoneyPenny™ ─────────────────────────────────────────────
  banyanMetric: {
    getLatest: () => ipcRenderer.invoke('banyanMetric:getLatest'),
    getTrend: (n?: number) => ipcRenderer.invoke('banyanMetric:getTrend', n),
  },
  moneyPenny: {
    getDualView: () => ipcRenderer.invoke('moneyPenny:getDualView'),
    getTotals: () => ipcRenderer.invoke('moneyPenny:getTotals'),
  },

  // ── App ──────────────────────────────────────────────────────────────────────
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
    openMoneyPenny: () => ipcRenderer.invoke('app:openMoneyPenny'),
    isFirstRun: () => ipcRenderer.invoke('app:firstRun'),
    markFirstRunComplete: () => ipcRenderer.invoke('app:markFirstRunComplete'),
  },

  // ── Deep-link events ─────────────────────────────────────────────────────────
  onDeepLink: (handler: (payload: { url: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { url: string }) => handler(payload);
    ipcRenderer.on('deep-link', listener);
    return () => ipcRenderer.off('deep-link', listener);
  },
});
