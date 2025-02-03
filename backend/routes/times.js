const express = require('express');
const router = express.Router();
const { initializeGoogleSheet, config } = require('../config/config');
const { hasPermission } = require('../data/employees');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');

let timeTrackingDoc;

async function getTimeTrackingDoc() {
    if (!timeTrackingDoc) {
        timeTrackingDoc = await initializeGoogleSheet(config.sheets.timeTracking.id);
    }
    return timeTrackingDoc;
}

// Middleware für Berechtigungsprüfung
function checkPermission(permission, action = 'view') {
    return (req, res, next) => {
        const employeeId = req.query.employeeId || req.body.employeeId || req.params.employeeId;
        console.log('Prüfe Berechtigung für:', { employeeId, permission, action });
        
        if (hasPermission(employeeId, permission, action)) {
            next();
        } else {
            res.status(403).json({ 
                success: false, 
                message: 'Keine Berechtigung für diese Aktion' 
            });
        }
    };
}

// Zeiterfassungs-Route
router.post('/entry', checkPermission('timeTracking', 'edit'), async (req, res) => {
    try {
        const doc = await getTimeTrackingDoc();
        const { employeeId, date, location, startTime, endTime } = req.body;
        
        const sheet = doc.sheetsByIndex[0];
        const row = {
            'Mitarbeiter_ID': employeeId,
            'Datum': date,
            'Standort': location,
            'Startzeit': startTime,
            'Endzeit': endTime,
            'Timestamp': new Date().toISOString()
        };

        // Prüfung auf vorhandene Einträge
        const existing = await sheet.getRows();
        const exists = existing.some(r => 
            r.get('Mitarbeiter_ID') === employeeId &&
            r.get('Timestamp') === row.Timestamp
        );
        
        if (exists) {
            return res.json({ success: true });
        }

        await sheet.addRow(row);
        res.json({ success: true });
        
    } catch (error) {
        console.error('Fehler:', error);
        res.status(500).json({ error: 'Interner Fehler' });
    }
});

// Standorte-Route
router.get('/locations', async (req, res) => {
    try {
        const doc = await getTimeTrackingDoc();
        const locationsSheet = doc.sheetsByTitle['Standorte'];
        const rows = await locationsSheet.getRows();
        
        const locations = rows.map(row => row._rawData[0]).filter(Boolean);

        res.json({ success: true, locations });
    } catch (error) {
        console.error('Fehler beim Laden der Standorte:', error);
        res.status(500).json({ error: 'Fehler beim Laden der Standorte' });
    }
});

// Zeitkonto-Route
router.get('/history/:employeeId', 
    checkPermission('timeTracking', 'view'), 
    async (req, res) => {
    try {
        const doc = await getTimeTrackingDoc();
        const { employeeId } = req.params;
        
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        
        const employeeTimes = rows
            .filter(row => row.toObject()['Mitarbeiter_ID'] === employeeId)
            .map(row => {
                const rowData = row.toObject();
                return {
                    date: rowData['Datum'],
                    location: rowData['Standort'],
                    startTime: rowData['Startzeit'],
                    endTime: rowData['Endzeit'],
                    timestamp: rowData['Timestamp'],
                    day: rowData['Tag'],
                    workingHours: calculateWorkingHours(
                        rowData['Startzeit'],
                        rowData['Endzeit']
                    )
                };
            })
            .sort((a, b) => {
                const [dayA, monthA, yearA] = a.date.split('.');
                const [dayB, monthB, yearB] = b.date.split('.');
                const dateA = new Date(yearA, monthA - 1, dayA);
                const dateB = new Date(yearB, monthB - 1, dayB);
                return dateB - dateA;
            });
        
        res.json({ success: true, times: employeeTimes });
    } catch (error) {
        console.error('Fehler beim Laden des Zeitkontos:', error);
        res.status(500).json({ error: 'Fehler beim Laden des Zeitkontos' });
    }
});

// Hilfsfunktion zur Berechnung der Arbeitszeit
function calculateWorkingHours(startTime, endTime) {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    const startInMinutes = startHours * 60 + startMinutes;
    const endInMinutes = endHours * 60 + endMinutes;
    
    const diffInMinutes = endInMinutes - startInMinutes;
    const hours = Math.floor(diffInMinutes / 60);
    const minutes = diffInMinutes % 60;
    
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

// DELETE-Route für Zeiteinträge
router.delete('/entries', checkPermission('timeTracking', 'edit'), async (req, res) => {
    try {
        const doc = await getTimeTrackingDoc();
        const sheet = doc.sheetsByIndex[0];
        const { employeeId, timestamps } = req.body;
        
        console.log('Löschversuch für:', { employeeId, timestamps });
        
        const rows = await sheet.getRows();
        const rowsToDelete = rows.filter(row => {
            const rowData = row.toObject();
            return rowData['Mitarbeiter_ID'] === employeeId && 
                   timestamps.includes(rowData['Timestamp'].trim());
        });

        if (rowsToDelete.length > 0) {
            // Authentifiziere mit JWT-Client wie in der alten Version
            const auth = new JWT({
                email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            const sheets = google.sheets({ version: 'v4', auth });
            
            // Berechne die zu löschenden Zeilenindizes
            const rowIndices = rowsToDelete.map(row => 
                rows.indexOf(row) + 2 // +2 wegen Header und 1-basiertem Index
            ).sort((a, b) => b - a); // Absteigend sortieren
            
            // Erstelle Batch-Requests
            const requests = rowIndices.map(rowIndex => ({
                deleteDimension: {
                    range: {
                        sheetId: sheet.sheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex
                    }
                }
            }));
            
            // Führe Batch-Update durch
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: doc.spreadsheetId,
                requestBody: { requests }
            });

            console.log(`${rowsToDelete.length} Zeilen erfolgreich gelöscht`);
        }
        
        res.json({ success: true, message: `${rowsToDelete.length} Einträge gelöscht` });
        
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        res.status(500).json({ success: false, message: 'Löschen fehlgeschlagen' });
    }
});

module.exports = router; 