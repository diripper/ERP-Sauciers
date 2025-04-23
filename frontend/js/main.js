const SESSION_TIMEOUT = 2 * 60 * 1000; // 2 Minuten in Millisekunden

// Benutzerdaten im Session Storage
let currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || null;
let sessionTimer = null;

// Globale Variable für ausgewählte Einträge
let selectedEntries = new Set();

// Globale Variablen für die Bewegungsdaten
let allMovements = [];
let references = {
    locations: [],
    types: [],
    articles: []
};

// Test-Initialisierung für InventoryState
let inventoryState;
let inventoryService;
let inventoryUI;

// Event-Listener für State-Events
eventBus.on('stateInitialized', () => {
    console.log('InventoryState wurde initialisiert');
});

eventBus.on('referencesLoaded', (references) => {
    console.log('Referenzdaten wurden geladen:', references);
});

// Modal-System
const Modal = {
    modal: null,
    title: null,
    message: null,
    buttons: null,
    confirmBtn: null,
    cancelBtn: null,
    closeBtn: null,

    init() {
        // DOM-Elemente einmalig speichern
        this.modal = document.getElementById('customModal');
        this.title = document.getElementById('modalTitle');
        this.message = document.getElementById('modalMessage');
        this.buttons = document.getElementById('modalButtons');
        this.confirmBtn = document.getElementById('modalConfirm');
        this.cancelBtn = document.getElementById('modalCancel');
        this.closeBtn = this.modal?.querySelector('.modal-close');

        // Stelle sicher, dass das Modal initial versteckt ist
        if (this.modal) {
            this.modal.style.display = 'none';
            this.modal.classList.add('hidden');
        }

        // Event-Listener für das X (Schließen) Button
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.hide());
        }

        // ESC-Taste zum Schließen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.modal?.classList.contains('hidden')) {
                this.hide();
            }
        });
    },

    reset() {
        if (this.title) this.title.textContent = '';
        if (this.message) this.message.textContent = '';
        if (this.buttons) this.buttons.style.display = 'none';
    },
    
    show(title, message, showButtons = true) {
        if (!this.modal) return;
        
        // Reset und neue Werte setzen
        this.reset();
        
        if (this.title) this.title.textContent = title;
        if (this.message) this.message.textContent = message;
        if (this.buttons) {
            this.buttons.style.display = showButtons ? 'flex' : 'none';
        }

        // Modal anzeigen
        this.modal.style.display = 'flex';
        this.modal.classList.remove('hidden');
    },
    
    hide() {
        if (!this.modal) return;
        
        // Modal ausblenden
        this.modal.style.display = 'none';
        this.modal.classList.add('hidden');
        this.reset();
    },
    
    async confirm(message) {
        return new Promise((resolve) => {
            this.show('Bestätigung', message, true);
            
            const handleConfirm = () => {
                cleanup();
                resolve(true);
            };
            
            const handleCancel = () => {
                cleanup();
                resolve(false);
            };
            
            const handleEscape = (e) => {
                if (e.key === 'Escape') handleCancel();
            };
            
            const cleanup = () => {
                this.hide();
                if (this.confirmBtn) this.confirmBtn.removeEventListener('click', handleConfirm);
                if (this.cancelBtn) this.cancelBtn.removeEventListener('click', handleCancel);
                if (this.closeBtn) this.closeBtn.removeEventListener('click', handleCancel);
                document.removeEventListener('keydown', handleEscape);
            };
            
            if (this.confirmBtn) this.confirmBtn.addEventListener('click', handleConfirm);
            if (this.cancelBtn) this.cancelBtn.addEventListener('click', handleCancel);
            if (this.closeBtn) this.closeBtn.addEventListener('click', handleCancel);
            document.addEventListener('keydown', handleEscape);
        });
    },
    
    success(message) {
        this.show('Erfolg', message, false);
        setTimeout(() => this.hide(), 3000);
    },
    
    error(message) {
        this.show('Fehler', message, false);
        setTimeout(() => this.hide(), 3000);
    }
};

// Initialisiere Modal erst wenn das DOM vollständig geladen ist
document.addEventListener('DOMContentLoaded', () => {
    Modal.init();
});

// Korrekte Session-Überprüfung
async function checkSession() {
    try {
        const token = sessionStorage.getItem('token');
        if (!token) {
            console.log('Kein Token gefunden');
            return null;
        }

        const response = await fetch('/api/auth/session', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('Session ist ungültig oder abgelaufen');
                // Token und User-Daten löschen
                sessionStorage.removeItem('token');
                sessionStorage.removeItem('currentUser');
                return null;
            }
            throw new Error('Fehler bei der Session-Überprüfung');
        }
        
        const data = await response.json();
        return data.authenticated ? data.user : null;
    } catch (error) {
        console.error('Session check failed:', error);
        return null;
    }
}

// Funktion zum Aktualisieren des Session-Timers
function updateSessionTimer() {
    const currentTime = new Date().getTime();
    sessionStorage.setItem('lastActivity', currentTime.toString());
    
    if (sessionTimer) {
        clearTimeout(sessionTimer);
    }
    sessionTimer = setTimeout(() => {
        Modal.show('Session abgelaufen', 'Sie werden aufgrund von Inaktivität abgemeldet', false);
        logout();
    }, SESSION_TIMEOUT);
}

// Event-Listener für Benutzeraktivität
function initializeSessionTracking() {
    ['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
        document.addEventListener(event, () => {
            if (currentUser) {
                updateSessionTimer();
            }
        });
    });
}

// Beim Laden der Seite
window.addEventListener('load', () => {
    // Prüfe Session-Gültigkeit
    if (!checkSession()) {
        logout();
        return;
    }

    // Initialisiere Session-Tracking
    initializeSessionTracking();
    updateSessionTimer(); // Initialen Timer starten

    // Initial alle Bereiche verstecken außer Login
    document.getElementById('timeEntryForm').classList.add('hidden');
    document.getElementById('timeHistory').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');

    // Wenn User bereits angemeldet ist
    const savedUser = sessionStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        updateSessionTimer(); // Timer initial setzen
        // Clear Inventory-Daten beim erneuten Login
        allMovements = [];
        showLoggedInState();
    }
});

// Funktion zum Anzeigen des angemeldeten Zustands
function showLoggedInState() {
    // Lösche zuerst alle alten Daten
    document.querySelector('#timeTable tbody').innerHTML = '';
    document.querySelector('#movementsTable tbody').innerHTML = '';
    document.getElementById('totalHours').textContent = '0:00';
    document.getElementById('timeEntry').reset();
    
    // Reset der globalen Variablen
    allMovements = [];
    references = {
        locations: [],
        types: [],
        articles: []
    };

    // Verstecke Login
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');

    // Setze Benutzerinformationen
    document.getElementById('userInfo').textContent = `Angemeldet als: ${currentUser.name}`;
    document.getElementById('userName').textContent = `(${currentUser.name})`;

    // Initialisiere Module basierend auf Berechtigungen
    initializeModuleNavigation();

    // Lade Daten nur wenn entsprechende Berechtigung vorhanden
    if (currentUser?.permissions?.timeTracking?.view) {
        loadLocations();
        loadTimeHistory();
    }
    
    // Lade Inventardaten wenn Berechtigung vorhanden
    if (currentUser?.permissions?.inventory?.view) {
        // Lade initial die Referenzdaten
        loadReferenceData();
    }

    // Initialisiere InventoryState nach Login
    if (currentUser?.permissions?.inventory?.view) {
        initializeInventoryState();
    }
}

// Neue Funktion zum Laden der Referenzdaten
async function loadReferenceData() {
    try {
        // Prüfe zuerst die Berechtigung
        if (!currentUser?.permissions?.inventory?.view) {
            console.log('Keine Berechtigung zum Laden der Referenzdaten');
            return;
        }

        const response = await fetch(`/api/inventory/references?employeeId=${currentUser.id}&nocache=${Date.now()}`);
        const data = await response.json();
        
        if (data.success) {
            references = data.references;
            // Lade die Filter-Optionen neu
            loadFilterOptions();
        } else {
            throw new Error(data.message || 'Fehler beim Laden der Referenzdaten');
        }
    } catch (error) {
        console.error('Fehler beim Laden der Referenzdaten:', error);
        // Zeige Fehlermeldung nur an, wenn der User die Berechtigung hat
        if (currentUser?.permissions?.inventory?.view) {
            Modal.error('Fehler beim Laden der Referenzdaten');
        }
    }
}

// Zentrale Logout-Funktion
function logout() {
    // Bestehenden Timer löschen
    if (sessionTimer) {
        clearTimeout(sessionTimer);
    }
    
    // Session-Daten löschen
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('lastActivity');
    currentUser = null;

    // Lösche alle angezeigten Daten
    document.querySelector('#timeTable tbody').innerHTML = '';
    document.querySelector('#movementsTable tbody').innerHTML = '';
    document.getElementById('totalHours').textContent = '0:00';
    document.getElementById('userName').textContent = '';
    document.getElementById('userInfo').textContent = '';
    document.getElementById('timeEntry').reset();

    // Verstecke alle Formulare und zeige Login
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('timeEntryForm').classList.add('hidden');
    document.getElementById('timeHistory').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');

    document.getElementById('employeeId').value = '';
    document.getElementById('password').value = '';

    // Clear Inventory-Daten
    allMovements = [];
}

// Event-Listener für Logout-Button
document.getElementById('logoutButton').addEventListener('click', () => {
    logout();
});

// Event-Listener für das Login-Formular
document.getElementById('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const employeeId = document.getElementById('employeeId').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ employeeId, password })
        });

        const data = await response.json();
        
        if (data.success) {
            // Debug-Logging für erhaltene Daten
            console.log('Login erfolgreich, erhaltene Daten:', data);
            
            // Token zuerst speichern
            sessionStorage.setItem('token', data.token);
            
            // Benutzer mit den vom Backend erhaltenen Berechtigungen speichern
            currentUser = {
                id: data.employeeId,
                name: data.name,
                permissions: data.permissions // Verwende die Berechtigungen vom Backend
            };
            
            // Debug-Logging für User-Objekt
            console.log('Erstelle User-Objekt:', currentUser);
            
            // User-Objekt nach Token speichern
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            updateSessionTimer();
            // Clear Inventory-Daten beim erneuten Login
            allMovements = [];
            showLoggedInState();
        } else {
            Modal.error('Login fehlgeschlagen: Falsche Mitarbeiter-ID oder falsches Passwort');
        }
    } catch (error) {
        console.error('Login-Fehler:', error);
        Modal.error('Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
    }
});

// Event-Listener für das Zeiterfassungs-Formular
document.getElementById('timeEntry').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn.disabled) {
        return;
    }
    
    submitBtn.disabled = true;
    
    try {
        const formData = {
            employeeId: currentUser.id,
            date: document.getElementById('date').value,
            location: document.getElementById('location').value,
            startTime: document.getElementById('startTime').value,
            endTime: document.getElementById('endTime').value
        };
        
        const response = await fetch('/api/time/entry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            Modal.success('Zeit erfolgreich erfasst');
            document.getElementById('timeEntry').reset();
            
            document.getElementById('timeEntryForm').classList.add('hidden');
            document.getElementById('timeHistory').classList.remove('hidden');
            
            await loadTimeHistory();
        } else {
            Modal.error(data.message || 'Fehler beim Speichern der Zeit');
        }
    } catch (error) {
        console.error('Fehler beim Speichern:', error);
        Modal.error('Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.');
    } finally {
        submitBtn.disabled = false;
    }
});

// Funktion zum Laden der Standorte
async function loadLocations() {
    try {
        const response = await fetch('/api/time/locations');
        const data = await response.json();
        
        if (data.success) {
            const locationSelect = document.getElementById('location');
            // Bestehende Optionen löschen (außer "Bitte wählen...")
            locationSelect.innerHTML = '<option value="">Bitte wählen...</option>';
            
            // Neue Optionen hinzufügen
            data.locations.forEach(location => {
                const option = document.createElement('option');
                option.value = location;
                option.textContent = location;
                locationSelect.appendChild(option);
            });
        } else {
            Modal.error('Fehler beim Laden der Standorte');
        }
    } catch (error) {
        console.error('Fehler beim Laden der Standorte:', error);
        Modal.error('Fehler beim Laden der Standorte');
    }
}

// Lade Standorte beim Start
loadLocations();

// Event-Listener für die Navigationsbuttons
document.getElementById('showTimeEntryForm').addEventListener('click', () => {
    document.getElementById('timeEntryForm').classList.remove('hidden');
    document.getElementById('timeHistory').classList.add('hidden');
});

document.getElementById('showTimeHistory').addEventListener('click', async () => {
    // Lösche alte Daten bevor neue geladen werden
    document.querySelector('#timeTable tbody').innerHTML = '';
    document.getElementById('totalHours').textContent = '0:00';

    document.getElementById('timeEntryForm').classList.add('hidden');
    document.getElementById('timeHistory').classList.remove('hidden');
    await loadTimeHistory();
});

// Hilfsfunktion zum Formatieren des Datums
function formatDate(dateStr) {
    // Wenn das Datum bereits im Format DD.MM.YYYY ist, gib es direkt zurück
    if (dateStr.includes('.')) {
        return dateStr;
    }
    // Ansonsten formatiere es von YYYY-MM-DD zu DD.MM.YYYY
    else if (dateStr.includes('-')) {
        const [year, month, day] = dateStr.split('-');
        return `${day}.${month}.${year}`;
    }
    // Fallback für unbekannte Formate
    return dateStr;
}

// Event-Listener für "Alle auswählen" Checkbox
document.getElementById('selectAll').addEventListener('change', function(e) {
    const checkboxes = document.querySelectorAll('#timeTable tbody input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = e.target.checked;
        const timestamp = checkbox.getAttribute('data-timestamp');
        if (e.target.checked) {
            selectedEntries.add(timestamp);
        } else {
            selectedEntries.delete(timestamp);
        }
    });
    updateDeleteButton();
});

// Funktion zum Aktualisieren des Lösch-Buttons
function updateDeleteButton() {
    const deleteButton = document.getElementById('deleteSelectedEntries');
    deleteButton.disabled = selectedEntries.size === 0;
}

// Event-Listener für den Lösch-Button
document.getElementById('deleteSelectedEntries').addEventListener('click', async () => {
    if (selectedEntries.size === 0) return;

    const confirmed = await Modal.confirm('Möchten Sie die ausgewählten Einträge wirklich löschen?');
    if (confirmed) {
        try {
            const response = await fetch('/api/time/entries', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    employeeId: currentUser.id,
                    timestamps: Array.from(selectedEntries)
                })
            });

            const data = await response.json();
            
            if (data.success) {
                await Modal.success(data.message);
                selectedEntries.clear();
                await loadTimeHistory();
            } else {
                await Modal.error('Fehler beim Löschen der Einträge');
            }
        } catch (error) {
            console.error('Fehler beim Löschen:', error);
            await Modal.error('Fehler beim Löschen der Einträge');
        }
    }
});

// Funktion zum Laden des Zeitkontos
async function loadTimeHistory() {
    try {
        console.log('Lade Zeitkonto für User:', currentUser.id);
        const response = await fetch(`/api/time/history/${currentUser.id}`);
        const data = await response.json();
        
        if (data.success) {
            console.log('Zeitkonto geladen:', data.times);
            const tbody = document.querySelector('#timeTable tbody');
            tbody.innerHTML = ''; // Lösche bestehende Einträge
            let totalMinutes = 0;
            
            data.times.forEach(entry => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <input type="checkbox" 
                               data-timestamp="${entry.timestamp}"
                               ${selectedEntries.has(entry.timestamp) ? 'checked' : ''}>
                    </td>
                    <td>${formatDate(entry.date)}</td>
                    <td>${entry.day || ''}</td>
                    <td>${entry.location}</td>
                    <td>${entry.startTime}</td>
                    <td>${entry.endTime}</td>
                    <td>${entry.workingHours}</td>
                `;
                tbody.appendChild(row);
                console.log('Zeile hinzugefügt:', row.innerHTML);
                
                // Addiere die Arbeitszeit zur Gesamtzeit
                const [hours, minutes] = entry.workingHours.split(':').map(Number);
                totalMinutes += hours * 60 + minutes;

                // Event-Listener für Checkbox
                const checkbox = row.querySelector('input[type="checkbox"]');
                checkbox.addEventListener('change', function(e) {
                    if (e.target.checked) {
                        selectedEntries.add(entry.timestamp);
                    } else {
                        selectedEntries.delete(entry.timestamp);
                    }
                    updateDeleteButton();
                });
            });
            
            // Zeige die Gesamtarbeitszeit an
            const totalHours = Math.floor(totalMinutes / 60);
            const remainingMinutes = totalMinutes % 60;
            document.getElementById('totalHours').textContent = 
                `${totalHours}:${remainingMinutes.toString().padStart(2, '0')}`;
        }
    } catch (error) {
        console.error('Fehler beim Laden des Zeitkontos:', error);
    }
}

function hasPermission(module, action = 'view') {
    console.log('Prüfe Berechtigung:', {
        module,
        action,
        currentUser,
        permissions: currentUser?.permissions,
        result: currentUser?.permissions?.[module]?.[action]
    });
    return currentUser?.permissions?.[module]?.[action] || false;
}

function initializeModuleNavigation() {
    console.log('Initialisiere Module...'); // Debug-Log
    
    const timeTrackingModule = document.getElementById('timeTracking');
    const inventoryModule = document.getElementById('inventory');
    const showTimeTrackingBtn = document.getElementById('showTimeTrackingModule');
    const showInventoryBtn = document.getElementById('showInventoryModule');
    const moduleNav = document.querySelector('.module-nav');
    
    // Debug-Ausgaben
    console.log('Current User:', currentUser);
    console.log('Berechtigungen:', currentUser?.permissions);

    // Setze alle Module initial auf inaktiv
    timeTrackingModule.classList.remove('active');
    inventoryModule.classList.remove('active');

    let visibleModules = 0;

    // Zeiterfassungs-Modul
    if (currentUser?.permissions?.timeTracking?.view) {
        console.log('Zeiterfassung erlaubt');
        timeTrackingModule.style.display = '';
        showTimeTrackingBtn.style.display = '';
        visibleModules++;
        
        showTimeTrackingBtn.addEventListener('click', () => {
            switchToModule('timeTracking');
        });
        // Initial aktivieren
        switchToModule('timeTracking');
    } else {
        timeTrackingModule.style.display = 'none';
        showTimeTrackingBtn.style.display = 'none';
    }

    // Warenwirtschafts-Modul
    if (currentUser?.permissions?.inventory?.view) {
        console.log('Warenwirtschaft erlaubt');
        inventoryModule.style.display = '';
        showInventoryBtn.style.display = '';
        visibleModules++;
        
        showInventoryBtn.addEventListener('click', () => {
            switchToModule('inventory');
        });
    } else {
        console.log('Warenwirtschaft nicht erlaubt');
        inventoryModule.style.display = 'none';
        showInventoryBtn.style.display = 'none';
    }

    // Zeige die Navigation nur wenn mehr als ein Modul verfügbar ist
    moduleNav.style.display = visibleModules > 1 ? '' : 'none';
}

function switchToModule(moduleName) {
    console.log('Wechsle zu Modul:', moduleName); // Debug-Log

    // Hole alle Module und Buttons
    const timeTrackingModule = document.getElementById('timeTracking');
    const inventoryModule = document.getElementById('inventory');
    const timeTrackingBtn = document.getElementById('showTimeTrackingModule');
    const inventoryBtn = document.getElementById('showInventoryModule');
    const timeTrackingButtons = document.getElementById('timeTrackingButtons');
    const inventoryButtons = document.getElementById('inventoryButtons');

    // Verstecke alle Module
    timeTrackingModule.classList.remove('active');
    inventoryModule.classList.remove('active');
    timeTrackingButtons.classList.add('hidden');
    inventoryButtons.classList.add('hidden');
    timeTrackingBtn.classList.remove('active');
    inventoryBtn.classList.remove('active');

    // Aktiviere das gewählte Modul
    if (moduleName === 'timeTracking') {
        timeTrackingModule.classList.add('active');
        timeTrackingBtn.classList.add('active');
        timeTrackingButtons.classList.remove('hidden');
        
        // Zeige initial das Zeitkonto
        document.getElementById('timeEntryForm').classList.add('hidden');
        document.getElementById('timeHistory').classList.remove('hidden');
    } else if (moduleName === 'inventory') {
        inventoryModule.classList.add('active');
        inventoryBtn.classList.add('active');
        inventoryButtons.classList.remove('hidden');
    }

    console.log('Modul-Status nach Wechsel:', { // Debug-Log
        timeTracking: timeTrackingModule.classList.contains('active'),
        inventory: inventoryModule.classList.contains('active')
    });
}

// Session Timeout Dialog
function showSessionTimeoutDialog() {
    Swal.fire({
        title: 'Session abgelaufen',
        text: 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',
        icon: 'warning',
        showCancelButton: false, // Kein Abbrechen-Button mehr
        confirmButtonColor: '#3085d6',
        confirmButtonText: 'Zum Login',
        allowOutsideClick: false,
        allowEscapeKey: false
    }).then((result) => {
        if (result.isConfirmed) {
            window.location.reload(); // Seite neu laden
        }
    });
}

// Event-Listener für Inventory-Buttons
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dom Content geladen, initialisiere Inventory-Button Event-Listener...');
    
    // Prüfe, ob die Elemente vorhanden sind
    const showInventoryList = document.getElementById('showInventoryList');
    const showInventoryMovements = document.getElementById('showInventoryMovements');
    const showNewMovement = document.getElementById('showNewMovement');
    
    console.log('Prüfe Inventory-Buttons:', {
        showInventoryList: showInventoryList ? 'gefunden' : 'NICHT GEFUNDEN!',
        showInventoryMovements: showInventoryMovements ? 'gefunden' : 'NICHT GEFUNDEN!',
        showNewMovement: showNewMovement ? 'gefunden' : 'NICHT GEFUNDEN!'
    });
    
    // Prüfe auch ob inventoryUI initialisiert ist
    console.log('inventoryUI ist', inventoryUI ? 'initialisiert' : 'NICHT initialisiert');
    
    // Hinweis auf alle verfügbaren Buttons im DOM
    console.log('Alle Buttons im DOM:', 
        Array.from(document.querySelectorAll('button')).map(b => ({ id: b.id, text: b.textContent }))
    );
    
    if (showInventoryList) {
        showInventoryList.addEventListener('click', () => {
            if (!inventoryUI) {
                console.error('inventoryUI ist nicht initialisiert');
                return;
            }
            console.log('Button geklickt: Bestandsübersicht');
            
            // Für Debugging-Zwecke direkter Zugriff auf Container-Elemente
            console.log('Container-Elemente in InventoryUI:', {
                container: inventoryUI.elements.container,
                inventoryListView: inventoryUI.elements.container.inventoryList ? 'gefunden' : 'nicht gefunden',
                inventoryMovementsView: inventoryUI.elements.container.movements ? 'gefunden' : 'nicht gefunden',
                newMovementView: inventoryUI.elements.container.newMovement ? 'gefunden' : 'nicht gefunden'
            });
            
            inventoryUI.showView('inventoryListView');
        });
    }
    
    if (showInventoryMovements) {
        showInventoryMovements.addEventListener('click', () => {
            if (!inventoryUI) {
                console.error('inventoryUI ist nicht initialisiert');
                return;
            }
            console.log('Button geklickt: Bewegungsübersicht');
            
            // Für Debugging-Zwecke direkter Zugriff auf Container-Elemente
            console.log('Container-Elemente in InventoryUI:', {
                container: inventoryUI.elements.container,
                inventoryListView: inventoryUI.elements.container.inventoryList ? 'gefunden' : 'nicht gefunden',
                inventoryMovementsView: inventoryUI.elements.container.movements ? 'gefunden' : 'nicht gefunden',
                newMovementView: inventoryUI.elements.container.newMovement ? 'gefunden' : 'nicht gefunden'
            });
            
            inventoryUI.showView('inventoryMovementsView');
        });
    }
    
    if (showNewMovement) {
        showNewMovement.addEventListener('click', () => {
            if (!inventoryUI) {
                console.error('inventoryUI ist nicht initialisiert');
                return;
            }
            console.log('Button geklickt: Bewegungen buchen');
            
            // Für Debugging-Zwecke direkter Zugriff auf Container-Elemente
            console.log('Container-Elemente in InventoryUI:', {
                container: inventoryUI.elements.container,
                inventoryListView: inventoryUI.elements.container.inventoryList ? 'gefunden' : 'nicht gefunden',
                inventoryMovementsView: inventoryUI.elements.container.movements ? 'gefunden' : 'nicht gefunden',
                newMovementView: inventoryUI.elements.container.newMovement ? 'gefunden' : 'nicht gefunden'
            });
            
            inventoryUI.showView('newMovementView');
            loadNewMovementFormOptions();
        });
    }
});

// Funktion zum Laden der Bewegungsdaten
async function loadMovements() {
    try {
        // Lade zuerst die Referenzdaten neu
        await loadReferenceData();
        
        // Verwende den InventoryState für das Laden der Bewegungen
        if (inventoryState) {
            await inventoryState.loadMovements();
        }
    } catch (error) {
        console.error('Fehler beim Laden der Bewegungen:', error);
        ErrorHandler.handle(error);
    }
}

// Funktion zum Laden der Filter-Optionen aktualisieren
function loadFilterOptions() {
    try {
        console.log('Lade Filter-Optionen...', references);
        const locationFilter = document.getElementById('locationFilter');
        const typeFilter = document.getElementById('typeFilter');
        const articleFilter = document.getElementById('articleFilter');

        if (!locationFilter || !typeFilter || !articleFilter) {
            console.warn('Filter-Elemente nicht gefunden');
            return;
        }

        locationFilter.innerHTML = '<option value="">Alle Lagerorte...</option>';
        typeFilter.innerHTML = '<option value="">Alle Bewegungstypen...</option>';
        articleFilter.innerHTML = '<option value="">Alle Artikel...</option>';

        references.locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.id;
            option.textContent = `${location.id} - ${location.name}`;
            locationFilter.appendChild(option);
        });

        references.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = `${type.id} - ${type.name}`;
            typeFilter.appendChild(option);
        });

        references.articles.forEach(article => {
            const option = document.createElement('option');
            option.value = article.id;
            option.textContent = `${article.id} - ${article.name}`;
            articleFilter.appendChild(option);
        });

        console.log('Filter-Optionen geladen');
    } catch (error) {
        console.error('Fehler beim Laden der Filter-Optionen:', error);
    }
}

// Aktualisiere die Tabellen-Update-Funktion
function updateMovementsTable() {
    try {
        const tbody = document.querySelector('#movementsTable tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        
        // Verwende die Daten direkt aus dem InventoryState
        if (inventoryState && inventoryState.movements) {
            inventoryState.movements.forEach(movement => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${movement.datum}</td>
                    <td>${movement.mitarbeiter}</td>
                    <td>${movement.lagerort_id}</td>
                    <td>${movement.lagerort}</td>
                    <td>${movement.typ_id}</td>
                    <td>${movement.trans_typ}</td>
                    <td>${movement.artikel_id}</td>
                    <td>${movement.artikel}</td>
                    <td>${movement.transaktionsmenge}</td>
                    <td>${movement.bestand_lo}</td>
                    <td>${movement.buchungstext}</td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (error) {
        console.error('Fehler beim Aktualisieren der Tabelle:', error);
    }
}

// Hilfsfunktion zum Ausblenden aller Inventory-Views
function hideAllInventoryViews() {
    document.querySelectorAll('.inventory-view').forEach(view => {
        view.classList.add('hidden');
    });
}

// Funktion zum Laden der Auswahloptionen für das Buchungsformular
function loadNewMovementFormOptions() {
    try {
        const locationSelect = document.getElementById('newLocationId');
        const typeSelect = document.getElementById('newTypeId');
        const articleSelect = document.getElementById('newArticleId');
        
        // Lösche bestehende Optionen (außer der ersten)
        locationSelect.innerHTML = '<option value="">Bitte wählen...</option>';
        typeSelect.innerHTML = '<option value="">Bitte wählen...</option>';
        articleSelect.innerHTML = '<option value="">Bitte wählen...</option>';
        
        // Füge die Optionen aus den Referenzdaten hinzu
        references.locations.forEach(loc => {
            const option = document.createElement('option');
            option.value = loc.id;
            option.textContent = `${loc.id} - ${loc.name}`;
            locationSelect.appendChild(option);
        });
        
        references.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type.id;
            option.textContent = `${type.id} - ${type.name}`;
            typeSelect.appendChild(option);
        });
        
        references.articles.forEach(article => {
            const option = document.createElement('option');
            option.value = article.id;
            option.textContent = `${article.id} - ${article.name}`;
            articleSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Fehler beim Laden der Formular-Optionen:', error);
    }
}

// Event-Listener für das Buchungsformular
document.getElementById('newMovementForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        const formData = {
            timestamp: new Date().toISOString(),
            mitarbeiter_id: currentUser.id,
            lagerort_id: document.getElementById('newLocationId').value,
            typ_id: document.getElementById('newTypeId').value,
            artikel_id: document.getElementById('newArticleId').value,
            transaktionsmenge: parseInt(document.getElementById('newQuantity').value),
            buchungstext: document.getElementById('newText').value || ''
        };
        
        // Nutze den InventoryService statt direktem API-Call
        const success = await inventoryService.createMovement(formData);
        
        if (success) {
            // Modal für Erfolgsmeldung anzeigen
            Modal.show(
                'Erfolg',
                'Buchung erfolgreich gespeichert!',
                false  // Keine Buttons anzeigen
            );
            // Modal nach 2 Sekunden automatisch schließen
            setTimeout(() => {
                Modal.hide();
            }, 2000);

            document.getElementById('newMovementForm').reset();
            // Zurück zur Bewegungsübersicht und neu laden
            document.getElementById('showInventoryMovements').click();
        } else {
            throw new Error('Fehler beim Speichern der Buchung');
        }
    } catch (error) {
        console.error('Fehler beim Buchen:', error);
        ErrorHandler.handle(error);
    }
});

// Initialisiere InventoryState nach erfolgreichem Login
async function initializeInventoryState() {
    console.log('Initialisiere InventoryState...');
    inventoryState = new InventoryState();
    inventoryService = new InventoryService(inventoryState);
    inventoryUI = new InventoryUI(inventoryState, inventoryService);
    console.log('InventoryService und UI wurden initialisiert');
} 