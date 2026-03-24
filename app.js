require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const { format, subMinutes } = require('date-fns');

const HikCentralClient = require('./lib/HikCentralClient');
const GoogleSheetsClient = require('./lib/GoogleSheetsClient');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static('public'));

// Global State
let syncStatus = {
    lastSyncTime: null,
    totalSynced: 0,
    status: 'Idle',
    error: null,
    logs: []
};

function addLog(message) {
    const timestamp = new Date().toISOString();
    syncStatus.logs.unshift({ timestamp, message });
    if (syncStatus.logs.length > 50) syncStatus.logs.pop(); // Keep last 50 logs
    console.log(`[${timestamp}] ${message}`);
}

// State Persistence (simple file)
const STATE_FILE = path.join(__dirname, 'sync_state.json');
function loadState() {
    if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
    return { lastSuccessfulSync: null };
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Clients Setup (Lazy initialization to allow dynamic config if needed)
let hikClient, googleClient;

async function initClients() {
    try {
        hikClient = new HikCentralClient({
            baseUrl: process.env.HIK_BASE_URL,
            appKey: process.env.HIK_APP_KEY,
            appSecret: process.env.HIK_APP_SECRET
        });

        googleClient = new GoogleSheetsClient({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            privateKey: process.env.GOOGLE_PRIVATE_KEY
        });

        await googleClient.init(); // Test connection
        addLog('Clients initialized successfully');
        return true;
    } catch (err) {
        addLog(`Initialization Error: ${err.message}`);
        console.error(err);
        return false;
    }
}

// Sync Logic
async function performSync() {
    if (syncStatus.status === 'Running') {
        addLog('Sync already in progress, skipping...');
        return;
    }

    try {
        syncStatus.status = 'Running';
        addLog('Starting sync...');
        
        const state = loadState();
        const now = new Date();
        
        // Start from 30 mins before if no state (or user-defined overlapping period to catch delayed logs)
        const startTime = state.lastSuccessfulSync ? new Date(state.lastSuccessfulSync) : subMinutes(now, 30);
        const endTime = now;

        // Fetch from HikCentral
        const recordsResponse = await hikClient.getAttendanceRecords(
            startTime.toISOString(), 
            endTime.toISOString()
        );

        if (recordsResponse && recordsResponse.code === '0' && recordsResponse.data && recordsResponse.data.list) {
            const records = recordsResponse.data.list;
            
            if (records.length > 0) {
                // Map records to rows for GSheet
                // Customize mapping based on HikCentral response fields
                const rows = records.map(record => ({
                    'Họ Tên': record.personName,
                    'ID Nhân Viên': record.personCode,
                    'Thời Gian': format(new Date(record.eventTime), 'yyyy-MM-dd HH:mm:ss'),
                    'Phòng Ban': record.orgName || 'N/A',
                    'Thiết Bị': record.deviceName || 'Máy Chấm Công',
                    'Raw Time': record.eventTime,
                    'Sync ID': `${record.personCode}_${record.eventTime}` // Primitive deduplication helper
                }));

                // Push to Google Sheets
                await googleClient.appendAttendance(rows);
                
                syncStatus.totalSynced += records.length;
                addLog(`Successfully synced ${records.length} records.`);
            } else {
                addLog('No new records found for this period.');
            }
            
            // Save state
            state.lastSuccessfulSync = endTime.toISOString();
            saveState(state);
            
            syncStatus.lastSyncTime = endTime;
            syncStatus.status = 'Idle';
            syncStatus.error = null;
        } else {
            throw new Error(recordsResponse.msg || 'Unknown API response error');
        }
    } catch (err) {
        syncStatus.status = 'Error';
        syncStatus.error = err.message;
        addLog(`Sync Error: ${err.message}`);
    }
}

// Cron Job: Every 10 minutes
// At minutes divisible by 10 (0, 10, 20...)
cron.schedule('*/10 * * * *', () => {
    addLog('Triggering scheduled sync');
    performSync();
});

// API Routes
app.get('/api/status', (req, res) => {
    res.json(syncStatus);
});

app.post('/api/sync-now', async (req, res) => {
    performSync(); // Async execute in background
    res.json({ message: 'Sync started' });
});

// Start Server
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    const initialized = await initClients();
    if (initialized) {
        addLog('System ready, periodic sync scheduled.');
    } else {
        addLog('WARNING: System not configured correctly. Check your .env file.');
        addLog('If you just started, please fill in the .env file and restart.');
    }
});
