const express = require('express');
const router = express.Router();
const { initializeGoogleSheet, config } = require('../config/config');
const { hasPermission } = require('../data/employees');

let inventoryDoc;

async function getInventoryDoc() {
    if (!inventoryDoc) {
        inventoryDoc = await initializeGoogleSheet(config.sheets.inventory.id);
    }
    return inventoryDoc;
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

// Artikel abrufen
router.get('/items', checkPermission('inventory', 'view'), async (req, res) => {
    try {
        const doc = await getInventoryDoc();
        const sheet = doc.sheetsByTitle['Artikel'];
        const rows = await sheet.getRows();
        
        const items = rows.map(row => ({
            id: row.ID,
            name: row.Name,
            category: row.Kategorie,
            stock: parseInt(row.Bestand),
            minStock: parseInt(row.MinBestand),
            unit: row.Einheit
        }));

        res.json({ success: true, items });
    } catch (error) {
        console.error('Fehler beim Abrufen der Artikel:', error);
        res.status(500).json({ success: false, message: 'Interner Server-Fehler' });
    }
});

// Kategorien abrufen
router.get('/categories', checkPermission('inventory', 'view'), async (req, res) => {
    try {
        const doc = await getInventoryDoc();
        const sheet = doc.sheetsByTitle['Kategorien'];
        const rows = await sheet.getRows();
        
        const categories = rows.map(row => ({
            id: row.ID,
            name: row.Name
        }));

        res.json({ success: true, categories });
    } catch (error) {
        console.error('Fehler beim Abrufen der Kategorien:', error);
        res.status(500).json({ success: false, message: 'Interner Server-Fehler' });
    }
});

// Neuen Artikel anlegen
router.post('/items', checkPermission('inventory', 'edit'), async (req, res) => {
    try {
        const { name, category, stock, minStock, unit } = req.body;
        const doc = await getInventoryDoc();
        const sheet = doc.sheetsByTitle['Artikel'];
        
        // Generiere neue ID
        const rows = await sheet.getRows();
        const newId = `A${(rows.length + 1).toString().padStart(3, '0')}`;
        
        await sheet.addRow({
            ID: newId,
            Name: name,
            Kategorie: category,
            Bestand: stock,
            MinBestand: minStock,
            Einheit: unit
        });

        res.json({ success: true, id: newId });
    } catch (error) {
        console.error('Fehler beim Anlegen des Artikels:', error);
        res.status(500).json({ success: false, message: 'Interner Server-Fehler' });
    }
});

// Neue Bewegung speichern
router.post('/movements', checkPermission('inventory', 'edit'), async (req, res) => {
    try {
        const doc = await getInventoryDoc();
        const sheet = doc.sheetsByTitle['Transaktionen'];
        
        if (!sheet) {
            throw new Error('Transaktionen Sheet nicht gefunden');
        }
        
        console.log('Versuche neue Bewegung zu speichern:', req.body);
        
        // Neue Zeile mit Spaltennamen hinzufügen
        const newRow = {
            'Mitarbeiter ID': req.body.mitarbeiter_id,
            'Timestamp': new Date().toLocaleString('sv', { timeZone: 'Europe/Berlin' }).replace(' ', 'T') + '.000Z',
            'Lagerort ID': req.body.lagerort_id,
            'Typ ID': req.body.typ_id,
            'Artikel ID': req.body.artikel_id,
            'Transaktionsmenge': req.body.transaktionsmenge,
            'Bestand LO': req.body.bestand_lo,
            'Buchungstext': req.body.buchungstext || ''
        };
        
        // Debug-Ausgabe
        console.log('Neue Zeile wird hinzugefügt:', newRow);
        console.log('Verfügbare Spalten:', await sheet.headerValues);
        
        await sheet.addRow(newRow);
        
        // Änderungen speichern
        await sheet.saveUpdatedCells();
        
        console.log('Neue Bewegung erfolgreich gespeichert');
        
        res.json({
            success: true,
            message: 'Bewegung erfolgreich gespeichert'
        });
    } catch (error) {
        console.error('Fehler beim Speichern der Bewegung:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Fehler beim Speichern der Bewegung',
            error: error.message
        });
    }
});

// Bewegungshistorie abrufen
router.get('/movements', checkPermission('inventory', 'view'), async (req, res) => {
    try {
        // Debug-Logging der Benutzerdaten
        console.log('Aktueller Benutzer:', req.user);
        console.log('Berechtigungen:', req.permissions);
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        
        console.log('\n=== Start Loading Movements ===');
        console.log('Requested parameters:', { page, limit });
        
        const doc = await getInventoryDoc();
        const sheet = doc.sheetsByTitle['Transaktionen'];
        if (!sheet) {
            throw new Error('Transaktionen Sheet nicht gefunden');
        }
        
        console.log('Loading all rows from sheet...');
        const rows = await sheet.getRows();
        console.log(`Total rows in sheet: ${rows.length}`);
        
        // Sortiere nach Timestamp
        rows.sort((a, b) => {
            const timestampA = new Date(a.get('Timestamp'));
            const timestampB = new Date(b.get('Timestamp'));
            return timestampB - timestampA;
        });
        console.log('Rows sorted by timestamp (newest first)');
        
        const totalRows = rows.length;
        const startIndex = (page - 1) * limit;
        const endIndex = Math.min(startIndex + limit, totalRows);
        const paginatedRows = rows.slice(startIndex, endIndex);
        
        console.log('Pagination calculation:', {
            totalRows,
            startIndex,
            endIndex,
            paginatedRowsLength: paginatedRows.length,
            calculatedTotalPages: Math.ceil(totalRows / limit)
        });

        // Lade die Referenzdaten
        const locationSheet = doc.sheetsByTitle['Lagerort'];
        const typeSheet = doc.sheetsByTitle['Transaktionstypen'];
        const articleSheet = doc.sheetsByTitle['Artikel'];
        
        const locationRows = await locationSheet.getRows();
        const typeRows = await typeSheet.getRows();
        const articleRows = await articleSheet.getRows();

        const references = {
            locations: locationRows.map(row => ({
                id: row._rawData[0],
                name: row._rawData[1]
            })),
            types: typeRows.map(row => ({
                id: row._rawData[0],
                name: row._rawData[1]
            })),
            articles: articleRows.map(row => ({
                id: row._rawData[0],
                name: row._rawData[1]
            }))
        };

        console.log('Referenzdaten nach Mapping:', {
            locations: references.locations,
            types: references.types,
            articles: references.articles
        });
        
        const movements = paginatedRows.map(row => {
            const rowData = row.toObject();
            
            return {
                mitarbeiter_id: rowData['Mitarbeiter ID'] || '',
                mitarbeiter: rowData['Mitarbeiter'] || '',
                timestamp: rowData['Timestamp'] || '',
                datum: rowData['Datum'] || '',
                lagerort_id: rowData['Lagerort ID'] || '',
                lagerort: references.locations.find(l => l.id === rowData['Lagerort ID'])?.name || '',
                typ_id: rowData['Typ ID'] || '',
                trans_typ: references.types.find(t => t.id === rowData['Typ ID'])?.name || '',
                artikel_id: rowData['Artikel ID'] || '',
                artikel: references.articles.find(a => a.id === rowData['Artikel ID'])?.name || '',
                transaktionsmenge: rowData['Transaktionsmenge'] || '',
                bestand_lo: rowData['Bestand LO'] || '',
                buchungstext: rowData['Buchungstext'] || ''
            };
        });
        
        console.log('\nPreparing response:', {
            requestedPage: page,
            requestedLimit: limit,
            actualReturnedRows: movements.length,
            totalRowsInSheet: totalRows,
            calculatedTotalPages: Math.ceil(totalRows / limit),
            paginationInfo: {
                page,
                limit,
                totalPages: Math.ceil(totalRows / limit),
                totalRows: totalRows
            }
        });
        console.log('=== End Loading Movements ===\n');

        res.json({
            success: true,
            movements: movements,
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(totalRows / limit),
                totalRows: totalRows,
                hasMore: false
            }
        });
    } catch (error) {
        console.error('Fehler beim Laden der Bewegungen:', error);
        console.error('Stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Fehler beim Laden der Bewegungen'
        });
    }
});

module.exports = router; 