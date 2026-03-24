const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

class GoogleSheetsClient {
    constructor(config) {
        this.spreadsheetId = config.spreadsheetId;
        this.serviceAccountEmail = config.serviceAccountEmail;
        this.privateKey = config.privateKey.replace(/\\n/g, '\n'); // Handle escaped newlines in env vars
        
        this.auth = new JWT({
            email: this.serviceAccountEmail,
            key: this.privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        
        this.doc = new GoogleSpreadsheet(this.spreadsheetId, this.auth);
    }

    async init() {
        await this.doc.loadInfo(); // loads document properties and worksheets
        console.log(`Connected to Google Sheet: ${this.doc.title}`);
    }

    async appendAttendance(rows) {
        const sheet = this.doc.sheetsByIndex[0]; // Assuming data goes to the first sheet
        // Row objects should match column headers exactly
        // e.g., [{ name: 'John Doe', time: '2023-10-01 08:30:00', device: 'Main Entry' }]
        await sheet.addRows(rows);
    }
}

module.exports = GoogleSheetsClient;
