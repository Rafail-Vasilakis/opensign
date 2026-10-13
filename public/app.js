// OpenSign Client-Side Engine
let templates = [];
let currentDoc = null;
let activeSigTab = 'draw';
let selectedTypedStyle = 'font-signature-1';

// Canvas state for drawing signature
const canvas = document.getElementById('sig-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let isDrawing = false;
let lastPoint = null;
let hasDrawn = false;

// Authentication & User Workspace State
let authToken = localStorage.getItem('opensign_token');
let currentUser = null;

function authHeaders(headers = {}) {
  const h = { ...headers };
  if (authToken) {
    h['Authorization'] = `Bearer ${authToken}`;
  }
  return h;
}

async function authFetch(url, options = {}) {
  options.headers = authHeaders(options.headers || {});
  const res = await fetch(url, options);
  if (res.status === 401) {
    currentUser = null;
    localStorage.removeItem('opensign_token');
    updateNavAuth();
    showAuthModal('login');
    throw new Error('Please log in to your sender account.');
  }
  return res;
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  initIcons();
  initCanvas();
  initPdfDropzone();
  await loadTemplates();
  await checkAuthSession();
});

async function checkAuthSession() {
  authToken = localStorage.getItem('opensign_token');
  if (!authToken) {
    updateNavAuth();
    showAuthModal('login');
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      updateNavAuth();
      hideAuthModal();
      await fetchStats();
      await fetchDocuments();
    } else {
      currentUser = null;
      localStorage.removeItem('opensign_token');
      updateNavAuth();
      showAuthModal('login');
    }
  } catch (err) {
    console.error('Auth check error:', err);
    updateNavAuth();
    showAuthModal('login');
  }
}

function updateNavAuth() {
  const container = document.getElementById('nav-auth-container');
  if (!container) return;

  if (currentUser) {
    container.innerHTML = `
      <div class="flex items-center space-x-2">
        <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200">
          ${escapeHtml(currentUser.name.charAt(0).toUpperCase())}
        </div>
        <div class="hidden md:block text-left text-xs">
          <p class="font-bold text-slate-800 leading-tight">${escapeHtml(currentUser.name)}</p>
          <p class="text-[10px] text-slate-400 font-mono">${escapeHtml(currentUser.email)}</p>
        </div>
        <button onclick="logout()" class="text-xs text-slate-500 hover:text-red-600 font-semibold px-2 py-1 rounded hover:bg-slate-100 transition-colors ml-1" title="Sign Out">
          Sign Out
        </button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button onclick="showAuthModal('login')" class="text-xs font-bold text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
        Sign In
      </button>
    `;
  }
  initIcons();
}

function showAuthModal(tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
  switchAuthTab(tab);
  const errAlert = document.getElementById('auth-error-alert');
  if (errAlert) errAlert.classList.add('hidden');
  initIcons();
}

function hideAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function switchAuthTab(tab) {
  const loginBtn = document.getElementById('auth-tab-login-btn');
  const regBtn = document.getElementById('auth-tab-reg-btn');
  const loginForm = document.getElementById('auth-login-form');
  const regForm = document.getElementById('auth-reg-form');
  const errAlert = document.getElementById('auth-error-alert');
  if (errAlert) errAlert.classList.add('hidden');

  if (tab === 'login') {
    loginBtn.className = 'flex-1 py-3 text-indigo-600 border-b-2 border-indigo-600 bg-white font-bold';
    regBtn.className = 'flex-1 py-3 text-slate-500 border-b-2 border-transparent hover:text-slate-700 font-bold';
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
  } else {
    regBtn.className = 'flex-1 py-3 text-indigo-600 border-b-2 border-indigo-600 bg-white font-bold';
    loginBtn.className = 'flex-1 py-3 text-slate-500 border-b-2 border-transparent hover:text-slate-700 font-bold';
    regForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  }
}

async function quickDemoLogin() {
  document.getElementById('auth-login-email').value = 'rafael@opensign.local';
  document.getElementById('auth-login-password').value = 'password123';
  await submitLogin();
}

async function submitLogin() {
  const email = document.getElementById('auth-login-email').value.trim();
  const password = document.getElementById('auth-login-password').value;
  const errAlert = document.getElementById('auth-error-alert');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('opensign_token', authToken);
    hideAuthModal();
    updateNavAuth();
    showToast(`Welcome back, ${currentUser.name}!`);
    await fetchStats();
    await fetchDocuments();
  } catch (err) {
    if (errAlert) {
      errAlert.textContent = err.message;
      errAlert.classList.remove('hidden');
    }
  }
}

async function submitRegister() {
  const name = document.getElementById('auth-reg-name').value.trim();
  const email = document.getElementById('auth-reg-email').value.trim();
  const password = document.getElementById('auth-reg-password').value;
  const errAlert = document.getElementById('auth-error-alert');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('opensign_token', authToken);
    hideAuthModal();
    updateNavAuth();
    showToast(`Account created! Welcome, ${currentUser.name}.`);
    await fetchStats();
    await fetchDocuments();
  } catch (err) {
    if (errAlert) {
      errAlert.textContent = err.message;
      errAlert.classList.remove('hidden');
    }
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders()
    });
  } catch (e) {}

  authToken = null;
  currentUser = null;
  localStorage.removeItem('opensign_token');
  document.getElementById('documents-table-body').innerHTML = `
    <tr>
      <td colspan="5" class="px-6 py-8 text-center text-slate-400">
        Please sign in to view your envelopes.
      </td>
    </tr>`;
  document.getElementById('stat-total').textContent = '0';
  document.getElementById('stat-completed').textContent = '0';
  document.getElementById('stat-pending').textContent = '0';
  document.getElementById('stat-saved').textContent = '$0';
  updateNavAuth();
  showAuthModal('login');
}

function initIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

// ==========================================
// API & DATA FETCHING
// ==========================================

async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    templates = await res.json();
    
    const select = document.getElementById('new-template-select');
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.title} (${t.category})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load templates:', err);
  }
}

async function fetchStats() {
  try {
    const res = await authFetch('/api/stats');
    const data = await res.json();
    document.getElementById('stat-total').textContent = data.totalEnvelopes;
    document.getElementById('stat-completed').textContent = data.completedEnvelopes;
    document.getElementById('stat-pending').textContent = data.pendingEnvelopes;
    document.getElementById('stat-saved').textContent = `$${data.estimatedSavingsDollars}`;
  } catch (err) {
    console.error('Failed to fetch stats:', err);
  }
}

async function fetchDocuments() {
  try {
    const res = await authFetch('/api/documents');
    const docs = await res.json();
    const tbody = document.getElementById('documents-table-body');
    tbody.innerHTML = '';

    if (docs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="px-6 py-8 text-center text-slate-400">
            No envelopes created yet. Click "New Envelope" to get started!
          </td>
        </tr>`;
      return;
    }

    docs.forEach(doc => {
      const signingUrl = `${window.location.origin}/sign/${doc.id}`;
      const protectedBadge = doc.isPasswordProtected
        ? ` <span class="inline-flex items-center text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-normal ml-1" title="Passcode Protected"><i data-lucide="lock" class="w-2.5 h-2.5 mr-0.5 inline"></i>PIN</span>`
        : '';
      const dateStr = new Date(doc.createdAt).toLocaleDateString();

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/80 transition-colors cursor-pointer';
      tr.onclick = (e) => {
        if (!e.target.closest('button')) {
          openViewer(doc.id);
        }
      };

      const isCompleted = doc.status === 'completed';
      let statusBadge = '';
      let actionButtons = '';

      if (isCompleted) {
        statusBadge = `
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            <i data-lucide="check" class="w-3 h-3 mr-1"></i> Completed
          </span>`;
        actionButtons = `
          <button onclick="event.stopPropagation(); triggerPdfDownload('${doc.id}', '${escapeHtml(doc.title)}')" class="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-200 inline-flex items-center shadow-sm" title="Download Official Vector PDF">
            📥 PDF
          </button>
          <button onclick="openViewer('${doc.id}')" class="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors border border-emerald-200">
            View & Audit
          </button>
        `;
      } else if (doc.myTurn) {
        // DocuSign Action Required: Counter-signature active!
        statusBadge = `
          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 animate-pulse">
            <i data-lucide="bell-ring" class="w-3 h-3 mr-1 text-indigo-600"></i> Action Required
          </span>`;
        actionButtons = `
          <a href="/sign/${doc.id}?signer=signer_2" target="_blank" onclick="event.stopPropagation()" class="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md transition-all inline-flex items-center">
            <i data-lucide="pen-tool" class="w-3.5 h-3.5 mr-1"></i> Sign Your Turn
          </a>
          <button onclick="openViewer('${doc.id}')" class="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors shadow-sm">
            👁️ Details
          </button>
        `;
      } else {
        // Waiting for the other party (Client)
        statusBadge = `
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            <i data-lucide="clock" class="w-3 h-3 mr-1"></i> Waiting for ${escapeHtml(doc.activeSignerName || doc.recipientName)}
          </span>`;
        actionButtons = `
          <button onclick="copySigningLink('${signingUrl}', event)" class="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors shadow-sm" title="Copy link to send to recipient">
            📋 Copy Link
          </button>
          <button onclick="openViewer('${doc.id}')" class="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors shadow-sm">
            👁️ Details
          </button>
        `;
      }

      const signerOrderTrail = doc.signers && doc.signers.length > 1
        ? `<div class="text-[10px] mt-0.5">${doc.signers.map(s => s.status === 'completed' ? `<span class="text-emerald-700 font-bold">✓ ${escapeHtml(s.name)}</span>` : (s.status === 'pending' ? `<span class="text-amber-700 font-bold">● ${escapeHtml(s.name)}</span>` : `<span class="text-slate-400">○ ${escapeHtml(s.name)}</span>`)).join(' &rarr; ')}</div>`
        : `<div class="text-xs text-slate-400">${escapeHtml(doc.recipientEmail)}</div>`;

      tr.innerHTML = `
        <td class="px-6 py-4 font-semibold text-slate-900">${escapeHtml(doc.title)}${protectedBadge}</td>
        <td class="px-6 py-4 text-slate-600">
          <div>${escapeHtml(doc.recipientName)}</div>
          ${signerOrderTrail}
        </td>
        <td class="px-6 py-4">${statusBadge}</td>
        <td class="px-6 py-4 text-slate-500 text-xs">${dateStr}</td>
        <td class="px-6 py-4 text-right space-x-2">
          ${actionButtons}
          <button onclick="deleteDoc('${doc.id}', event)" class="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100 transition-colors" title="Delete">
            <i data-lucide="trash-2" class="w-4 h-4 inline"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    initIcons();
  } catch (err) {
    console.error('Failed to fetch documents:', err);
  }
}

// ==========================================
// NAVIGATION & VIEW SWITCHING
// ==========================================

function showDashboard() {
  document.getElementById('dashboard-view').classList.remove('hidden');
  document.getElementById('viewer-view').classList.add('hidden');
  currentDoc = null;
  fetchStats();
  fetchDocuments();
}

async function openViewer(docId) {
  try {
    const res = await fetch(`/api/documents/${docId}`);
    if (!res.ok) throw new Error('Document not found');
    currentDoc = await res.json();

    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('viewer-view').classList.remove('hidden');

    renderDocumentViewer(currentDoc);
    initIcons();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    alert('Error loading document: ' + err.message);
  }
}

function renderDocumentViewer(doc) {
  document.getElementById('doc-view-title').textContent = doc.title;
  document.getElementById('doc-view-meta').innerHTML = `Document ID: <span class="font-mono text-indigo-600 font-bold">${doc.id}</span> • Created: ${new Date(doc.createdAt).toLocaleDateString()}`;
  document.getElementById('doc-view-content').textContent = doc.content;

  // Status Badge
  const statusContainer = document.getElementById('doc-view-status-badge');
  const actionContainer = document.getElementById('sign-action-container');
  const signerCard = document.getElementById('signer-execution-card');

  if (doc.status === 'completed') {
    statusContainer.innerHTML = `
      <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
        <i data-lucide="shield-check" class="w-4 h-4 mr-1.5 text-emerald-600"></i> Legally Executed
      </span>`;

    actionContainer.innerHTML = `
      <span class="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
        <i data-lucide="lock" class="w-4 h-4 mr-1.5"></i> Tamper Seal Active
      </span>`;

    signerCard.className = 'p-5 rounded-xl border border-emerald-200 bg-emerald-50/40';
    signerCard.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Digitally Signed By</p>
        <span class="text-[10px] font-mono text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">Verified</span>
      </div>
      <div class="py-2 flex items-center justify-center">
        <img src="${doc.signatureData.image}" alt="Signature" class="max-h-16 object-contain" />
      </div>
      <div class="pt-3 border-t border-emerald-200 text-xs text-slate-600">
        <p class="font-bold text-slate-800">${escapeHtml(doc.recipientName)}</p>
        <p class="text-[11px] text-slate-500 font-mono mt-0.5">${new Date(doc.signedAt).toUTCString()}</p>
      </div>`;
  } else if (doc.myTurn || (doc.signers && doc.signers.some(s => s.status === 'pending' && s.isSender))) {
    statusContainer.innerHTML = `
      <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 animate-pulse">
        <i data-lucide="bell-ring" class="w-4 h-4 mr-1.5 text-indigo-600"></i> Action Required: Your Turn
      </span>`;

    actionContainer.innerHTML = `
      <a href="/sign/${doc.id}?signer=signer_2" target="_blank" class="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md transition-all">
        <i data-lucide="pen-tool" class="w-4 h-4 mr-1.5"></i> Sign Counter-Signature &rarr;
      </a>`;

    signerCard.className = 'p-5 rounded-xl border border-indigo-200 bg-indigo-50/60';
    signerCard.onclick = null;
    signerCard.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Your Counter-Sign Slot</p>
        <span class="text-[10px] bg-indigo-200 text-indigo-900 font-bold px-2 py-0.5 rounded">ACTION REQUIRED</span>
      </div>
      <p class="text-sm font-bold text-slate-800">${escapeHtml(doc.activeSignerName || 'Rafael (Sender)')}</p>
      <p class="text-xs text-slate-500 mb-3">${escapeHtml(doc.activeSignerEmail || '')}</p>
      <div class="p-3 bg-white rounded-lg border border-indigo-200 text-[11px] text-slate-600">
        <p class="font-bold text-indigo-900 mb-0.5">Primary Party Has Executed:</p>
        <span>The initial signer completed their execution. Click the green button above to apply your counter-signature and finalize the agreement.</span>
      </div>`;
  } else {
    statusContainer.innerHTML = `
      <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
        <i data-lucide="clock" class="w-4 h-4 mr-1.5 text-amber-600"></i> Awaiting Signature
      </span>`;

    const signingUrl = `${window.location.origin}/sign/${doc.id}`;
    actionContainer.innerHTML = `
      <button onclick="copySigningLink('${signingUrl}', event)" class="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm">
        <i data-lucide="copy" class="w-4 h-4 mr-1.5"></i> Copy Recipient Sign Link
      </button>`;

    signerCard.className = 'p-5 rounded-xl border border-amber-200 bg-amber-50/50';
    signerCard.onclick = null;
    signerCard.innerHTML = `
      <div class="flex items-center justify-between mb-2">
        <p class="text-xs font-semibold text-amber-700 uppercase tracking-wider">Designated Signer</p>
        <span class="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded">PENDING RECIPIENT</span>
      </div>
      <p class="text-sm font-bold text-slate-800">${escapeHtml(doc.recipientName)}</p>
      <p class="text-xs text-slate-500 mb-3">${escapeHtml(doc.recipientEmail)}</p>
      <div class="p-3 bg-white rounded-lg border border-amber-200 text-[11px] text-slate-600 flex items-start space-x-2">
        <i data-lucide="shield-alert" class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5"></i>
        <span><strong>Admin Security Policy:</strong> You cannot execute signatures on behalf of recipients from the dashboard. Share the recipient link above.</span>
      </div>`;
  }

  // Certificate Section
  document.getElementById('cert-id-badge').textContent = doc.certificateId || 'PENDING SIGNATURE';
  document.getElementById('audit-pre-hash').textContent = doc.preSignHash || '--';
  document.getElementById('audit-post-hash').textContent = doc.postSignHash || 'Awaiting completion...';
  document.getElementById('audit-signer-name').textContent = doc.recipientName;
  document.getElementById('audit-signer-email').textContent = doc.recipientEmail;
  document.getElementById('audit-timestamp').textContent = doc.signedAt ? new Date(doc.signedAt).toUTCString() : 'Not executed yet';

  // Render Audit Trail Timeline
  const timeline = document.getElementById('audit-timeline');
  timeline.innerHTML = '';
  doc.auditLog.forEach(log => {
    const item = document.createElement('div');
    item.className = 'relative pl-2';
    item.innerHTML = `
      <div class="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-white"></div>
      <div class="flex items-center justify-between text-slate-500 text-[11px]">
        <span class="font-bold text-slate-700">${escapeHtml(log.event)}</span>
        <span class="font-mono">${new Date(log.timestamp).toLocaleTimeString()} • ${new Date(log.timestamp).toLocaleDateString()}</span>
      </div>
      <p class="text-slate-600 mt-0.5">${escapeHtml(log.details)}</p>
      <p class="text-[10px] text-slate-400 font-mono mt-0.5">IP: ${escapeHtml(log.ip)}</p>
    `;
    timeline.appendChild(item);
  });
}

// ==========================================
// MODAL & FORM HANDLING
// ==========================================

let currentSignMode = 'others';

function onSignModeChange(mode) {
  currentSignMode = mode;
  const othersLabel = document.getElementById('mode-others-label');
  const bothLabel = document.getElementById('mode-both-label');
  const counterCard = document.getElementById('counter-signer-card');

  if (mode === 'both') {
    if (counterCard) counterCard.classList.remove('hidden');
    if (bothLabel) {
      bothLabel.className = 'flex items-start p-3 rounded-xl border-2 border-indigo-600 bg-indigo-50/50 cursor-pointer transition-all';
    }
    if (othersLabel) {
      othersLabel.className = 'flex items-start p-3 rounded-xl border-2 border-slate-200 hover:border-slate-300 bg-white cursor-pointer transition-all';
    }
  } else {
    if (counterCard) counterCard.classList.add('hidden');
    if (othersLabel) {
      othersLabel.className = 'flex items-start p-3 rounded-xl border-2 border-indigo-600 bg-indigo-50/50 cursor-pointer transition-all';
    }
    if (bothLabel) {
      bothLabel.className = 'flex items-start p-3 rounded-xl border-2 border-slate-200 hover:border-slate-300 bg-white cursor-pointer transition-all';
    }
  }
  initIcons();
}

function showCreateModal() {
  document.getElementById('create-modal').classList.remove('hidden');
  const radioOthers = document.querySelector('input[name="signModeRadio"][value="others"]');
  if (radioOthers) radioOthers.checked = true;
  onSignModeChange('others');
  onTemplateChange();

  if (currentUser) {
    const senderNameInput = document.getElementById('sender-name-input');
    const senderEmailInput = document.getElementById('sender-email-input');
    if (senderNameInput && currentUser.name) senderNameInput.value = currentUser.name;
    if (senderEmailInput && currentUser.email) senderEmailInput.value = currentUser.email;
  }
}

function hideCreateModal() {
  document.getElementById('create-modal').classList.add('hidden');
}

function onTemplateChange() {
  const select = document.getElementById('new-template-select');
  const templateId = select.value;
  const titleInput = document.getElementById('new-doc-title');
  const contentInput = document.getElementById('new-doc-content');

  if (templateId) {
    const t = templates.find(item => item.id === templateId);
    if (t) {
      titleInput.value = t.title;
      contentInput.value = t.content;
    }
  } else {
    titleInput.value = '';
    contentInput.value = '';
  }
}

async function submitNewDocument() {
  const templateId = document.getElementById('new-template-select').value;
  const title = document.getElementById('new-doc-title').value.trim();
  const recipientName = document.getElementById('new-recipient-name').value.trim();
  const recipientEmail = document.getElementById('new-recipient-email').value.trim();
  const customContent = document.getElementById('new-doc-content').value;

  if (!recipientName || !recipientEmail) {
    alert('Please enter recipient name and email.');
    return;
  }

  const accessCode = (document.getElementById('new-access-code')?.value || '').trim();
  const signMode = currentSignMode;
  const defaultSenderName = currentUser ? currentUser.name : 'Rafael (Sender)';
  const defaultSenderEmail = currentUser ? currentUser.email : 'rafael@opensign.local';
  const senderName = (document.getElementById('sender-name-input')?.value || defaultSenderName).trim();
  const senderEmail = (document.getElementById('sender-email-input')?.value || defaultSenderEmail).trim();

  try {
    const res = await authFetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        templateId,
        customContent,
        recipientName,
        recipientEmail,
        signMode,
        senderName: signMode === 'both' ? senderName : null,
        senderEmail: signMode === 'both' ? senderEmail : null,
        accessCode: accessCode || null
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create envelope');
    }

    const created = await res.json();
    hideCreateModal();
    openViewer(created.id);
  } catch (err) {
    alert(err.message);
  }
}

async function deleteDoc(id, e) {
  e.stopPropagation();
  if (!confirm('Are you sure you want to delete this envelope?')) return;

  try {
    const res = await authFetch(`/api/documents/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchStats();
      fetchDocuments();
    }
  } catch (err) {
    alert('Error deleting document: ' + err.message);
  }
}

// ==========================================
// SIGNATURE SUITE & CANVAS ENGINE
// ==========================================

function showSignatureModal() {
  if (!currentDoc) return;
  document.getElementById('signature-modal').classList.remove('hidden');
  document.getElementById('sig-typed-name').value = currentDoc.recipientName || '';
  renderTypedSignatures();
  clearCanvas();
  document.getElementById('legal-consent-checkbox').checked = false;
  switchSignatureTab('draw');
}

function hideSignatureModal() {
  document.getElementById('signature-modal').classList.add('hidden');
}

function switchSignatureTab(tab) {
  activeSigTab = tab;
  const drawBtn = document.getElementById('tab-draw-btn');
  const typeBtn = document.getElementById('tab-type-btn');
  const drawPane = document.getElementById('sig-draw-pane');
  const typePane = document.getElementById('sig-type-pane');

  if (tab === 'draw') {
    drawBtn.className = 'pb-2.5 px-4 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600 transition-colors';
    typeBtn.className = 'pb-2.5 px-4 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors';
    drawPane.classList.remove('hidden');
    typePane.classList.add('hidden');
  } else {
    typeBtn.className = 'pb-2.5 px-4 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600 transition-colors';
    drawBtn.className = 'pb-2.5 px-4 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-colors';
    typePane.classList.remove('hidden');
    drawPane.classList.add('hidden');
    renderTypedSignatures();
  }
}

function initCanvas() {
  if (!canvas || !ctx) return;

  // Support DPI scaling
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = (rect.width || 500) * ratio;
  canvas.height = (rect.height || 180) * ratio;
  ctx.scale(ratio, ratio);

  ctx.strokeStyle = '#1e3a8a'; // Authentic navy ink
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - r.left,
      y: clientY - r.top
    };
  }

  function start(e) {
    e.preventDefault();
    isDrawing = true;
    hasDrawn = true;
    lastPoint = getPos(e);
  }

  function move(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const currentPoint = getPos(e);

    // Smooth Bézier midpoint interpolation
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    const midX = (lastPoint.x + currentPoint.x) / 2;
    const midY = (lastPoint.y + currentPoint.y) / 2;
    ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midX, midY);
    ctx.stroke();

    lastPoint = currentPoint;
  }

  function stop() {
    isDrawing = false;
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', stop);

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', stop);
}

function clearCanvas() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasDrawn = false;
}

function renderTypedSignatures() {
  const name = document.getElementById('sig-typed-name').value.trim() || 'Your Name';
  const container = document.getElementById('typed-style-options');
  container.innerHTML = '';

  const styles = [
    { id: 'font-signature-1', label: 'Dancing Script' },
    { id: 'font-signature-2', label: 'Caveat Script' },
    { id: 'font-signature-3', label: 'Great Vibes' },
    { id: 'font-signature-4', label: 'Pacifico' }
  ];

  styles.forEach((style, idx) => {
    const isSelected = selectedTypedStyle === style.id;
    const box = document.createElement('div');
    box.className = `p-3 rounded-lg border-2 cursor-pointer transition-all flex flex-col justify-between ${
      isSelected ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'
    }`;
    box.onclick = () => {
      selectedTypedStyle = style.id;
      renderTypedSignatures();
    };

    box.innerHTML = `
      <div class="${style.id} text-2xl text-blue-900 truncate py-1">${escapeHtml(name)}</div>
      <div class="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
        <span>${style.label}</span>
        ${isSelected ? '<span class="text-indigo-600 font-bold">Selected</span>' : ''}
      </div>
    `;
    container.appendChild(box);
  });
}

// Convert Typed Name to High-Res Image Data URL
function generateTypedSignatureImage(name, fontClass) {
  const offscreen = document.createElement('canvas');
  offscreen.width = 600;
  offscreen.height = 200;
  const offCtx = offscreen.getContext('2d');

  let fontFamily = 'Dancing Script';
  if (fontClass === 'font-signature-2') fontFamily = 'Caveat';
  if (fontClass === 'font-signature-3') fontFamily = 'Great Vibes';
  if (fontClass === 'font-signature-4') fontFamily = 'Pacifico';

  offCtx.font = `64px "${fontFamily}", cursive`;
  offCtx.fillStyle = '#1e3a8a'; // Navy blue ink
  offCtx.textAlign = 'center';
  offCtx.textBaseline = 'middle';
  offCtx.fillText(name, 300, 100);

  return offscreen.toDataURL('image/png');
}

async function applySignature() {
  const agreed = document.getElementById('legal-consent-checkbox').checked;
  if (!agreed) {
    alert('Please check the legal consent box to accept electronic execution.');
    return;
  }

  let signatureBase64 = null;

  if (activeSigTab === 'draw') {
    if (!hasDrawn) {
      alert('Please draw your signature in the box before proceeding.');
      return;
    }
    signatureBase64 = canvas.toDataURL('image/png');
  } else {
    const name = document.getElementById('sig-typed-name').value.trim();
    if (!name) {
      alert('Please type your legal name.');
      return;
    }
    signatureBase64 = generateTypedSignatureImage(name, selectedTypedStyle);
  }

  try {
    const res = await fetch(`/api/documents/${currentDoc.id}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signatureImage: signatureBase64,
        signatureType: activeSigTab,
        signerName: currentDoc.recipientName,
        agreedToLegalNotice: true
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to sign document');
    }

    const result = await res.json();
    hideSignatureModal();
    openViewer(result.document.id);
  } catch (err) {
    alert('Signing failed: ' + err.message);
  }
}

// Utility: HTML Escaping
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Utility: Copy Signing Link to Clipboard with visual feedback
function copySigningLink(url, e) {
  if (e) e.stopPropagation();
  navigator.clipboard.writeText(url).then(() => {
    showToast('Link copied to clipboard! Send this to the recipient.');
  }).catch(() => {
    prompt('Copy this signing link:', url);
  });
}

function showToast(message) {
  const existing = document.getElementById('toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-notification';
  toast.className = 'fixed bottom-5 right-5 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center space-x-2 border border-slate-700 animate-bounce';
  toast.innerHTML = `<span>✓</span><span>${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function downloadOfficialPDF() {
  if (!currentDoc) return;
  triggerPdfDownload(currentDoc.id, currentDoc.title);
}

function triggerPdfDownload(docId, title) {
  const safeTitle = (title || 'Agreement').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeTitle}_Signed.pdf`;

  const a = document.createElement('a');
  a.href = `/api/documents/${docId}/pdf`;
  a.setAttribute('download', filename);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
  }, 500);

  showToast('📥 Downloading official signed PDF...');
}

async function clearAllDocuments() {
  if (!confirm('Are you sure you want to delete ALL envelopes? This will reset the database.')) return;
  try {
    const res = await fetch('/api/documents', { method: 'DELETE' });
    if (res.ok) {
      showToast('All documents deleted successfully.');
      fetchStats();
      fetchDocuments();
    }
  } catch (err) {
    alert('Error deleting documents: ' + err.message);
  }
}

// ==========================================
// CUSTOM PDF & MULTI-SIGNER STUDIO LAUNCHER
// ==========================================

function switchCreateModalTab(tab) {
  const tmplBtn = document.getElementById('tab-tmpl-btn');
  const pdfBtn = document.getElementById('tab-pdf-btn');
  const tmplPane = document.getElementById('pane-template-content');
  const pdfPane = document.getElementById('pane-pdf-content');

  if (tab === 'template') {
    tmplBtn.className = 'pb-3 px-4 text-xs font-bold border-b-2 border-indigo-600 text-indigo-600 transition-colors flex items-center';
    pdfBtn.className = 'pb-3 px-4 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-colors flex items-center';
    tmplPane.classList.remove('hidden');
    pdfPane.classList.add('hidden');
  } else {
    pdfBtn.className = 'pb-3 px-4 text-xs font-bold border-b-2 border-indigo-600 text-indigo-600 transition-colors flex items-center';
    tmplBtn.className = 'pb-3 px-4 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-colors flex items-center';
    pdfPane.classList.remove('hidden');
    tmplPane.classList.add('hidden');
  }
  initIcons();
}

function initPdfDropzone() {
  const dropzone = document.getElementById('pdf-dropzone');
  const fileInput = document.getElementById('custom-pdf-upload');
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('border-indigo-500', 'bg-indigo-50/60');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('border-indigo-500', 'bg-indigo-50/60');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      fileInput.files = files;
      handleFileSelection({ target: fileInput });
    }
  });
}

function handleFileSelection(e) {
  const file = e.target.files && e.target.files[0];
  const errorEl = document.getElementById('pdf-upload-error');
  const idleEl = document.getElementById('dropzone-idle');
  const selectedEl = document.getElementById('dropzone-selected');
  const nameEl = document.getElementById('selected-filename');
  const sizeEl = document.getElementById('selected-filesize');
  const titleInput = document.getElementById('custom-pdf-title');

  if (errorEl) errorEl.classList.add('hidden');

  if (file) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      if (errorEl) {
        errorEl.textContent = '⚠️ Only PDF files are supported.';
        errorEl.classList.remove('hidden');
      }
      e.target.value = '';
      return;
    }

    if (idleEl) idleEl.classList.add('hidden');
    if (selectedEl) selectedEl.classList.remove('hidden');
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) {
      const kb = Math.round(file.size / 1024);
      sizeEl.textContent = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
    }

    if (titleInput && !titleInput.value.trim()) {
      titleInput.value = file.name.replace(/\.pdf$/i, '');
    }

    initIcons();
  } else {
    if (idleEl) idleEl.classList.remove('hidden');
    if (selectedEl) selectedEl.classList.add('hidden');
  }
}

let signerCounter = 1;
function addSignerField() {
  signerCounter++;
  const list = document.getElementById('signers-roster-list');
  const entry = document.createElement('div');
  entry.className = 'signer-entry p-3.5 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5 relative';
  entry.innerHTML = `
    <div>
      <label class="text-[10px] font-bold text-slate-500 uppercase">Signer ${signerCounter} Name *</label>
      <input type="text" class="signer-name w-full border border-slate-300 rounded-md px-2 py-1 text-xs focus:ring-indigo-500" placeholder="Signer Name" required>
    </div>
    <div>
      <label class="text-[10px] font-bold text-slate-500 uppercase">Email *</label>
      <input type="email" class="signer-email w-full border border-slate-300 rounded-md px-2 py-1 text-xs focus:ring-indigo-500" placeholder="signer${signerCounter}@example.com" required>
    </div>
    <div>
      <label class="text-[10px] font-bold text-slate-500 uppercase">Role</label>
      <div class="flex items-center space-x-1">
        <input type="text" class="signer-role w-full border border-slate-300 rounded-md px-2 py-1 text-xs focus:ring-indigo-500" placeholder="Approver / Second Signer">
        <button type="button" onclick="this.closest('.signer-entry').remove()" class="text-slate-400 hover:text-red-600 px-1.5 py-1 text-sm font-bold">×</button>
      </div>
    </div>
  `;
  list.appendChild(entry);
  initIcons();
}

function launchStudioWithUploadedPdf() {
  const fileInput = document.getElementById('custom-pdf-upload');
  const errorEl = document.getElementById('pdf-upload-error');
  const dropzone = document.getElementById('pdf-dropzone');

  if (!fileInput.files || fileInput.files.length === 0) {
    if (errorEl) {
      errorEl.textContent = '⚠️ Please select or drop a PDF file first.';
      errorEl.classList.remove('hidden');
    }
    if (dropzone) {
      dropzone.classList.add('border-red-400', 'bg-red-50/50');
      setTimeout(() => dropzone.classList.remove('border-red-400', 'bg-red-50/50'), 3000);
    }
    return;
  }

  const file = fileInput.files[0];
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    if (errorEl) {
      errorEl.textContent = '⚠️ Only PDF files are supported.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  const title = document.getElementById('custom-pdf-title').value.trim() || file.name.replace(/\.pdf$/i, '');

  // Collect signers
  const signerEntries = document.querySelectorAll('.signer-entry');
  const signers = [];

  for (let i = 0; i < signerEntries.length; i++) {
    const entry = signerEntries[i];
    const name = entry.querySelector('.signer-name').value.trim();
    const email = entry.querySelector('.signer-email').value.trim();
    const role = entry.querySelector('.signer-role').value.trim() || `Signer ${i + 1}`;

    if (!name || !email) {
      alert(`Please fill in Name and Email for Signer ${i + 1}.`);
      return;
    }

    signers.push({
      id: `signer_${i + 1}`,
      name: name,
      email: email,
      role: role,
      order: i + 1,
      color: i === 0 ? '#f59e0b' : '#3b82f6'
    });
  }

  showToast('Loading PDF and launching Studio...');

  const accessCode = (document.getElementById('custom-access-code')?.value || '').trim();

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result.split(',')[1];
    const draft = {
      title: title,
      pdfBase64: base64,
      signers: signers,
      accessCode: accessCode || null
    };

    sessionStorage.setItem('opensign_draft', JSON.stringify(draft));
    window.location.href = '/studio';
  };
  reader.readAsDataURL(file);
}


