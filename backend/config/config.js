const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const config = {
    sheets: {
        timeTracking: {
            id: '1bI-3Kwxe9BzdbNKq5QCKmWGsXy09ZegDVlxCHamCDQ0'
        },
        inventory: {
            id: '10w22PcqGyhDKTc3baY78AaWPQg5j72QDTUehEs6WjQk'
        }
    }
};

async function initializeGoogleSheet(sheetId) {
    if (!process.env.GOOGLE_PRIVATE_KEY) {
        throw new Error('GOOGLE_PRIVATE_KEY is not defined in environment variables');
    }
    try {
        const client = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const doc = new GoogleSpreadsheet(sheetId, client);
        await doc.loadInfo();
        return doc;
    } catch (error) {
        console.error('Fehler beim Initialisieren des Google Sheets:', error);
        throw error;
    }
}

module.exports = { config, initializeGoogleSheet }; 