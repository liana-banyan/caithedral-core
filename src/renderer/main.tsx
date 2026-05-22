/**
 * CAI™ Core — Renderer entry
 * v0.1.7 · BP051 NOVACULA SEG-CC-7
 *
 * Strip rules applied:
 *   - admin/, ambassador/, project/ routes deleted
 *   - FederationTab, FederationPeerMeshPane deleted
 *   - TrialBanner, ShareCard, AuthGate, AMPLIFYDashboard deleted
 *   - Mnemosyne UI labels → CAI Core
 *   - Conjunction Window renamed: "CAI Core Conjunction"
 */

import React, { useState, useEffect, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Suspense fallback={<div style={{ color: '#666', padding: 20 }}>Loading CAI™ Core…</div>}>
      <App />
    </Suspense>
  </React.StrictMode>,
);
