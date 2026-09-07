const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

// Read session
const sessionData = JSON.parse(fs.readFileSync('c:/dev/dashboard-home/.alarm_session.json', 'utf8'));
console.log('Session data:', JSON.stringify(sessionData.iotSession, null, 2));

// Check server log or in-memory session
// We need clientId and clientSecret to make signed requests
// Let's see if we can find them in server.js state or we can add an inspection route in server.js
