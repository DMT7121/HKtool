// HikSync Pro Dashboard Logic
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycby5xSxRoALVyYQX6xMxgC7fzktfvLpS5mhXWXAWZZbR6gurj9fVnMJdcajinUYtuETq/exec';

const statLastSync = document.getElementById('stat-last-sync');
const statTotalSynced = document.getElementById('stat-total-synced');
const statStatus = document.getElementById('stat-status');
const logsList = document.getElementById('logs-list');
const syncNowBtn = document.getElementById('sync-now-btn');

let isSyncing = false;

// Determine if we are running in 'Cloud Mode' (Cloudflare) or 'Local Mode' (localhost)
const isCloudMode = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');

async function fetchStatus() {
    try {
        if (isCloudMode) {
            // Fetch from GAS instead of local API
            const response = await fetch(GAS_WEBAPP_URL);
            const data = await response.json(); // GAS doGet returns rows
            
            if (data && data.length > 0) {
                // Update stats based on latest row
                const latest = data[data.length - 1];
                statLastSync.textContent = new Date(latest[2]).toLocaleTimeString();
                statTotalSynced.textContent = 'Active (Cloud)';
                statStatus.textContent = 'Cloud Active';
                statStatus.className = 'status-badge idle';
                
                // Map rows to log entries
                const logs = data.reverse().map(row => ({
                    timestamp: row[2],
                    message: `[${row[1]}] ${row[0]} - Chấm công ${row[4]}`
                }));
                updateLogs(logs);
            }
            return;
        }

        const response = await fetch('/api/status');
        const data = await response.json();
        // ... rest of the local logic

        // Update Stats
        statLastSync.textContent = data.lastSyncTime 
            ? new Date(data.lastSyncTime).toLocaleTimeString() 
            : 'Never';
        
        statTotalSynced.textContent = data.totalSynced.toLocaleString();
        
        statStatus.textContent = data.status;
        statStatus.className = 'status-badge ' + data.status.toLowerCase();
        
        if (data.status === 'Running') {
            syncNowBtn.disabled = true;
            syncNowBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Syncing...';
            isSyncing = true;
        } else {
            syncNowBtn.disabled = false;
            syncNowBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Force Sync';
            isSyncing = false;
        }

        // Update Logs
        updateLogs(data.logs);
    } catch (err) {
        console.error('Failed to fetch status:', err);
        statStatus.textContent = 'Connection Error';
        statStatus.className = 'status-badge error';
    }
}

function updateLogs(logs) {
    if (!logs || logs.length === 0) return;

    // Only update if logs changed or it's the first time
    logsList.innerHTML = logs.map(log => {
        let typeClass = '';
        if (log.message.includes('Error')) typeClass = 'error';
        if (log.message.includes('Successfully')) typeClass = 'success';
        
        const time = new Date(log.timestamp).toLocaleTimeString();
        return `<div class="log-entry ${typeClass}">
            <span class="time">[${time}]</span>
            <span class="message">${log.message}</span>
        </div>`;
    }).join('');
}

syncNowBtn.addEventListener('click', async () => {
    if (isSyncing) return;
    
    try {
        syncNowBtn.disabled = true;
        syncNowBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Starting...';
        
        const response = await fetch('/api/sync-now', { method: 'POST' });
        const data = await response.json();
        
        console.log('Sync triggered:', data.message);
        // Status will be updated in the next fetchStatus cycle
    } catch (err) {
        alert('Failed mutation trigger: ' + err.message);
        syncNowBtn.disabled = false;
        syncNowBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Force Sync';
    }
});

// Periodic Refresh
setInterval(fetchStatus, 5000);
fetchStatus(); // Initial call
