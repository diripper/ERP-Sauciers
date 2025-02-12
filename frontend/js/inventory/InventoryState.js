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

    async initialize() {
        try {
            await this.loadReferences();
            eventBus.emit('stateInitialized');
        } catch (error) {
            ErrorHandler.handle(error, 'Fehler bei der Initialisierung');
        }
    }

    async loadReferences() {
        try {
            const token = sessionStorage.getItem('token');
            if (!token) {
                throw new Error('Kein gültiger Token vorhanden');
            }

            const response = await fetch('/api/inventory/references', {
                headers: {
                    'Authorization': `Bearer ${token}`
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
            eventBus.emit('referencesLoaded', this.references);
            return this.references;
        } catch (error) {
            ErrorHandler.handle(error, 'Fehler beim Laden der Referenzdaten');
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
            
            // Prüfe Cache
            const cachedResult = this.cache.results.get(cacheKey);
            if (this._isCacheValid(cachedResult)) {
                console.log('Verwende Cache-Daten für:', this.filters);
                this.movements = cachedResult.data.movements;
                this.pagination = cachedResult.data.pagination;
                eventBus.emit('movementsLoaded', this.movements);
                return this.movements;
            }

            // Cache-Bereinigung
            this._cleanupCache();

            // Erstelle Query-Parameter für die Anfrage
            const queryParams = new URLSearchParams({
                page: this.pagination.currentPage,
                limit: this.pagination.entriesPerPage,
                employeeId: JSON.parse(sessionStorage.getItem('currentUser'))?.id
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
                    'Authorization': `Bearer ${this.token}`
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

            // Speichere Ergebnis im Cache
            this.cache.results.set(cacheKey, {
                timestamp: Date.now(),
                data: {
                    movements: this.movements,
                    pagination: this.pagination
                }
            });
            
            console.log('Bewegungen geladen:', {
                anzahlBewegungen: this.movements.length,
                pagination: this.pagination,
                filter: this.filters,
                totalPages: totalPages
            });

            eventBus.emit('movementsLoaded', this.movements);
            return this.movements;
        } catch (error) {
            ErrorHandler.handle(error, 'Fehler beim Laden der Bewegungen');
            throw error;
        }
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

    getMovementType(typeId) {
        return this.references.types.find(type => type.id === typeId);
    }

    requiresDoubleBooking(typeId) {
        const type = this.getMovementType(typeId);
        return type?.numberOfBookings === 2;
    }
}

// Exportiere die Klasse für Module-Support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InventoryState;
} 