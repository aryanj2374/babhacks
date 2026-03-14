/**
 * ═══════════════════════════════════════════════════════════════════
 * OpenTix Ticketing Platform — Frontend Application
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Handles API calls to the Express backend and updates the UI
 * with real-time transaction results from XRPL Testnet.
 */

const API = '';

// ── State ────────────────────────────────────────────────────────
let appState = {
  initialized: false,
  wallets: {},
  tickets: [],
  balances: {},
};

// ── Helpers ──────────────────────────────────────────────────────

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function showResult(elementId, type, html) {
  const el = document.getElementById(elementId);
  el.className = `result-box visible ${type}`;
  el.innerHTML = html;
}

function addTxEntry(type, message, explorerUrl) {
  const txLog = document.getElementById('txLog');
  txLog.style.display = 'block';
  const entries = document.getElementById('txEntries');
  const entry = document.createElement('div');
  entry.className = 'tx-entry';
  entry.innerHTML = `
    <span class="tx-badge ${type.toLowerCase()}">${type}</span>
    <span class="tx-details">${message}</span>
    ${explorerUrl ? `<a class="tx-link" href="${explorerUrl}" target="_blank">View ↗</a>` : ''}
  `;
  entries.insertBefore(entry, entries.firstChild);
}

function updateTicketSelects() {
  const selects = ['buyTicketSelect', 'resellTicketSelect', 'verifyTicketSelect'];
  selects.forEach(selectId => {
    const sel = document.getElementById(selectId);
    sel.innerHTML = '';
    appState.tickets.forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      const owner = t.currentOwner || 'organizer';
      opt.textContent = `${t.metadata.seat} — ${t.metadata.originalPrice} RLUSD (owner: ${owner})`;
      sel.appendChild(opt);
    });
  });
}

function activateStep(stepNum) {
  for (let i = 1; i <= 5; i++) {
    const card = document.getElementById(`step${i}`);
    if (i < stepNum) {
      card.classList.remove('active');
      card.classList.add('completed');
    } else if (i === stepNum) {
      card.classList.add('active');
      card.classList.remove('completed');
    } else {
      card.classList.remove('active', 'completed');
    }
  }
}

// ── API Calls ────────────────────────────────────────────────────

async function doSetup() {
  setLoading('setupBtn', true);
  try {
    const res = await fetch(`${API}/api/setup`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    appState.initialized = true;
    appState.wallets = data.wallets;
    appState.balances = data.balances;
    appState.tickets = [];

    // Show wallet cards
    const grid = document.getElementById('walletGrid');
    grid.style.display = 'grid';
    grid.innerHTML = `
      <div class="wallet-card">
        <div class="wallet-label">🏢 Organizer (RLUSD Issuer)</div>
        <div class="wallet-address">${data.wallets.organizer}</div>
      </div>
      <div class="wallet-card">
        <div class="wallet-label">👤 Fan 1</div>
        <div class="wallet-address">${data.wallets.fan1}</div>
        <div class="wallet-balance">${data.balances.fan1} RLUSD</div>
      </div>
      <div class="wallet-card">
        <div class="wallet-label">👤 Fan 2</div>
        <div class="wallet-address">${data.wallets.fan2}</div>
        <div class="wallet-balance">${data.balances.fan2} RLUSD</div>
      </div>
    `;

    showResult('setupResult', 'success',
      '✅ Wallets funded & RLUSD distributed! Proceed to mint tickets.'
    );

    // Enable next steps
    document.getElementById('mintBtn').disabled = false;
    activateStep(2);
    addTxEntry('SETUP', 'Wallets created, trust lines set, RLUSD distributed');

  } catch (err) {
    showResult('setupResult', 'error', `❌ ${err.message}`);
  } finally {
    setLoading('setupBtn', false);
  }
}

async function doMint() {
  setLoading('mintBtn', true);
  try {
    const body = {
      eventName: document.getElementById('eventName').value,
      seat: document.getElementById('seat').value,
      originalPrice: document.getElementById('originalPrice').value,
      maxResalePrice: document.getElementById('maxResalePrice').value,
      eventDate: document.getElementById('eventDate').value + 'T20:00:00Z',
      maxResales: document.getElementById('maxResales').value,
    };

    const res = await fetch(`${API}/api/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    appState.tickets.push(data.ticket);
    updateTicketSelects();

    showResult('mintResult', 'success',
      `🎫 Ticket minted!<br>` +
      `NFTokenID: ${data.ticket.tokenId.slice(0, 24)}...<br>` +
      `<a href="${data.explorerUrl}" target="_blank">View on XRPL Explorer ↗</a>`
    );

    // Enable buy
    document.getElementById('buyBtn').disabled = false;
    activateStep(3);
    addTxEntry('MINT', `${body.seat} — ${body.originalPrice} RLUSD`, data.explorerUrl);

  } catch (err) {
    showResult('mintResult', 'error', `❌ ${err.message}`);
  } finally {
    setLoading('mintBtn', false);
  }
}

async function doBuy() {
  setLoading('buyBtn', true);
  try {
    const body = {
      ticketIndex: parseInt(document.getElementById('buyTicketSelect').value),
      buyer: document.getElementById('buyerSelect').value,
    };

    const res = await fetch(`${API}/api/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    // Update local state
    appState.tickets[body.ticketIndex].currentOwner = body.buyer;
    appState.balances = data.balances;
    updateTicketSelects();

    showResult('buyResult', 'success',
      `✅ ${body.buyer} purchased ticket for ${data.result.price} RLUSD!<br>` +
      `Fan 1 balance: ${data.balances.fan1} RLUSD | Fan 2 balance: ${data.balances.fan2} RLUSD<br>` +
      `<a href="${data.explorerUrl}" target="_blank">View on XRPL Explorer ↗</a>`
    );

    // Enable resell
    document.getElementById('scalpBtn').disabled = false;
    document.getElementById('verifyBtn').disabled = false;
    activateStep(4);
    addTxEntry('BUY', `${body.buyer} bought ticket for ${data.result.price} RLUSD`, data.explorerUrl);

  } catch (err) {
    showResult('buyResult', 'error', `❌ ${err.message}`);
  } finally {
    setLoading('buyBtn', false);
  }
}

async function doResell() {
  setLoading('scalpBtn', true);
  try {
    const body = {
      ticketIndex: parseInt(document.getElementById('resellTicketSelect').value),
      seller: document.getElementById('sellerSelect').value,
      buyer: document.getElementById('resellBuyerSelect').value,
      resalePrice: document.getElementById('resalePrice').value,
    };

    const res = await fetch(`${API}/api/resell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!data.success) {
      // OpenTix price-cap block!
      showResult('resellResult', 'error',
        `🚫 ${data.error}<br><br>` +
        `<em>OpenTix blocked this resale — price exceeds the cap. Try a lower price!</em>`
      );
      addTxEntry('BLOCKED', `Resale at ${body.resalePrice} RLUSD — BLOCKED by OpenTix`);
      return;
    }

    // Update local state
    appState.tickets[body.ticketIndex].currentOwner = body.buyer;
    appState.tickets[body.ticketIndex].metadata.resaleCount = data.result.newResaleCount;
    appState.balances = data.balances;
    updateTicketSelects();

    showResult('resellResult', 'success',
      `✅ Ticket resold from ${body.seller} to ${body.buyer} for ${body.resalePrice} RLUSD!<br>` +
      `💰 Royalty paid to organizer: ${data.result.royaltyPaid} RLUSD<br>` +
      `Fan 1: ${data.balances.fan1} RLUSD | Fan 2: ${data.balances.fan2} RLUSD<br>` +
      `<a href="${data.explorerUrl}" target="_blank">View on XRPL Explorer ↗</a>`
    );

    activateStep(5);
    addTxEntry('RESELL', `${body.seller} → ${body.buyer} for ${body.resalePrice} RLUSD (royalty: ${data.result.royaltyPaid})`, data.explorerUrl);

  } catch (err) {
    showResult('resellResult', 'error', `❌ ${err.message}`);
  } finally {
    setLoading('scalpBtn', false);
  }
}

async function doVerify() {
  setLoading('verifyBtn', true);
  try {
    const walletKey = document.getElementById('verifyWallet').value;
    const ticketIdx = parseInt(document.getElementById('verifyTicketSelect').value);
    const ticket = appState.tickets[ticketIdx];
    if (!ticket) throw new Error('No ticket selected');

    // Need to get the wallet address
    const res = await fetch(`${API}/api/status`);
    const status = await res.json();
    const address = status.wallets[walletKey];

    const verifyRes = await fetch(`${API}/api/verify?address=${address}&tokenId=${ticket.tokenId}`);
    const data = await verifyRes.json();
    if (!data.success) throw new Error(data.error);

    const v = data.verification;
    const type = v.owned ? (v.valid ? 'success' : 'info') : 'error';
    let html = `${v.message}<br>`;
    if (v.metadata) {
      html += `<br>Event: ${v.metadata.eventName || 'N/A'}`;
      html += `<br>Seat: ${v.metadata.seat || 'N/A'}`;
      html += `<br>Original Price: ${v.metadata.originalPrice || 'N/A'} RLUSD`;
      html += `<br>Max Resale: ${v.metadata.maxResalePrice || 'N/A'} RLUSD`;
      html += `<br>Resales: ${v.metadata.resaleCount || 0}/${v.metadata.maxResales || '∞'}`;
    }

    showResult('verifyResult', type, html);
    addTxEntry(v.owned ? 'VERIFY' : 'BLOCKED', `${walletKey}: ${v.owned ? 'owns' : 'does NOT own'} ticket`);

  } catch (err) {
    showResult('verifyResult', 'error', `❌ ${err.message}`);
  } finally {
    setLoading('verifyBtn', false);
  }
}
