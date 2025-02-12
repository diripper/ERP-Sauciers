class InventoryState {
    constructor() {
        // Referenzdaten
        this.references = {
            locations: [],
            types: [],
            articles: []
        };

        // Bewegungsdaten
        this.movements = [];

        // Pagination
        this.pagination = {
            currentPage: 1,
            entriesPerPage: 10,
            totalRows: 0,
            totalPages: 1
        };

        // Filter
        this.filters = {
            location: '',
            type: '',
            article: '',
            dateFrom: '',
            dateTo: ''
        };

        // View-Status
        this.currentView = null;
        
        // Cache-System für Filterergebnisse
        this.cache = {
            results: new Map(),
            timeout: 5 * 60 * 1000, // 5 Minuten Cache-Dauer
            lastCleanup: Date.now()
        };

        // Initialisierung
        this.initialize();
    }

    /**
     * Initialisiert den State und lädt die notwendigen Daten
     */
    async initialize() {
        try {
            console.log('Initialisiere InventoryState...');
            await this.loadReferences();
            console.log('Referenzdaten geladen:', this.references);
            eventBus.emit('stateInitialized');
        } catch (error) {
            console.error('Fehler bei der Initialisierung:', error);
            ErrorHandler.handle(error, 'Fehler beim Initialisieren des Inventory-States');
        }
    }

    /**
     * Lädt die Referenzdaten vom Server
     */
    async loadReferences() {
        try {
            const response = await fetch('/api/inventory/references', {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Fehler beim Laden der Referenzdaten');
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || 'Fehler beim Laden der Referenzdaten');
            }

            this.references = data.references;
            console.log('Referenzdaten aktualisiert:', this.references);
            eventBus.emit('referencesLoaded', this.references);
        } catch (error) {
            console.error('Fehler beim Laden der Referenzdaten:', error);
            throw error;
        }
    }

    /**
     * Generiert einen Cache-Schlüssel aus den aktuellen Filterparametern
     * @private
     */
    _generateCacheKey() {
        return JSON.stringify({
            filters: this.filters,
            page: this.pagination.currentPage,
            limit: this.pagination.entriesPerPage
        });
    }

    /**
     * Prüft ob ein Cache-Eintrag gültig ist
     * @private
     */
    _isCacheValid(cacheEntry) {
        if (!cacheEntry) return false;
        return (Date.now() - cacheEntry.timestamp) < this.cache.timeout;
    }

    /**
     * Bereinigt alte Cache-Einträge
     * @private
     */
    _cleanupCache() {
        const now = Date.now();
        // Cleanup nur alle 5 Minuten durchführen
        if (now - this.cache.lastCleanup < 5 * 60 * 1000) return;

        for (const [key, entry] of this.cache.results.entries()) {
            if (!this._isCacheValid(entry)) {
                this.cache.results.delete(key);
            }
        }
        this.cache.lastCleanup = now;
    }

    /**
     * Invalidiert den Cache
     */
    _invalidateCache() {
        console.log('Invalidiere Cache und erzwinge Neuladen');
        this.cache.results = new Map(); // Komplette Neuerstellung der Map
        this.cache.lastCleanup = Date.now();
        this._forceReload = true;
        
        // Setze die Pagination zurück auf Seite 1
        this.pagination.currentPage = 1;
        
        // Lösche alle Filter
        Object.keys(this.filters).forEach(key => {
            this.filters[key] = '';
        });
    }

    /**
     * Lädt die Bewegungen vom Server
     */
    async loadMovements() {
        try {
            if (!this.token) {
                this.token = sessionStorage.getItem('token');
                if (!this.token) {
                    throw new Error('Kein gültiger Token vorhanden');
                }
            }

            // Cache-Schlüssel generieren
            const cacheKey = this._generateCacheKey();
            
            // Prüfe Cache-Gültigkeit - nur wenn kein Force-Reload aktiv ist
            const cachedResult = this.cache.results.get(cacheKey);
            if (!this._forceReload && this._isCacheValid(cachedResult) && this.cache.results.size > 0) {
                console.log('Verwende Cache-Daten für:', this.filters);
                this.movements = cachedResult.data.movements;
                this.pagination = cachedResult.data.pagination;
                eventBus.emit('movementsLoaded', this.movements);
                return this.movements;
            }

            // Wenn Cache ungültig, Force-Reload aktiv oder Cache leer, lade vom Server
            console.log(this._forceReload ? 'Erzwinge Neuladen der Daten vom Server' : 'Cache ungültig, lade neu vom Server');
            return await this._loadFromServer();
        } catch (error) {
            console.error('Fehler beim Laden der Bewegungen:', error);
            ErrorHandler.handle(error, 'Fehler beim Laden der Bewegungen');
            throw error;
        } finally {
            // Setze _forceReload zurück
            this._forceReload = false;
        }
    }

    /**
     * Lädt die Daten direkt vom Server
     * @private
     */
    async _loadFromServer() {
        console.log('Lade Daten neu vom Server');
        
        // Cache-Bereinigung
        this._cleanupCache();

        // Erstelle Query-Parameter für die Anfrage
        const queryParams = new URLSearchParams({
            page: this.pagination.currentPage,
            limit: this.pagination.entriesPerPage,
            employeeId: JSON.parse(sessionStorage.getItem('currentUser'))?.id,
            nocache: Date.now() // Verhindere Browser-Caching
        });

        // Füge nur nicht-leere Filter hinzu
        Object.entries(this.filters).forEach(([key, value]) => {
            if (value) {
                queryParams.append(key, value);
            }
        });

        console.log('Lade Bewegungen mit Parametern:', {
            page: this.pagination.currentPage,
            limit: this.pagination.entriesPerPage,
            filter: this.filters
        });

        const response = await fetch(`/api/inventory/movements?${queryParams}`, {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        if (!response.ok) {
            throw new Error('Fehler beim Laden der Bewegungen');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || 'Fehler beim Laden der Bewegungen');
        }

        // Aktualisiere den State
        this.movements = data.movements;
        
        // Aktualisiere die Paginierung
        const totalPages = Math.ceil(data.pagination.totalRows / data.pagination.limit);
        this.pagination = {
            currentPage: parseInt(data.pagination.page),
            entriesPerPage: parseInt(data.pagination.limit),
            totalRows: parseInt(data.pagination.totalRows),
            totalPages: totalPages
        };

        // Speichere Ergebnis im Cache wenn nicht erzwungenes Neuladen
        if (!this._forceReload) {
            const cacheKey = this._generateCacheKey();
            this.cache.results.set(cacheKey, {
                timestamp: Date.now(),
                data: {
                    movements: this.movements,
                    pagination: this.pagination
                }
            });
        }
        
        console.log('Bewegungen geladen:', {
            anzahlBewegungen: this.movements.length,
            pagination: this.pagination,
            filter: this.filters,
            totalPages: totalPages
        });

        eventBus.emit('movementsLoaded', this.movements);
        return this.movements;
    }

    setCurrentView(view) {
        this.currentView = view;
        eventBus.emit('viewChanged', view);
    }

    async updatePagination(newPage) {
        this.pagination.currentPage = newPage;
        return await this.loadMovements();
    }

    async updateEntriesPerPage(entries) {
        this.pagination.entriesPerPage = parseInt(entries);
        this.pagination.currentPage = 1;
        return await this.loadMovements();
    }

    /**
     * Gibt den Bewegungstyp für eine bestimmte ID zurück
     * @param {string} typeId - Die ID des Bewegungstyps
     * @returns {Object|null} Der gefundene Bewegungstyp oder null
     */
    getMovementType(typeId) {
        console.log('Suche Bewegungstyp:', {
            typeId,
            availableTypes: this.references?.types,
            hasReferences: !!this.references
        });
        
        if (!this.references?.types) {
            console.error('Keine Bewegungstypen in den Referenzdaten gefunden');
            return null;
        }
        
        const type = this.references.types.find(type => type.id === typeId);
        console.log('Gefundener Bewegungstyp:', type);
        return type;
    }

    /**
     * Prüft ob ein Bewegungstyp eine Doppelbuchung erfordert
     * @param {string} typeId - Die ID des Bewegungstyps
     * @returns {boolean} True wenn Doppelbuchung erforderlich
     */
    requiresDoubleBooking(typeId) {
        const type = this.getMovementType(typeId);
        console.log('Prüfe Doppelbuchung:', {
            typeId,
            type,
            numberOfBookings: type?.numberOfBookings
        });
        return type?.numberOfBookings === 2;
    }
}

// Exportiere die Klasse für Module-Support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InventoryState;
} 