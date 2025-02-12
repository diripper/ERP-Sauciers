const express = require('express');
const router = express.Router();
const { initializeGoogleSheet, config } = require('../config/config');
const { hasPermission } = require('../data/employees');

let inventoryDoc;
let worksheet;

async function getInventoryDoc() {
    if (!inventoryDoc) {
        inventoryDoc = await initializeGoogleSheet(config.sheets.inventory.id);
    }
    return inventoryDoc;
}

// Middleware für Berechtigungsprüfung
function checkPermission(permission, action = 'view') {
    return (req, res, next) => {
        // Bevorzugt den in der Session gespeicherten Benutzer verwenden
        const sessionUser = req.session && req.session.user;
        const employeeId = sessionUser ? sessionUser.id : (req.query.employeeId || req.body.employeeId || req.params.employeeId);
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

// Initialisiere das Worksheet beim Start
async function initializeWorksheet() {
    try {
        const doc = await getInventoryDoc();
        await doc.loadInfo();
        worksheet = doc.sheetsByTitle['Transaktionen'];
        if (!worksheet) {
            throw new Error('Worksheet "Transaktionen" nicht gefunden');
        }
        await worksheet.loadHeaderRow();
        console.log('Worksheet erfolgreich initialisiert');
    } catch (error) {
        console.error('Fehler bei der Worksheet-Initialisierung:', error);
        throw error;
    }
}

// Initialisiere das Worksheet beim Start der Anwendung
initializeWorksheet().catch(error => {
    console.error('Fehler beim Initialisieren des Worksheets:', error);
});

// Route zum Erstellen einer neuen Bewegung
router.post('/movements', checkPermission('inventory', 'edit'), async (req, res) => {
    try {
        // Stelle sicher, dass das Worksheet initialisiert ist
        if (!worksheet || !worksheet.headerValues) {
            await initializeWorksheet();
        }

        const result = await postMovement(req.body);
        res.json(result);
    } catch (error) {
        console.error('Fehler bei der Bewegungserstellung:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Interner Serverfehler bei der Bewegungserstellung'
        });
    }
});

// Neue Bewegung speichern
async function postMovement(movementData) {
    try {
        // Stelle sicher, dass das Worksheet geladen ist
        await worksheet.loadHeaderRow();
        
        // Prüfe ob alle erforderlichen Header vorhanden sind
        const requiredHeaders = ['Mitarbeiter ID', 'Timestamp', 'Lagerort ID', 'Typ ID', 'Artikel ID', 'Transaktionsmenge', 'Bestand LO', 'Buchungstext'];
        const missingHeaders = requiredHeaders.filter(header => !worksheet.headerValues.includes(header));
        
        if (missingHeaders.length > 0) {
            throw new Error(`Fehlende Spalten im Worksheet: ${missingHeaders.join(', ')}`);
        }

        // Formatiere die Daten für das Worksheet
        const row = {
            'Mitarbeiter ID': movementData.mitarbeiter_id,
            'Timestamp': new Date().toLocaleString('sv', { timeZone: 'Europe/Berlin' }).replace(' ', 'T') + '.000Z',
            'Lagerort ID': movementData.lagerort_id,
            'Typ ID': movementData.typ_id,
            'Artikel ID': movementData.artikel_id,
            'Transaktionsmenge': movementData.transaktionsmenge,
            'Bestand LO': movementData.bestand_lo || '',
            'Buchungstext': movementData.buchungstext || ''
        };

        // Füge die neue Zeile hinzu
        await worksheet.addRow(row);
        
        return { success: true, message: 'Bewegung erfolgreich gespeichert' };
    } catch (error) {
        console.error('Fehler beim Speichern der Bewegung:', error);
        throw new Error(`Fehler beim Speichern der Bewegung: ${error.message}`);
    }
}

// Bewegungshistorie abrufen
router.get('/movements', checkPermission('inventory', 'view'), async (req, res) => {
    try {
        console.log('Starte Laden der Bewegungen mit Parametern:', req.query);
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const filters = {
            location: req.query.location || '',
            type: req.query.type || '',
            article: req.query.article || '',
            dateFrom: req.query.dateFrom || '',
            dateTo: req.query.dateTo || ''
        };

        // Lade die Referenzdaten immer
        const doc = await getInventoryDoc();
        const referencesPromises = [
            doc.sheetsByTitle['Lagerort'].getRows().then(rows => {
                return rows.map(row => ({
                    id: row._rawData[0],
                    name: row._rawData[1]
                }));
            }),
            doc.sheetsByTitle['Transaktionstypen'].getRows().then(rows => {
                return rows.map(row => ({
                    id: row._rawData[0],
                    name: row._rawData[1]
                }));
            }),
            doc.sheetsByTitle['Artikel'].getRows().then(rows => {
                return rows.map(row => ({
                    id: row._rawData[0],
                    name: row._rawData[1]
                }));
            })
        ];

        // Warte auf das Laden aller Referenzdaten
        const [locations, types, articles] = await Promise.all(referencesPromises);

        // Lade und filtere die Bewegungen
        const sheet = doc.sheetsByTitle['Transaktionen'];
        if (!sheet) {
            throw new Error('Transaktionen Sheet nicht gefunden');
        }

        // Optimierte Filterung der Bewegungen
        const rows = await sheet.getRows();
        let filteredRows = rows;

        // Wende Filter in einer einzigen Iteration an
        if (Object.values(filters).some(filter => filter !== '')) {
            filteredRows = rows.filter(row => {
                if (filters.location && row.get('Lagerort ID') !== filters.location) return false;
                if (filters.type && row.get('Typ ID') !== filters.type) return false;
                if (filters.article && row.get('Artikel ID') !== filters.article) return false;
                if (filters.dateFrom || filters.dateTo) {
                    const rowDate = new Date(row.get('Timestamp'));
                    if (filters.dateFrom && new Date(filters.dateFrom) > rowDate) return false;
                    if (filters.dateTo && new Date(filters.dateTo) < rowDate) return false;
                }
                return true;
            });
        }

        // Sortiere nach Timestamp (neueste zuerst)
        filteredRows.sort((a, b) => new Date(b.get('Timestamp')) - new Date(a.get('Timestamp')));

        // Berechne Pagination
        const totalRows = filteredRows.length;
        const startIndex = (page - 1) * limit;
        const endIndex = Math.min(startIndex + limit, totalRows);
        const paginatedRows = filteredRows.slice(startIndex, endIndex);

        // Transformiere die Daten für die Response
        const movements = paginatedRows.map(row => {
            const rowData = row.toObject();
            const movement = {
                mitarbeiter_id: rowData['Mitarbeiter ID'] || '',
                mitarbeiter: rowData['Mitarbeiter'] || '',
                timestamp: rowData['Timestamp'] || '',
                datum: rowData['Datum'] || '',
                lagerort_id: rowData['Lagerort ID'] || '',
                typ_id: rowData['Typ ID'] || '',
                artikel_id: rowData['Artikel ID'] || '',
                transaktionsmenge: rowData['Transaktionsmenge'] || '',
                bestand_lo: rowData['Bestand LO'] || '',
                buchungstext: rowData['Buchungstext'] || ''
            };

            // Füge Namen aus den Referenzdaten hinzu
            movement.lagerort = locations.find(l => l.id === movement.lagerort_id)?.name || '';
            movement.trans_typ = types.find(t => t.id === movement.typ_id)?.name || '';
            movement.artikel = articles.find(a => a.id === movement.artikel_id)?.name || '';

            return movement;
        });

        // Sende optimierte Response
        res.json({
            success: true,
            movements: movements,
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(totalRows / limit),
                totalRows: totalRows
            }
        });

    } catch (error) {
        console.error('Fehler beim Laden der Bewegungen:', error);
        res.status(500).json({
            success: false,
            message: 'Fehler beim Laden der Bewegungen'
        });
    }
});

// Referenzdaten abrufen
router.get('/references', checkPermission('inventory', 'view'), async (req, res) => {
    try {
        console.log('Starte Laden der Referenzdaten...');
        const doc = await getInventoryDoc();
        
        // Debug: Zeige verfügbare Sheets
        console.log('Google Sheet geladen:', doc.title);
        console.log('Gefundene Sheets:', {
            lagerort: doc.sheetsByTitle['Lagerort']?.title,
            transaktionstypen: doc.sheetsByTitle['Transaktionstypen']?.title,
            artikel: doc.sheetsByTitle['Artikel']?.title
        });

        const locationSheet = doc.sheetsByTitle['Lagerort'];
        const typeSheet = doc.sheetsByTitle['Transaktionstypen'];
        const articleSheet = doc.sheetsByTitle['Artikel'];
        
        const locationRows = await locationSheet.getRows();
        const typeRows = await typeSheet.getRows();
        const articleRows = await articleSheet.getRows();

        console.log('Anzahl geladener Zeilen:', {
            locations: locationRows.length,
            types: typeRows.length,
            articles: articleRows.length
        });

        const references = {
            locations: locationRows.map(row => ({
                id: row._rawData[0],
                name: row._rawData[1]
            })),
            types: typeRows.map(row => ({
                id: row._rawData[0],
                name: row._rawData[1],
                numberOfBookings: parseInt(row._rawData[2]) || 1
            })),
            articles: articleRows.map(row => ({
                id: row._rawData[0],
                name: row._rawData[1]
            }))
        };

        console.log('Referenzdaten:', references);

        res.json({ 
            success: true, 
            references: references
        });
    } catch (error) {
        console.error('Fehler beim Laden der Referenzdaten:', error);
        res.status(500).json({
            success: false,
            message: 'Fehler beim Laden der Referenzdaten'
        });
    }
});

module.exports = router; 