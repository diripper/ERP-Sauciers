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
            apply: document.getElementById('applyFilters'),
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

        // Filter Events
        const filterElements = {
            location: this.elements.filters.location,
            type: this.elements.filters.type,
            article: this.elements.filters.article,
            dateFrom: this.elements.filters.dateFrom,
            dateTo: this.elements.filters.dateTo
        };

        // Event-Listener für Filter-Änderungen - nur Werte speichern
        Object.entries(filterElements).forEach(([key, element]) => {
            if (element) {
                element.addEventListener('change', (e) => {
                    e.preventDefault(); // Verhindere Standard-Event
                    const value = element.value;
                    // Speichere nur den Wert, ohne Neuladen oder Events
                    this.state.filters[key] = value;
                });
            }
        });

        // Filter anwenden Button
        if (this.elements.filters.apply) {
            this.elements.filters.apply.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    this._setFilterLoading(true);
                    console.log('Filter werden angewendet:', this.state.filters);
                    this.state.pagination.currentPage = 1;
                    await this.state.loadMovements();
                    this._updateFilterUI();
                } catch (error) {
                    ErrorHandler.handle(error, 'Fehler beim Anwenden der Filter');
                } finally {
                    this._setFilterLoading(false);
                }
            });
        }

        // Filter zurücksetzen Button
        if (this.elements.filters.reset) {
            this.elements.filters.reset.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    this._setFilterLoading(true);
                    console.log('Filter werden zurückgesetzt');
                    Object.values(this.elements.filters).forEach(element => {
                        if (element && element.tagName !== 'BUTTON') {
                            element.value = '';
                        }
                    });
                    
                    Object.keys(this.state.filters).forEach(key => {
                        this.state.filters[key] = '';
                    });
                    
                    this.state.pagination.currentPage = 1;
                    await this.state.loadMovements();
                    this._updateFilterUI();
                } catch (error) {
                    ErrorHandler.handle(error, 'Fehler beim Zurücksetzen der Filter');
                } finally {
                    this._setFilterLoading(false);
                }
            });
        }

        // Paginierungs-Events
        if (this.elements.navigation.prevPage) {
            this.elements.navigation.prevPage.addEventListener('click', (e) => {
                e.preventDefault(); // Verhindere Standard-Event
                this.handlePageNavigation(-1);
            });
        }
        
        if (this.elements.navigation.nextPage) {
            this.elements.navigation.nextPage.addEventListener('click', (e) => {
                e.preventDefault(); // Verhindere Standard-Event
                this.handlePageNavigation(1);
            });
        }

        // Einträge pro Seite
        if (this.elements.filters.entriesPerPage) {
            this.elements.filters.entriesPerPage.addEventListener('change', (e) => {
                e.preventDefault(); // Verhindere Standard-Event
                this.handleEntriesPerPageChange(e);
            });
        }
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

    /**
     * Behandelt die Navigation zwischen den Seiten
     * @param {number} direction - Richtung der Navigation (-1 für zurück, 1 für vor)
     */
    async handlePageNavigation(direction) {
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
        
        try {
            // Verwende die Server-Paginierung
            await this.state.updatePagination(newPage);
        } catch (error) {
            ErrorHandler.handle(error, 'Fehler bei der Seitennavigation');
        }
    }

    /**
     * Behandelt Änderungen der Einträge pro Seite
     * @param {Event} e - Das Change-Event
     */
    async handleEntriesPerPageChange(e) {
        console.log('Einträge pro Seite ändern:', {
            alter_wert: this.state.pagination.entriesPerPage,
            neuer_wert: e.target.value
        });
        
        const newValue = parseInt(e.target.value);
        if (isNaN(newValue) || newValue < 1) {
            ErrorHandler.handleValidation('Ungültige Anzahl von Einträgen');
            return;
        }
        
        try {
            // Verwende die Server-Paginierung
            await this.state.updateEntriesPerPage(newValue);
        } catch (error) {
            ErrorHandler.handle(error, 'Fehler beim Ändern der Einträge pro Seite');
        }
    }

    /**
     * Aktualisiert die Bewegungstabelle mit optimierter Performance
     */
    updateMovementsTable() {
        if (!this.elements.tables.movementsBody || !this.state.movements) return;
        
        console.log('Aktualisiere Bewegungstabelle:', {
            anzahlBewegungen: this.state.movements.length,
            filter: this.state.filters
        });

        // Erstelle DocumentFragment für bessere Performance
        const fragment = document.createDocumentFragment();
        
        // Wiederverwendbare Funktion für Zellenerstellung
        const createCell = (content) => {
            const cell = document.createElement('td');
            cell.textContent = content;
            return cell;
        };

        // Erstelle einen Pool von wiederverwendbaren Zeilen
        if (!this._rowPool) {
            this._rowPool = [];
        }

        // Berechne die benötigte Anzahl neuer Zeilen
        const existingRows = this._rowPool.length;
        const neededRows = this.state.movements.length;
        
        // Erstelle neue Zeilen wenn nötig
        if (existingRows < neededRows) {
            for (let i = existingRows; i < neededRows; i++) {
                const row = document.createElement('tr');
                for (let j = 0; j < 11; j++) { // 11 Spalten
                    row.appendChild(document.createElement('td'));
                }
                this._rowPool.push(row);
            }
        }

        // Aktualisiere und füge die Zeilen hinzu
        this.state.movements.forEach((movement, index) => {
            const row = this._rowPool[index];
            const cells = row.children;
            
            // Aktualisiere nur geänderte Zellen
            this._updateCellIfChanged(cells[0], movement.datum);
            this._updateCellIfChanged(cells[1], movement.mitarbeiter);
            this._updateCellIfChanged(cells[2], movement.lagerort_id);
            this._updateCellIfChanged(cells[3], movement.lagerort);
            this._updateCellIfChanged(cells[4], movement.typ_id);
            this._updateCellIfChanged(cells[5], movement.trans_typ);
            this._updateCellIfChanged(cells[6], movement.artikel_id);
            this._updateCellIfChanged(cells[7], movement.artikel);
            this._updateCellIfChanged(cells[8], movement.transaktionsmenge);
            this._updateCellIfChanged(cells[9], movement.bestand_lo);
            this._updateCellIfChanged(cells[10], movement.buchungstext);
            
            fragment.appendChild(row);
        });

        // Batch-Update des DOM
        requestAnimationFrame(() => {
            this.elements.tables.movementsBody.innerHTML = '';
            this.elements.tables.movementsBody.appendChild(fragment);
        });
    }

    /**
     * Aktualisiert eine Zelle nur wenn sich der Inhalt geändert hat
     * @private
     */
    _updateCellIfChanged(cell, newContent) {
        const currentContent = cell.textContent;
        if (currentContent !== String(newContent)) {
            cell.textContent = newContent;
        }
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

    /**
     * Aktualisiert die Paginierung mit optimierter Performance
     */
    updatePagination() {
        const { currentPage, totalPages } = this.state.pagination;
        
        // Batch-Update der Paginierung
        requestAnimationFrame(() => {
            if (this.elements.navigation.currentPage) {
                this._updateTextContentIfChanged(
                    this.elements.navigation.currentPage,
                    currentPage
                );
            }
            
            if (this.elements.navigation.totalPages) {
                this._updateTextContentIfChanged(
                    this.elements.navigation.totalPages,
                    totalPages
                );
            }
            
            if (this.elements.navigation.prevPage) {
                const shouldBeDisabled = currentPage <= 1;
                if (this.elements.navigation.prevPage.disabled !== shouldBeDisabled) {
                    this.elements.navigation.prevPage.disabled = shouldBeDisabled;
                }
            }
            
            if (this.elements.navigation.nextPage) {
                const shouldBeDisabled = currentPage >= totalPages;
                if (this.elements.navigation.nextPage.disabled !== shouldBeDisabled) {
                    this.elements.navigation.nextPage.disabled = shouldBeDisabled;
                }
            }
        });
    }

    /**
     * Aktualisiert den Textinhalt eines Elements nur wenn nötig
     * @private
     */
    _updateTextContentIfChanged(element, newContent) {
        const currentContent = element.textContent;
        if (currentContent !== String(newContent)) {
            element.textContent = newContent;
        }
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

        eventBus.on('movementsLoaded', (movements) => {
            this.updateMovementsTable();
            this.updatePagination();
        });

        eventBus.on('movementCreated', () => {
            this.showView('inventoryMovementsView');
            this.state.loadMovements();
        });
    }

    /**
     * Aktualisiert die Filter-UI
     * @private
     */
    _updateFilterUI() {
        // Aktualisiere die Filter-Zusammenfassung
        const summary = document.querySelector('.filter-summary');
        if (!summary) return;

        // Lösche bisherige Filter-Tags
        summary.innerHTML = '';

        // Prüfe ob Filter aktiv sind
        const activeFilters = Object.entries(this.state.filters).filter(([_, value]) => value);

        if (activeFilters.length === 0) {
            summary.innerHTML = '<div class="no-filters">Keine Filter aktiv</div>';
            return;
        }

        // Erstelle Filter-Tags für aktive Filter
        activeFilters.forEach(([key, value]) => {
            const tag = document.createElement('div');
            tag.className = 'filter-tag';
            
            // Bestimme den Anzeigetext basierend auf dem Filter-Typ
            let displayText = '';
            switch(key) {
                case 'location':
                    const location = this.state.references.locations.find(l => l.id === value);
                    displayText = `Lagerort: ${location ? location.name : value}`;
                    break;
                case 'type':
                    const type = this.state.references.types.find(t => t.id === value);
                    displayText = `Typ: ${type ? type.name : value}`;
                    break;
                case 'article':
                    const article = this.state.references.articles.find(a => a.id === value);
                    displayText = `Artikel: ${article ? article.name : value}`;
                    break;
                case 'dateFrom':
                    displayText = `Von: ${value}`;
                    break;
                case 'dateTo':
                    displayText = `Bis: ${value}`;
                    break;
            }
            
            tag.innerHTML = `
                ${displayText}
                <span class="remove-filter" data-filter="${key}">×</span>
            `;
            
            // Event-Listener für das Entfernen des Filters
            const removeBtn = tag.querySelector('.remove-filter');
            removeBtn.addEventListener('click', () => this._removeFilter(key));
            
            summary.appendChild(tag);
        });

        // Aktualisiere die visuellen Zustände der Filter-Selektionen
        Object.entries(this.elements.filters).forEach(([key, element]) => {
            if (element && element.tagName === 'SELECT') {
                element.classList.toggle('active-filter', !!this.state.filters[key]);
            }
        });
    }

    /**
     * Entfernt einen einzelnen Filter
     * @private
     */
    async _removeFilter(filterKey) {
        // Setze den Filter zurück
        this.state.filters[filterKey] = '';
        
        // Setze das entsprechende UI-Element zurück
        if (this.elements.filters[filterKey]) {
            this.elements.filters[filterKey].value = '';
        }
        
        // Aktualisiere die Anzeige
        this.state.pagination.currentPage = 1;
        await this.state.loadMovements();
        this._updateFilterUI();
    }

    /**
     * Setzt den Lade-Zustand der Filter
     * @private
     */
    _setFilterLoading(isLoading) {
        const filterControls = document.querySelector('.filter-controls');
        if (!filterControls) return;

        filterControls.classList.toggle('loading', isLoading);
        
        // Deaktiviere/Aktiviere alle Filter-Elemente
        Object.values(this.elements.filters).forEach(element => {
            if (element) {
                element.disabled = isLoading;
            }
        });
    }
}

// Exportiere die Klasse für Module-Support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InventoryUI;
} 