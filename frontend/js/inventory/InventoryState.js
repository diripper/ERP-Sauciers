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
        this.filteredMovements = [];

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

    async loadMovements() {
        try {
            if (!this.token) {
                this.token = sessionStorage.getItem('token');
                if (!this.token) {
                    throw new Error('Kein gültiger Token vorhanden');
                }
            }

            const queryParams = new URLSearchParams({
                page: this.pagination.currentPage,
                limit: this.pagination.entriesPerPage,
                employeeId: JSON.parse(sessionStorage.getItem('currentUser'))?.id
            });

            console.log('Lade Bewegungen mit Parametern:', {
                page: this.pagination.currentPage,
                limit: this.pagination.entriesPerPage
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

            this.movements = data.movements;
            this.pagination = {
                ...this.pagination,
                currentPage: data.pagination.page,
                entriesPerPage: data.pagination.limit,
                totalRows: data.pagination.totalRows,
                totalPages: data.pagination.totalPages
            };
            
            console.log('Bewegungen geladen:', {
                anzahlBewegungen: this.movements.length,
                pagination: this.pagination
            });

            this.applyFilters();
            eventBus.emit('movementsLoaded', this.filteredMovements);
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

    updatePagination(newPage) {
        this.pagination.currentPage = newPage;
        eventBus.emit('paginationChanged', this.pagination);
        return this.loadMovements();
    }

    updateEntriesPerPage(entries) {
        this.pagination.entriesPerPage = parseInt(entries);
        this.pagination.currentPage = 1;
        eventBus.emit('paginationChanged', this.pagination);
        return this.loadMovements();
    }

    updateFilters(newFilters) {
        this.filters = { ...this.filters, ...newFilters };
        this.pagination.currentPage = 1;
        this.applyFilters();
        eventBus.emit('filtersUpdated', this.filters);
    }

    resetFilters() {
        this.filters = {
            location: '',
            type: '',
            article: '',
            dateFrom: '',
            dateTo: ''
        };
        this.pagination.currentPage = 1;
        this.applyFilters();
        eventBus.emit('filtersReset');
    }

    applyFilters() {
        this.filteredMovements = this.movements.filter(movement => {
            const locationMatch = !this.filters.location || 
                                movement.lagerort_id === this.filters.location;
            
            const typeMatch = !this.filters.type || 
                            movement.typ_id === this.filters.type;
            
            const articleMatch = !this.filters.article || 
                               movement.artikel_id === this.filters.article;
            
            let dateMatch = true;
            if (this.filters.dateFrom || this.filters.dateTo) {
                const [day, month, year] = movement.datum.split('.');
                const movementDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                movementDate.setHours(0, 0, 0, 0);

                if (this.filters.dateFrom) {
                    const fromDate = new Date(this.filters.dateFrom);
                    fromDate.setHours(0, 0, 0, 0);
                    dateMatch = dateMatch && movementDate >= fromDate;
                }

                if (this.filters.dateTo) {
                    const toDate = new Date(this.filters.dateTo);
                    toDate.setHours(23, 59, 59, 999);
                    dateMatch = dateMatch && movementDate <= toDate;
                }
            }

            return locationMatch && typeMatch && articleMatch && dateMatch;
        });

        eventBus.emit('movementsFiltered', this.filteredMovements);
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