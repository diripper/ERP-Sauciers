/**
 * UI-Komponente für die Inventarverwaltung.
 * Handhabt alle UI-Interaktionen und Updates.
 */
class InventoryUI {
    constructor(state, service) {
        this.state = state;
        this.service = service;
        this.elements = {};
        this.currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
        this.isSubmitting = false;
        
        // Performance-Optimierung: Debounce für Filter-Updates
        this.filterDebounceTimeout = null;
        this.FILTER_DEBOUNCE_DELAY = 300; // 300ms Verzögerung
        
        // Cache für DOM-Elemente
        this._tableRowCache = new WeakMap();
        
        this.initializeElements();
        this.bindEvents();
        this.bindStateEvents();
    }

    /**
     * Initialisiert alle benötigten DOM-Elemente
     * @private
     */
    initializeElements() {
        // Haupt-Container
        this.elements.container = {
            inventoryList: document.getElementById('inventoryListView'),
            movements: document.getElementById('inventoryMovementsView'),
            newMovement: document.getElementById('newMovementView')
        };

        // Debug-Logging für Container-Initialisierung
        console.log('Container-Initialisierung:', {
            inventoryList: !!this.elements.container.inventoryList,
            movements: !!this.elements.container.movements,
            newMovement: !!this.elements.container.newMovement
        });

        // Tabellen
        this.elements.tables = {
            inventoryBody: document.querySelector('#inventoryTable tbody'),
            movementsBody: document.querySelector('#movementsTable tbody')
        };

        // Filter
        this.elements.filters = {
            location: document.getElementById('locationFilter'),
            type: document.getElementById('typeFilter'),
            article: document.getElementById('articleFilter'),
            dateFrom: document.getElementById('dateFromFilter'),
            dateTo: document.getElementById('dateToFilter'),
            apply: document.getElementById('applyDateFilter'),
            reset: document.getElementById('resetFilters'),
            entriesPerPage: document.getElementById('entriesPerPage')
        };

        // Navigation
        this.elements.navigation = {
            showList: document.getElementById('showInventoryList'),
            showMovements: document.getElementById('showInventoryMovements'),
            showNewMovement: document.getElementById('showNewMovement'),
            prevPage: document.getElementById('prevPage'),
            nextPage: document.getElementById('nextPage'),
            currentPage: document.getElementById('currentPage'),
            totalPages: document.getElementById('totalPages')
        };

        // Buchungsformular
        this.elements.form = {
            newMovement: document.getElementById('newMovementForm'),
            location: document.getElementById('newLocationId'),
            targetLocation: document.getElementById('newTargetLocationId'),
            targetLocationGroup: document.getElementById('targetLocationGroup'),
            type: document.getElementById('newTypeId'),
            article: document.getElementById('newArticleId'),
            quantity: document.getElementById('newQuantity'),
            text: document.getElementById('newText')
        };
    }

    /**
     * Bindet Event-Listener an UI-Elemente
     * @private
     */
    bindEvents() {
        // Navigation Events mit Error Handling
        Object.entries({
            'showList': 'inventoryListView',
            'showMovements': 'inventoryMovementsView',
            'showNewMovement': 'newMovementView'
        }).forEach(([key, view]) => {
            this.elements.navigation[key]?.addEventListener('click', () => {
                try {
                    this.showView(view);
                } catch (error) {
                    ErrorHandler.handle(error, `Fehler beim Anzeigen von ${view}`);
                }
            });
        });

        // Paginierungs-Events
        if (this.elements.navigation.prevPage) {
            console.log('Registriere prevPage Event');
            this.elements.navigation.prevPage.addEventListener('click', () => this.handlePageNavigation(-1));
        }
        
        if (this.elements.navigation.nextPage) {
            console.log('Registriere nextPage Event');
            this.elements.navigation.nextPage.addEventListener('click', () => this.handlePageNavigation(1));
        }

        // Einträge pro Seite Event
        if (this.elements.filters.entriesPerPage) {
            console.log('Registriere entriesPerPage Event');
            this.elements.filters.entriesPerPage.addEventListener('change', (e) => this.handleEntriesPerPageChange(e));
        }

        // Filter Events mit Debouncing
        Object.values(this.elements.filters).forEach(filter => {
            if (filter?.tagName === 'SELECT' || filter?.type === 'date') {
                filter.addEventListener('change', () => this.debouncedFilterChange());
            }
        });

        // Optimierte Form Events
        this._initializeFormEvents();
    }

    /**
     * Initialisiert die Formular-Events mit optimiertem Event-Handling
     * @private
     */
    _initializeFormEvents() {
        const form = this.elements.form.newMovement;
        if (form) {
            const newForm = form.cloneNode(true);
            form.parentNode.replaceChild(newForm, form);
            
            // Aktualisiere Formularreferenzen
            this._updateFormReferences(newForm);
            
            // Event-Listener für Formular
            newForm.addEventListener('submit', (e) => this._handleFormSubmit(e));
            
            // Type-Change Handler
            const typeSelect = this.elements.form.type;
            if (typeSelect) {
                typeSelect.addEventListener('change', () => this.handleMovementTypeChange());
            }
        }
    }

    /**
     * Aktualisiert die Formularreferenzen nach dem Klonen
     * @private
     */
    _updateFormReferences(newForm) {
        this.elements.form = {
            newMovement: newForm,
            location: newForm.querySelector('#newLocationId'),
            targetLocation: newForm.querySelector('#newTargetLocationId'),
            targetLocationGroup: newForm.querySelector('#targetLocationGroup'),
            type: newForm.querySelector('#newTypeId'),
            article: newForm.querySelector('#newArticleId'),
            quantity: newForm.querySelector('#newQuantity'),
            text: newForm.querySelector('#newText')
        };
    }

    /**
     * Behandelt Formular-Submits mit optimierter Validierung
     * @private
     */
    async _handleFormSubmit(event) {
        event.preventDefault();
        event.stopPropagation();
        
        if (this.isSubmitting) return;

        const formData = this._validateAndGetFormData();
        if (!formData) return;

        const submitButton = event.target.querySelector('button[type="submit"]');
        await this._processFormSubmission(formData, submitButton);
    }

    /**
     * Validiert und sammelt Formulardaten
     * @private
     * @returns {Object|null} Formulardaten oder null bei Fehler
     */
    _validateAndGetFormData() {
        const formData = {
            lagerort_id: this.elements.form.location.value,
            typ_id: this.elements.form.type.value,
            artikel_id: this.elements.form.article.value,
            transaktionsmenge: parseInt(this.elements.form.quantity.value)
        };

        const errors = [];
        if (!formData.lagerort_id) errors.push('Lagerort muss ausgewählt werden');
        if (!formData.typ_id) errors.push('Bewegungstyp muss ausgewählt werden');
        if (!formData.artikel_id) errors.push('Artikel muss ausgewählt werden');
        if (!formData.transaktionsmenge) errors.push('Gültige Transaktionsmenge erforderlich');

        if (errors.length > 0) {
            ErrorHandler.handleValidation(errors.join('\n'));
            return null;
        }

        return formData;
    }

    /**
     * Verarbeitet die Formularübermittlung
     * @private
     */
    async _processFormSubmission(formData, submitButton) {
        submitButton.disabled = true;
        this.isSubmitting = true;

        try {
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
            if (!currentUser) throw new Error('Keine Benutzerinformationen verfügbar');

            const movementData = {
                mitarbeiter_id: currentUser.id,
                ...formData,
                buchungstext: this.elements.form.text.value || '',
                ziel_lagerort_id: this.elements.form.targetLocation?.value || null
            };

            const success = await this.service.createMovement(movementData);
            if (success) {
                ErrorHandler.handleSuccess('Buchung erfolgreich gespeichert');
                this.elements.form.newMovement.reset();
                await this._handleSuccessfulSubmission();
            }
        } catch (error) {
            ErrorHandler.handle(error);
        } finally {
            submitButton.disabled = false;
            this.isSubmitting = false;
        }
    }

    /**
     * Behandelt erfolgreiche Formularübermittlung
     * @private
     */
    async _handleSuccessfulSubmission() {
        await new Promise(resolve => setTimeout(resolve, 500));
        const loadMovementsPromise = this.state.loadMovements();
        this.showView('inventoryMovementsView');
        await loadMovementsPromise;
    }

    /**
     * Implementiert Debouncing für Filter-Änderungen
     * @private
     */
    debouncedFilterChange() {
        if (this.filterDebounceTimeout) {
            clearTimeout(this.filterDebounceTimeout);
        }
        
        this.filterDebounceTimeout = setTimeout(() => {
            this.handleFilterChange();
        }, this.FILTER_DEBOUNCE_DELAY);
    }

    bindStateEvents() {
        eventBus.on('stateInitialized', () => {
            this.updateFormSelects();
            this.updateFilterSelects();
        });

        eventBus.on('referencesLoaded', () => {
            this.updateFormSelects();
            this.updateFilterSelects();
        });

        eventBus.on('movementsLoaded', () => {
            this.updateMovementsTable();
            this.updatePagination();
        });

        eventBus.on('movementCreated', () => {
            this.showView('inventoryMovementsView');
            this.state.loadMovements();
        });

        eventBus.on('filtersUpdated', () => {
            this.updateMovementsTable();
        });
    }

    /**
     * Zeigt die ausgewählte Ansicht an
     * @param {string} viewName - Name der anzuzeigenden Ansicht
     */
    async showView(viewName) {
        try {
            console.log('Zeige View:', viewName);
            
            // Verstecke alle Views
            Object.values(this.elements.container).forEach(container => {
                if (container) container.classList.add('hidden');
            });

            // Bestimme den Container basierend auf dem viewName
            let container;
            switch(viewName) {
                case 'inventoryListView':
                    container = this.elements.container.inventoryList;
                    break;
                case 'inventoryMovementsView':
                    container = this.elements.container.movements;
                    break;
                case 'newMovementView':
                    container = this.elements.container.newMovement;
                    break;
                default:
                    throw new Error(`Unbekannte View: ${viewName}`);
            }

            if (!container) {
                console.error('Container nicht gefunden:', {
                    viewName,
                    container,
                    allContainers: this.elements.container
                });
                throw new Error(`Container für View ${viewName} nicht gefunden`);
            }

            // Zeige den Container
            container.classList.remove('hidden');
            
            // Optimierte Datenladelogik
            switch(viewName) {
                case 'inventoryListView':
                    const items = await this.service.loadInventoryList();
                    this.updateInventoryTable(items);
                    break;
                    
                case 'inventoryMovementsView':
                    await Promise.all([
                        this.state.loadMovements(),
                        this._updateFilterOptions()
                    ]);
                    break;
                    
                case 'newMovementView':
                    await this._initializeNewMovementView();
                    break;
            }

            this.state.setCurrentView(viewName);
            console.log('View erfolgreich gewechselt zu:', viewName);
        } catch (error) {
            console.error('Fehler beim View-Wechsel:', error);
            ErrorHandler.handle(error, 'Fehler beim Anzeigen der View');
        }
    }

    /**
     * Initialisiert die Ansicht für neue Bewegungen
     * @private
     */
    async _initializeNewMovementView() {
        try {
            await Promise.all([
                this.updateFormSelects(),
                this._resetFormState()
            ]);
        } catch (error) {
            ErrorHandler.handle(error, 'Fehler beim Initialisieren der Buchungsmaske');
        }
    }

    /**
     * Setzt den Formularstatus zurück
     * @private
     */
    _resetFormState() {
        this.elements.form.newMovement?.reset();
        this.elements.form.targetLocationGroup.style.display = 'none';
        this.elements.form.targetLocation.required = false;
        this.isSubmitting = false;
    }

    /**
     * Aktualisiert die Filteroptionen
     * @private
     */
    async _updateFilterOptions() {
        try {
            const { locations, types, articles } = this.state.references;
            await Promise.all([
                this._updateFilterSelect('location', locations),
                this._updateFilterSelect('type', types),
                this._updateFilterSelect('article', articles)
            ]);
        } catch (error) {
            ErrorHandler.handle(error, 'Fehler beim Aktualisieren der Filter');
        }
    }

    /**
     * Aktualisiert eine einzelne Filter-Select-Box
     * @private
     */
    _updateFilterSelect(type, items) {
        const select = this.elements.filters[type];
        if (!select) return;

        const fragment = document.createDocumentFragment();
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = `Alle ${type === 'location' ? 'Lagerorte' : type === 'type' ? 'Bewegungstypen' : 'Artikel'}...`;
        fragment.appendChild(defaultOption);

        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.id} - ${item.name}`;
            fragment.appendChild(option);
        });

        select.innerHTML = '';
        select.appendChild(fragment);
    }

    updateFormSelects() {
        const { locations, types, articles } = this.state.references;
        
        // Lagerorte
        this.populateSelect(this.elements.form.location, locations);
        this.populateSelect(this.elements.form.targetLocation, locations);
        
        // Bewegungstypen
        this.populateSelect(this.elements.form.type, types);
        
        // Artikel
        this.populateSelect(this.elements.form.article, articles);
    }

    updateFilterSelects() {
        const { locations, types, articles } = this.state.references;
        
        // Lagerorte
        this.populateFilterSelect(this.elements.filters.location, locations, 'Alle Lagerorte...');
        
        // Bewegungstypen
        this.populateFilterSelect(this.elements.filters.type, types, 'Alle Bewegungstypen...');
        
        // Artikel
        this.populateFilterSelect(this.elements.filters.article, articles, 'Alle Artikel...');
    }

    populateSelect(select, items, defaultText = 'Bitte wählen...') {
        if (!select) return;
        
        select.innerHTML = `<option value="">${defaultText}</option>`;
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.id} - ${item.name}`;
            select.appendChild(option);
        });
    }

    populateFilterSelect(select, items, defaultText) {
        this.populateSelect(select, items, defaultText);
    }

    /**
     * Behandelt Änderungen am Bewegungstyp
     */
    handleMovementTypeChange() {
        try {
            console.log('Bewegungstyp geändert');
            
            const typeId = this.elements.form.type?.value;
            if (!typeId) {
                console.log('Kein Bewegungstyp ausgewählt');
                return;
            }

            console.log('Prüfe Doppelbuchung für Typ:', typeId);
            const requiresDoubleBooking = this.state.requiresDoubleBooking(typeId);
            console.log('Erfordert Doppelbuchung:', requiresDoubleBooking);

            const targetGroup = this.elements.form.targetLocationGroup;
            const targetSelect = this.elements.form.targetLocation;

            if (!targetGroup || !targetSelect) {
                console.error('Ziel-Lagerort Elemente nicht gefunden');
                return;
            }

            if (requiresDoubleBooking) {
                targetGroup.style.display = 'block';
                targetSelect.required = true;
                console.log('Ziel-Lagerort aktiviert');
            } else {
                targetGroup.style.display = 'none';
                targetSelect.required = false;
                targetSelect.value = '';
                console.log('Ziel-Lagerort deaktiviert');
            }
        } catch (error) {
            console.error('Fehler bei Bewegungstyp-Änderung:', error);
            ErrorHandler.handle(error, 'Fehler bei der Aktualisierung des Formulars');
        }
    }

    handleFilterChange() {
        const newFilters = {
            location: this.elements.filters.location.value,
            type: this.elements.filters.type.value,
            article: this.elements.filters.article.value,
            dateFrom: this.elements.filters.dateFrom.value,
            dateTo: this.elements.filters.dateTo.value
        };
        
        this.state.updateFilters(newFilters);
    }

    resetFilters() {
        // Reset Filter-Felder
        Object.values(this.elements.filters).forEach(filter => {
            if (filter?.tagName === 'SELECT' || filter?.type === 'date') {
                filter.value = '';
            }
        });
        
        this.state.resetFilters();
    }

    /**
     * Behandelt die Navigation zwischen den Seiten
     * @param {number} direction - Richtung der Navigation (-1 für zurück, 1 für vor)
     */
    handlePageNavigation(direction) {
        console.log('Seitennavigation:', {
            aktuelle_seite: this.state.pagination.currentPage,
            richtung: direction,
            neue_seite: this.state.pagination.currentPage + direction
        });
        
        const newPage = this.state.pagination.currentPage + direction;
        const maxPages = this.state.pagination.totalPages;
        
        if (newPage < 1 || newPage > maxPages) {
            console.log('Ungültige Seitenzahl:', newPage);
            return;
        }
        
        // Verwende die Server-Paginierung
        this.state.updatePagination(newPage);
    }

    /**
     * Behandelt Änderungen der Einträge pro Seite
     * @param {Event} e - Das Change-Event
     */
    handleEntriesPerPageChange(e) {
        console.log('Einträge pro Seite ändern:', {
            alter_wert: this.state.pagination.entriesPerPage,
            neuer_wert: e.target.value
        });
        
        const newValue = parseInt(e.target.value);
        if (isNaN(newValue) || newValue < 1) {
            ErrorHandler.handleValidation('Ungültige Anzahl von Einträgen');
            return;
        }
        
        // Verwende die Server-Paginierung
        this.state.updateEntriesPerPage(newValue);
    }

    /**
     * Aktualisiert die Bewegungstabelle mit optimierter Rendering-Performance
     */
    updateMovementsTable() {
        if (!this.elements.tables.movementsBody) return;
        
        const fragment = document.createDocumentFragment();
        
        this.state.filteredMovements.forEach(movement => {
            let row = this._tableRowCache.get(movement);
            
            if (!row) {
                row = document.createElement('tr');
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
                this._tableRowCache.set(movement, row.cloneNode(true));
            } else {
                row = row.cloneNode(true);
            }
            
            fragment.appendChild(row);
        });

        // Batch-Update des DOM
        this.elements.tables.movementsBody.innerHTML = '';
        this.elements.tables.movementsBody.appendChild(fragment);
        
        // Aktualisiere die Paginierung
        this.updatePagination();
    }

    /**
     * Aktualisiert die Bestandstabelle mit optimierter Performance
     */
    updateInventoryTable(items) {
        if (!this.elements.tables.inventoryBody) return;
        
        const fragment = document.createDocumentFragment();
        
        items.forEach(item => {
            const row = document.createElement('tr');
            const stockStatusClass = this.getStockStatusClass(item.stockStatus);
            
            row.innerHTML = `
                <td>${item.id}</td>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td class="${stockStatusClass}" title="${this.getStockStatusMessage(item)}">
                    ${item.stock} ${item.unit}
                </td>
                <td>${item.minStock} ${item.unit}</td>
                <td>${item.unit}</td>
                <td>${item.averageConsumption.toFixed(2)} ${item.unit}/Tag</td>
                <td>${this.formatLastMovement(item.lastMovement)}</td>
            `;
            
            fragment.appendChild(row);
        });

        // Batch-Update des DOM
        this.elements.tables.inventoryBody.innerHTML = '';
        this.elements.tables.inventoryBody.appendChild(fragment);
    }

    getStockStatusClass(status) {
        switch (status) {
            case 'kritisch': return 'stock-critical';
            case 'warnung': return 'stock-warning';
            default: return 'stock-normal';
        }
    }

    getStockStatusMessage(item) {
        const daysUntilEmpty = item.stock / item.averageConsumption;
        
        switch (item.stockStatus) {
            case 'kritisch':
                return `Kritischer Bestand! Voraussichtlich noch ${Math.ceil(daysUntilEmpty)} Tage ausreichend.`;
            case 'warnung':
                return `Niedriger Bestand! Nachbestellung empfohlen.`;
            default:
                return '';
        }
    }

    formatLastMovement(movement) {
        if (!movement) return 'Keine Bewegungen';
        
        const date = new Date(movement.timestamp);
        const formattedDate = date.toLocaleDateString('de-DE');
        const formattedTime = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        
        return `${formattedDate} ${formattedTime} (${movement.transaktionsmenge})`;
    }

    updatePagination() {
        const { currentPage, totalPages } = this.state.pagination;
        
        console.log('Aktualisiere Paginierung:', {
            currentPage,
            totalPages
        });
        
        if (this.elements.navigation.currentPage) {
            this.elements.navigation.currentPage.textContent = currentPage;
        }
        if (this.elements.navigation.totalPages) {
            this.elements.navigation.totalPages.textContent = totalPages;
        }
        if (this.elements.navigation.prevPage) {
            this.elements.navigation.prevPage.disabled = currentPage <= 1;
        }
        if (this.elements.navigation.nextPage) {
            this.elements.navigation.nextPage.disabled = currentPage >= totalPages;
        }
    }
}

// Exportiere die Klasse für Module-Support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InventoryUI;
} 