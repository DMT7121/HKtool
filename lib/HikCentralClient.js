const axios = require('axios');
const crypto = require('crypto');

class HikCentralClient {
    constructor(config) {
        this.baseUrl = config.baseUrl; // e.g., http://127.0.0.1:18001
        this.appKey = config.appKey;
        this.appSecret = config.appSecret;
    }

    /**
     * Generate signature for HikCentral OpenAPI
     * @param {string} method HTTP Method (GET, POST, etc.)
     * @param {string} url Request URL path (e.g., /artemis/api/attendance/v1/records)
     * @param {Object} headers Request headers
     */
    generateSignature(method, url, headers) {
        const accept = headers['Accept'] || '*/*';
        const contentType = headers['Content-Type'] || 'application/json';
        
        let stringToSign = `${method.toUpperCase()}\n${accept}\n\n${contentType}\n\n`;
        
        // Add custom headers to StringToSign
        // Note: HikCentral expects x-ca-key, x-ca-nonce, x-ca-timestamp in the signature
        const customHeaders = [
            `x-ca-key:${headers['x-ca-key']}`,
            `x-ca-nonce:${headers['x-ca-nonce']}`,
            `x-ca-timestamp:${headers['x-ca-timestamp']}`
        ].join('\n');
        
        stringToSign += customHeaders + '\n' + url;
        
        const signature = crypto.createHmac('sha256', this.appSecret)
            .update(stringToSign, 'utf8')
            .digest('base64');
            
        return signature;
    }

    async request(method, path, data = {}) {
        const url = path;
        const timestamp = Date.now();
        const nonce = crypto.randomUUID();
        
        const headers = {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'x-ca-key': this.appKey,
            'x-ca-timestamp': timestamp.toString(),
            'x-ca-nonce': nonce,
            'x-ca-signature-headers': 'x-ca-key,x-ca-nonce,x-ca-timestamp'
        };
        
        headers['x-ca-signature'] = this.generateSignature(method, url, headers);
        
        const https = require('https');
        const httpsAgent = new https.Agent({ rejectUnauthorized: false });

        try {
            const response = await axios({
                method,
                url: `${this.baseUrl}${url}`,
                headers,
                data: method.toLowerCase() === 'post' ? data : undefined,
                params: method.toLowerCase() === 'get' ? data : undefined,
                timeout: 10000,
                httpsAgent: this.baseUrl.startsWith('https') ? httpsAgent : undefined
            });
            return response.data;
        } catch (error) {
            console.error('HikCentral API Error:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    /**
     * Get attendance records
     * @param {string} startTime ISO8601 string
     * @param {string} endTime ISO8601 string
     */
    async getAttendanceRecords(startTime, endTime, pageNo = 1, pageSize = 1000) {
        return this.request('POST', '/artemis/api/attendance/v1/records', {
            startTime,
            endTime,
            pageNo,
            pageSize
        });
    }
}

module.exports = HikCentralClient;
