const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { initializeGoogleSheet, config } = require('./config/config');
const { employees, hasPermission } = require('./data/employees');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const session = require('express-session');
const inventoryRoutes = require('./routes/inventory');
const timeRoutes = require('./routes/times');
const { MemoryStore } = require('express-session');
const authRoutes = require('./routes/auth');

// Session-Timeout in Millisekunden (2 Minuten)
const SESSION_TIMEOUT = 2 * 60 * 1000;

const app = express();
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static('frontend'));

// Konfiguriere express-session
app.use(session({
    secret: process.env.SESSION_SECRET || 'geheim', // idealerweise als Umgebungsvariable setzen
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 120000, // 2 Minuten
        httpOnly: true,
        secure: false // auf true setzen, wenn HTTPS verwendet wird
    },
    store: new MemoryStore() // Für Entwicklung, in Produktion Redis/MongoDB verwenden
}));

const port = process.env.PORT || 3000;

let timeTrackingDoc;  // Für Zeiterfassung
let inventoryDoc;     // Für Warenwirtschaft

async function getTimeTrackingDoc() {
    if (!timeTrackingDoc) {
        timeTrackingDoc = await initializeGoogleSheet(config.sheets.timeTracking.id);
    }
    return timeTrackingDoc;
}

async function getInventoryDoc() {
    if (!inventoryDoc) {
        inventoryDoc = await initializeGoogleSheet(config.sheets.inventory.id);
    }
    return inventoryDoc;
}

// Authentifizierungs-Middleware
app.use((req, res, next) => {
    console.log('Session:', req.session);
    console.log('User:', req.session.user);
    next();
});

// Middleware zum Schutz von Routen
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Nicht angemeldet' });
    }
    next();
};

// Login-Route
app.post('/api/login', async (req, res) => {
    const { employeeId, password } = req.body;
    console.log('Login-Versuch:', { employeeId, password });
    console.log('Verfügbare Mitarbeiter:', Object.keys(employees));
    
    const employee = employees[employeeId];
    console.log('Gefundener Mitarbeiter:', employee);

    try {
        if (employee && await bcrypt.compare(password, employee.passwordHash)) {
            console.log('Login erfolgreich für:', employee);
            console.log('Rollen:', employee.roles);
            
            const permissions = {
                timeTracking: {
                    view: hasPermission(employeeId, 'timeTracking', 'view'),
                    edit: hasPermission(employeeId, 'timeTracking', 'edit')
                },
                inventory: {
                    view: hasPermission(employeeId, 'inventory', 'view'),
                    edit: hasPermission(employeeId, 'inventory', 'edit'),
                    delete: hasPermission(employeeId, 'inventory', 'delete')
                }
            };
            
            console.log('Berechnete Berechtigungen:', permissions);
            
            // Speichere den authentifizierten Benutzer in der Session
            req.session.user = employee;
            
            res.json({
                success: true,
                employeeId: employee.id,
                name: employee.name,
                permissions: permissions
            });
        } else {
            res.json({ 
                success: false,
                message: 'Falsche Mitarbeiter-ID oder falsches Passwort'
            });
        }
    } catch (error) {
        console.error('Login-Fehler:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ein interner Fehler ist aufgetreten'
        });
    }
});

// Neue Route zum Überprüfen des Login-Status
app.get('/api/check-auth', (req, res) => {
    if (req.session.user) {
        res.json({
            isLoggedIn: true,
            userId: req.session.user.id,
            userName: req.session.user.name
        });
    } else {
        res.json({ isLoggedIn: false });
    }
});

// Logout-Route hinzufügen
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Fehler beim Logout' });
        }
        res.json({ success: true });
    });
});

// Mounte den Auth-Router
app.use('/api/auth', authRoutes);

// Routes einbinden
app.use('/api/inventory', inventoryRoutes);
app.use('/api/time', timeRoutes); // Enthält POST /entry und DELETE /entries

// Endpoint für die Referenzdaten
app.get('/api/inventory/references', async (req, res) => {
    try {
        console.log('Starte Laden der Referenzdaten...');
        const doc = await getInventoryDoc();
        console.log('Google Sheet geladen:', doc.title);

        // Lade die einzelnen Sheets
        const locationSheet = doc.sheetsByTitle['Lagerort'];
        const typeSheet = doc.sheetsByTitle['Transaktionstypen'];
        const articleSheet = doc.sheetsByTitle['Artikel'];
        
        console.log('Gefundene Sheets:', {
            lagerort: locationSheet?.title,
            transaktionstypen: typeSheet?.title,
            artikel: articleSheet?.title
        });

        // Lade die Daten parallel
        const [locationRows, typeRows, articleRows] = await Promise.all([
            locationSheet.getRows(),
            typeSheet.getRows(),
            articleSheet.getRows()
        ]);

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
                name: row._rawData[1]
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

// Nach dem dotenv.config() Aufruf
console.log('Environment Variables loaded:', {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'Set' : 'Not Set',
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY ? 'Set' : 'Not Set',
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID ? 'Set' : 'Not Set'
});

app.listen(port, () => {
    console.log(`Server läuft auf Port ${port}`);
}); 