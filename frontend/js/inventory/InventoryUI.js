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
        const inventoryListView = document.getElementById('inventoryListView');
        const inventoryMovementsView = document.getElementById('inventoryMovementsView');
        const newMovementView = document.getElementById('newMovementView');
        
        console.log('Überprüfe Inventory-Container-Elemente:', {
            inventoryListView: inventoryListView ? 'gefunden' : 'NICHT GEFUNDEN!', 
            inventoryMovementsView: inventoryMovementsView ? 'gefunden' : 'NICHT GEFUNDEN!', 
            newMovementView: newMovementView ? 'gefunden' : 'NICHT GEFUNDEN!'
        });
        
        if (!inventoryListView || !inventoryMovementsView || !newMovementView) {
            console.error('KRITISCHER FEHLER: Container-Elemente nicht gefunden!', {
                'inventoryListView Element existiert': !!document.getElementById('inventoryListView'),
                'inventoryMovementsView Element existiert': !!document.getElementById('inventoryMovementsView'),
                'newMovementView Element existiert': !!document.getElementById('newMovementView')
            });
            
            // Prüfe auch ob die Elemente über andere Selektoren gefunden werden können
            console.log('Versuch mit alternativen Selektoren:', {
                'div.inventory-view': document.querySelectorAll('div.inventory-view').length,
                'div im inventory-content': document.querySelectorAll('#inventoryContent > div').length,
                'Alle DIVs mit ID': Array.from(document.querySelectorAll('div[id]')).map(el => el.id)
            });
        }
        
        this.elements.container = {
            'inventoryListView': inventoryListView,
            'inventoryMovementsView': inventoryMovementsView,
            'newMovementView': newMovementView
        };

        // Debug-Logging für Container-Initialisierung
        console.log('Container-Initialisierung:', {
            inventoryListView: !!this.elements.container.inventoryListView,
            inventoryMovementsView: !!this.elements.container.inventoryMovementsView,
            newMovementView: !!this.elements.container.newMovementView
        });

        // Tabellen
        this.elements.tables = {
            inventoryBody: document.querySelector('#inventoryTable tbody'),
            inventoryHead: document.querySelector('#inventoryTable thead tr'),
            movementsBody: document.querySelector('#movementsTable tbody')
        };

        // Filter für Bewegungen
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

        // Filter für Bestandsübersicht
        this.elements.stockFilters = {
            location: document.getElementById('stockLocationFilter'),
            article: document.getElementById('stockArticleFilter'),
            apply: document.getElementById('applyStockFilters'),
            reset: document.getElementById('resetStockFilters'),
            entriesPerPage: document.getElementById('stockEntriesPerPage'),
            filterSummary: document.getElementById('stockFilterSummary')
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

        // Navigation für Bestandsübersicht
        this.elements.stockNavigation = {
            prevPage: document.getElementById('prevStockPage'),
            nextPage: document.getElementById('nextStockPage'),
            currentPage: document.getElementById('currentStockPage'),
            totalPages: document.getElementById('totalStockPages')
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
        console.log('Binde Navigation-Events...');
        // Navigation Events mit Error Handling
        const navigationMapping = {
            'showList': 'inventoryListView',
            'showMovements': 'inventoryMovementsView',
            'showNewMovement': 'newMovementView'
        };

        // Prüfe, ob alle Navigations-Elemente vorhanden sind
        console.log('Navigations-Elemente:', {
            showList: !!this.elements.navigation.showList,
            showMovements: !!this.elements.navigation.showMovements,
            showNewMovement: !!this.elements.navigation.showNewMovement
        });

        // Binde Events separat, um besser debugging zu ermöglichen
        if (this.elements.navigation.showList) {
            console.log('Binde Event für showList');
            this.elements.navigation.showList.addEventListener('click', () => {
                console.log('showList wurde geklickt');
                try {
                    this.showView('inventoryListView');
                } catch (error) {
                    ErrorHandler.handle(error, 'Fehler beim Anzeigen von inventoryListView');
                }
            });
        } else {
            console.error('Navigation-Element showList nicht gefunden!');
        }

        if (this.elements.navigation.showMovements) {
            console.log('Binde Event für showMovements');
            this.elements.navigation.showMovements.addEventListener('click', () => {
                console.log('showMovements wurde geklickt');
                try {
                    this.showView('inventoryMovementsView');
                } catch (error) {
                    ErrorHandler.handle(error, 'Fehler beim Anzeigen von inventoryMovementsView');
                }
            });
        } else {
            console.error('Navigation-Element showMovements nicht gefunden!');
        }

        if (this.elements.navigation.showNewMovement) {
            console.log('Binde Event für showNewMovement');
            this.elements.navigation.showNewMovement.addEventListener('click', () => {
                console.log('showNewMovement wurde geklickt');
                try {
                    this.showView('newMovementView');
                } catch (error) {
                    ErrorHandler.handle(error, 'Fehler beim Anzeigen von newMovementView');
                }
            });
        } else {
            console.error('Navigation-Element showNewMovement nicht gefunden!');
        }

        // Filter Events für Bewegungen
        const filterElements = {
            location: this.elements.filters.location,
            type: this.elements.filters.type,
            article: this.elements.filters.article,
            dateFrom: this.elements.filters.dateFrom,
            dateTo: this.elements.filters.dateTo
        };

        // Event-Listener für Filter-Änderungen (Bewegungen)
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

        // Filter-Events für Bestandsübersicht
        const stockFilterElements = {
            location: this.elements.stockFilters.location,
            article: this.elements.stockFilters.article
        };

        // Event-Listener für Filter-Änderungen (Bestandsübersicht)
        Object.entries(stockFilterElements).forEach(([key, element]) => {
            if (element) {
                element.addEventListener('change', (e) => {
                    e.preventDefault();
                    const value = element.value;
                    // Speichere nur den Wert, ohne Neuladen oder Events
                    this.state.stockFilters[key] = value;
                });
            }
        });

        // Filter anwenden Button für Bewegungen
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

        // Filter anwenden Button für Bestandsübersicht
        if (this.elements.stockFilters.apply) {
            this.elements.stockFilters.apply.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    this._setStockFilterLoading(true);
                    console.log('Stock-Filter werden angewendet:', this.state.stockFilters);
                    this.state.stockPagination.currentPage = 1;
                    this.state._forceStockReload = true; // Erzwinge Neuladen der Daten
                    await this.state.loadStockItems();
                    this.updateInventoryTable(); // Aktualisiere die Tabelle mit neuen Daten
                    this.updateStockPagination(); // Aktualisiere Paginierung
                    this._updateStockFilterUI();
                } catch (error) {
                    ErrorHandler.handle(error, 'Fehler beim Anwenden der Filter');
                } finally {
                    this._setStockFilterLoading(false);
                }
            });
        }

        // Filter zurücksetzen Button für Bewegungen
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

        // Filter zurücksetzen Button für Bestandsübersicht
        if (this.elements.stockFilters.reset) {
            this.elements.stockFilters.reset.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    this._setStockFilterLoading(true);
                    console.log('Stock-Filter werden zurückgesetzt');
                    
                    // Setze Filter-Elemente zurück
                    Object.entries(this.elements.stockFilters).forEach(([key, element]) => {
                        if (element && element.tagName === 'SELECT') {
                            element.value = '';
                        }
                    });
                    
                    // Setze Filter-State zurück
                    Object.keys(this.state.stockFilters).forEach(key => {
                        this.state.stockFilters[key] = '';
                    });
                    
                    this.state.stockPagination.currentPage = 1;
                    await this.state.loadStockItems();
                    this._updateStockFilterUI();
                } catch (error) {
                    ErrorHandler.handle(error, 'Fehler beim Zurücksetzen der Filter');
                } finally {
                    this._setStockFilterLoading(false);
                }
            });
        }

        // Paginierungs-Events für Bewegungen
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

        // Paginierungs-Events für Bestandsübersicht
        if (this.elements.stockNavigation.prevPage) {
            this.elements.stockNavigation.prevPage.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleStockPageNavigation(-1);
            });
        }
        
        if (this.elements.stockNavigation.nextPage) {
            this.elements.stockNavigation.nextPage.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleStockPageNavigation(1);
            });
        }

        // Einträge pro Seite für Bewegungen
        if (this.elements.filters.entriesPerPage) {
            this.elements.filters.entriesPerPage.addEventListener('change', (e) => {
                e.preventDefault(); // Verhindere Standard-Event
                this.handleEntriesPerPageChange(e);
            });
        }

        // Einträge pro Seite für Bestandsübersicht
        if (this.elements.stockFilters.entriesPerPage) {
            this.elements.stockFilters.entriesPerPage.addEventListener('change', (e) => {
                e.preventDefault();
                this.handleStockEntriesPerPageChange(e);
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
        try {
            console.log('Starte Verarbeitung der erfolgreichen Buchung...');
            
            // Warte erst 3 Sekunden, damit die Daten im Backend/Google Sheet gespeichert werden können
            console.log('Warte 3 Sekunden auf Speicherung im Google Sheet...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Setze die Seite auf 1 zurück, da neue Einträge am Anfang erscheinen
            this.state.pagination.currentPage = 1;
            
            // Invalidiere den Cache und erzwinge Neuladen
            console.log('Invalidiere Caches und erzwinge Neuladen...');
            this.state._invalidateCache();
            this.state._invalidateStockCache(); // Auch den Stock-Cache zurücksetzen
            this.service._invalidateAllCaches();
            
            // Setze _forceReload explizit auf true
            this.state._forceReload = true;
            
            // Setze alle Filter zurück
            Object.keys(this.state.filters).forEach(key => {
                this.state.filters[key] = '';
                if (this.elements.filters[key]) {
                    this.elements.filters[key].value = '';
                }
            });
            
            // Wechsle zur Bewegungsansicht
            console.log('Wechsle zur Bewegungsübersicht...');
            await this.showView('inventoryMovementsView');
            
            console.log('Erfolgreich verarbeitet und Ansicht aktualisiert');
        } catch (error) {
            console.error('Fehler bei der Verarbeitung der erfolgreichen Buchung:', error);
            ErrorHandler.handle(error, 'Fehler beim Wechseln zur Bewegungsansicht');
        }
    }

    /**
     * Zeigt eine bestimmte Ansicht an
     * @param {string} viewName - Name der anzuzeigenden Ansicht
     */
    async showView(viewName) {
        try {
            console.log(`Wechsle zur Ansicht: ${viewName}`);
            
            // Verstecke alle Ansichten
            Object.values(this.elements.container).forEach(container => {
                if (container) {
                    container.classList.add('hidden');
                }
            });
            
            // Prüfe, ob die angeforderte Ansicht existiert
            if (!this.elements.container[viewName]) {
                console.error('Container nicht gefunden:', {
                    viewName,
                    container: this.elements.container[viewName],
                    allContainers: this.elements.container
                });
                throw new Error(`Ansicht ${viewName} nicht gefunden`);
            }
            
            // Zeige die angeforderte Ansicht
            this.elements.container[viewName].classList.remove('hidden');
            
            // Aktualisiere den State
            this.state.setCurrentView(viewName);
            
            // Lade die notwendigen Daten je nach Ansicht
            switch (viewName) {
                case 'inventoryListView':
                    console.log('Initialisiere Bestandsübersicht...');
                    await this._initializeInventoryListView();
                    break;
                case 'inventoryMovementsView':
                    console.log('Initialisiere Bewegungsansicht...');
                    this.state._forceReload = true; // Erzwinge Neuladen der Daten
                    await this.state.loadMovements();
                    this.updateMovementsTable();
                    this.updatePagination();
                    this._updateFilterUI();
                    break;
                case 'newMovementView':
                    console.log('Initialisiere Buchungsansicht...');
                    await this._initializeNewMovementView();
                    break;
                default:
                    console.warn(`Unbekannte Ansicht: ${viewName}`);
            }
        } catch (error) {
            console.error(`Fehler beim Wechseln zur Ansicht ${viewName}:`, error);
            ErrorHandler.handle(error, `Fehler beim Wechseln zur Ansicht ${viewName}`);
        }
    }

    /**
     * Initialisiert die Bestandsübersicht
     * @private
     */
    async _initializeInventoryListView() {
        try {
            console.log('Lade Bestandsübersicht...');
            
            // Stelle sicher, dass die Referenzdaten geladen sind
            if (!this.state.references.locations.length || !this.state.references.articles.length) {
                console.log('Lade Referenzdaten für Bestandsübersicht...');
                await this.state.loadReferences();
            }
            
            // Initialisiere Filter-Selects mit aktuellen Referenzdaten
            console.log('Aktualisiere Filter-Optionen für Bestandsübersicht...');
            await this.updateStockFilterSelects();
            
            // Lade initiale Daten
            console.log('Lade Bestandsdaten...');
            this.state._forceStockReload = true; // Erzwinge Neuladen
            await this.state.loadStockItems();
            
            // Aktualisiere die Tabelle
            console.log('Aktualisiere Bestandstabelle...');
            this.updateInventoryTable();
            
            // Aktualisiere Pagination
            this.updateStockPagination();
            
            // Aktualisiere Filter UI
            this._updateStockFilterUI();
            
            console.log('Bestandsübersicht initialisiert');
        } catch (error) {
            console.error('Fehler bei der Initialisierung der Bestandsübersicht:', error);
            ErrorHandler.handle(error, 'Fehler beim Laden der Bestandsübersicht');
        }
    }

    /**
     * Aktualisiert die Selects für die Bestandsübersicht-Filter
     */
    async updateStockFilterSelects() {
        try {
            console.log('Populating stock filter selects with references:', this.state.references);
            
            const locationSelect = this.elements.stockFilters.location;
            const articleSelect = this.elements.stockFilters.article;
            
            // Debugging für DOM-Elemente
            console.log('Filter DOM Elements:', {
                locationSelect: locationSelect ? 'Found' : 'Not found',
                articleSelect: articleSelect ? 'Found' : 'Not found'
            });
            
            if (locationSelect) {
                console.log('Befülle Lagerort-Filter mit Daten:', this.state.references.locations);
                this.populateFilterSelect(
                    locationSelect, 
                    this.state.references.locations,
                    'Alle Lagerorte'
                );
                console.log('Lagerort-Filter wurde aktualisiert');
            }
            
            if (articleSelect) {
                console.log('Befülle Artikel-Filter mit Daten:', this.state.references.articles);
                this.populateFilterSelect(
                    articleSelect, 
                    this.state.references.articles,
                    'Alle Artikel'
                );
                console.log('Artikel-Filter wurde aktualisiert');
            }
        } catch (error) {
            console.error('Fehler beim Aktualisieren der Filter-Selects:', error);
            ErrorHandler.handle(error, 'Fehler beim Aktualisieren der Filter');
        }
    }

    /**
     * Behandelt die Seitennavigation für die Bestandsübersicht
     */
    async handleStockPageNavigation(direction) {
        try {
            const newPage = this.state.stockPagination.currentPage + direction;
            const maxPage = this.state.stockPagination.totalPages;
            
            console.log(`Seitennavigation: ${newPage} / ${maxPage}`);
            
            if (newPage >= 1 && newPage <= maxPage) {
                this._setStockFilterLoading(true);
                await this.state.updateStockPagination(newPage);
                this.updateInventoryTable();
                this.updateStockPagination();
                this._setStockFilterLoading(false);
            }
        } catch (error) {
            this._setStockFilterLoading(false);
            ErrorHandler.handle(error, 'Fehler bei der Seitennavigation');
        }
    }

    /**
     * Behandelt die Änderung der Einträge pro Seite für die Bestandsübersicht
     */
    async handleStockEntriesPerPageChange(e) {
        try {
            const entriesPerPage = e.target.value;
            console.log(`Einträge pro Seite geändert auf: ${entriesPerPage}`);
            
            if (entriesPerPage) {
                this._setStockFilterLoading(true);
                await this.state.updateStockEntriesPerPage(entriesPerPage);
                this.updateInventoryTable();
                this.updateStockPagination();
                this._setStockFilterLoading(false);
            }
        } catch (error) {
            this._setStockFilterLoading(false);
            ErrorHandler.handle(error, 'Fehler bei der Änderung der Einträge pro Seite');
        }
    }

    /**
     * Aktualisiert die Bestandsübersichtstabelle mit übergebenen Items
     */
    updateInventoryTable(items) {
        if (!this.elements.tables.inventoryBody) return;
        
        const tableBody = this.elements.tables.inventoryBody;
        const tableHead = this.elements.tables.inventoryHead;
        
        try {
            // Verwende entweder die übergebenen Items oder die vom State
            const stockItems = items || this.state.stockItems || [];
            
            console.log('Aktualisiere Inventartabelle mit Daten:', {
                headers: this.state.stockHeaders,
                items: stockItems.length
            });
            
            // Tabellenkopf aktualisieren
            if (tableHead) {
                tableHead.innerHTML = '';
                
                if (!this.state.stockHeaders || this.state.stockHeaders.length === 0) {
                    console.warn('Keine Tabellenüberschriften gefunden, verwende Standardüberschriften');
                    const defaultHeaders = ['Artikel-ID', 'Artikel-Name', 'Bestand', 'Min-Bestand', 'Einheit', 'Status'];
                    defaultHeaders.forEach(header => {
                        const th = document.createElement('th');
                        th.textContent = header;
                        tableHead.appendChild(th);
                    });
                } else {
                    this.state.stockHeaders.forEach(header => {
                        const th = document.createElement('th');
                        th.textContent = header;
                        tableHead.appendChild(th);
                    });
                }
            }
            
            // Tabellenkörper aktualisieren
            tableBody.innerHTML = '';
            
            if (!stockItems || stockItems.length === 0) {
                console.warn('Keine Bestandsdaten gefunden');
                const row = tableBody.insertRow();
                const cell = row.insertCell();
                cell.colSpan = this.state.stockHeaders?.length || 5;
                cell.textContent = 'Keine Daten vorhanden';
                cell.style.textAlign = 'center';
                return;
            }
            
            // Debug-Ausgabe der Daten
            console.log('Bestandsdaten für Anzeige:', stockItems);
            
            const fragment = document.createDocumentFragment();
            
            // Erstelle die Tabellenzeilen
            stockItems.forEach(item => {
                const row = document.createElement('tr');
                
                // Bestimme Zeilenklasse basierend auf Bestandsstatus
                if (item._stockStatus || item.Status === 'warnung' || item.Status === 'kritisch') {
                    const statusClass = item._stockStatus || ('stock-' + item.Status);
                    row.classList.add(statusClass);
                    
                    if (item._statusMessage) {
                        row.setAttribute('title', item._statusMessage);
                    } else if (item.Status === 'warnung') {
                        row.setAttribute('title', 'Bestand unter Minimalbestand!');
                    } else if (item.Status === 'kritisch') {
                        row.setAttribute('title', 'Kritischer Bestand!');
                    }
                }
                
                // Füge alle Spalten hinzu
                if (this.state.stockHeaders && this.state.stockHeaders.length > 0) {
                    this.state.stockHeaders.forEach(header => {
                        const cell = document.createElement('td');
                        cell.textContent = item[header] || '';
                        row.appendChild(cell);
                    });
                } else {
                    // Fallback wenn keine Headers definiert sind
                    const defaultHeaders = ['Artikel-ID', 'Artikel-Name', 'Bestand', 'Min-Bestand', 'Einheit', 'Status'];
                    defaultHeaders.forEach(key => {
                        const cell = document.createElement('td');
                        // Versuche den Wert aus dem Item zu bekommen, auch wenn die Schlüssel nicht perfekt übereinstimmen
                        let value = '';
                        if (item[key]) {
                            value = item[key];
                        } else {
                            // Versuche ähnliche Schlüssel zu finden
                            const similarKeys = Object.keys(item).filter(itemKey => 
                                itemKey.toLowerCase().includes(key.toLowerCase().replace('-', ''))
                            );
                            if (similarKeys.length > 0) {
                                value = item[similarKeys[0]];
                            }
                        }
                        cell.textContent = value || '';
                        row.appendChild(cell);
                    });
                }
                
                fragment.appendChild(row);
            });
            
            // Batch-Update des DOM
            tableBody.appendChild(fragment);
            
            console.log('Bestandstabelle erfolgreich aktualisiert');
            
        } catch (error) {
            console.error('Fehler beim Aktualisieren der Bestandstabelle:', error);
            ErrorHandler.handle(error, 'Fehler beim Aktualisieren der Bestandstabelle');
        }
    }

    /**
     * Aktualisiert die Paginierung für die Bestandsübersicht
     */
    updateStockPagination() {
        const pagination = this.state.stockPagination;
        const prevButton = this.elements.stockNavigation.prevPage;
        const nextButton = this.elements.stockNavigation.nextPage;
        const currentPageElement = this.elements.stockNavigation.currentPage;
        const totalPagesElement = this.elements.stockNavigation.totalPages;
        
        if (!prevButton || !nextButton || !currentPageElement || !totalPagesElement) {
            return;
        }
        
        // Update text content
        this._updateTextContentIfChanged(currentPageElement, pagination.currentPage);
        this._updateTextContentIfChanged(totalPagesElement, pagination.totalPages);
        
        // Enable/disable buttons
        prevButton.disabled = pagination.currentPage <= 1;
        nextButton.disabled = pagination.currentPage >= pagination.totalPages;
    }

    /**
     * Aktualisiert die UI-Anzeige für die aktiven Filter der Bestandsübersicht
     * @private
     */
    _updateStockFilterUI() {
        const filterSummary = this.elements.stockFilters.filterSummary;
        if (!filterSummary) return;
        
        filterSummary.innerHTML = '';
        
        const filters = this.state.stockFilters;
        const activeFilters = Object.entries(filters).filter(([_, value]) => value);
        
        if (activeFilters.length === 0) {
            const noFilters = document.createElement('div');
            noFilters.className = 'no-filters';
            noFilters.textContent = 'Keine Filter aktiv';
            filterSummary.appendChild(noFilters);
            return;
        }
        
        // Helper für Filter-Tags
        const createFilterTag = (name, value, displayValue) => {
            const tag = document.createElement('div');
            tag.className = 'filter-tag';
            
            const label = document.createElement('span');
            label.textContent = `${name}: ${displayValue}`;
            tag.appendChild(label);
            
            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-filter';
            removeBtn.innerHTML = '&times;';
            removeBtn.setAttribute('data-filter', name.toLowerCase());
            removeBtn.addEventListener('click', () => this._removeStockFilter(name.toLowerCase()));
            tag.appendChild(removeBtn);
            
            return tag;
        };
        
        // Lagerort-Filter
        if (filters.location) {
            const locationName = this.service.getLocationName(filters.location) || filters.location;
            filterSummary.appendChild(createFilterTag('Lagerort', filters.location, locationName));
        }
        
        // Artikel-Filter
        if (filters.article) {
            const articleName = this.service.getArticleName(filters.article) || filters.article;
            filterSummary.appendChild(createFilterTag('Artikel', filters.article, articleName));
        }
    }

    /**
     * Entfernt einen Filter aus der Bestandsübersicht
     * @private
     */
    async _removeStockFilter(filterKey) {
        try {
            console.log(`Entferne Filter: ${filterKey}`);
            this._setStockFilterLoading(true);
            
            // Setze Filter zurück
            this.state.stockFilters[filterKey] = '';
            
            // Setze auch das entsprechende UI-Element zurück
            const select = this.elements.stockFilters[filterKey];
            if (select) {
                select.value = '';
            }
            
            // Zurück zu Seite 1
            this.state.stockPagination.currentPage = 1;
            
            // Lade Daten neu
            await this.state.loadStockItems();
            
            // Aktualisiere UI
            this.updateInventoryTable();
            this.updateStockPagination();
            this._updateStockFilterUI();
        } catch (error) {
            ErrorHandler.handle(error, 'Fehler beim Entfernen des Filters');
        } finally {
            this._setStockFilterLoading(false);
        }
    }

    /**
     * Setzt den Ladezustand der Filter für Bestandsübersicht
     * @private
     */
    _setStockFilterLoading(isLoading) {
        const filterControls = this.elements.container.inventoryListView.querySelector('.filter-controls');
        if (!filterControls) return;
        
        if (isLoading) {
            filterControls.classList.add('loading');
        } else {
            filterControls.classList.remove('loading');
        }
    }

    /**
     * Initialisiert die Ansicht für neue Bewegungen
     * @private
     */
    async _initializeNewMovementView() {
        try {
            console.log('Initialisiere Ansicht für neue Bewegungen...');
            console.log('Referenzdaten:', this.state.references);
            
            // Formular zurücksetzen
            console.log('Formular wird zurückgesetzt...');
            this._resetFormState();
            
            // Formular-Events initialisieren, falls nötig
            console.log('Formular-Events werden initialisiert...');
            this._initializeFormEvents();
            
            // Formular-Selects mit Referenzdaten füllen
            console.log('Formular-Selects werden befüllt...');
            await this.updateFormSelects();
            
            console.log('Ansicht für neue Bewegungen erfolgreich initialisiert');
        } catch (error) {
            console.error('Fehler beim Initialisieren der Buchungsansicht:', error);
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

    /**
     * Füllt ein Select-Element mit Optionen für Filter
     * @param {HTMLSelectElement} select - Das Select-Element
     * @param {Array} items - Die Elemente, die als Optionen hinzugefügt werden sollen
     * @param {string} defaultText - Der Text für die Standard-Option
     */
    populateFilterSelect(select, items, defaultText = 'Alle') {
        if (!select) {
            console.error('Select-Element nicht gefunden');
            return;
        }
        
        console.log(`Befülle Filter-Select mit ${items.length} Optionen`);
        
        // Behalte den aktuellen Wert, falls vorhanden
        const currentValue = select.value;
        
        // Leere das Select
        select.innerHTML = '';

        // Füge die Standard-Option hinzu
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = defaultText;
        select.appendChild(defaultOption);

        // Füge die Optionen hinzu
        if (items && items.length) {
            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.name || item.id;
                select.appendChild(option);
            });
            
            console.log(`${items.length} Optionen wurden hinzugefügt`);
        } else {
            console.warn('Keine Elemente für das Select-Menü gefunden');
        }

        // Setze den vorherigen Wert zurück, falls er existierte
        if (currentValue) {
            select.value = currentValue;
        }
    }

    /**
     * Behandelt Änderungen am Bewegungstyp
     */
    handleMovementTypeChange() {
        try {
            const typeId = this.elements.form.type?.value;
            console.log('Bewegungstyp geändert zu:', typeId);
            
            if (!typeId) {
                console.log('Kein Bewegungstyp ausgewählt');
                this.elements.form.targetLocationGroup.style.display = 'none';
                return;
            }

            // Debug-Logging für State und Type
            console.log('State:', this.state);
            const type = this.state.getMovementType(typeId);
            console.log('Gefundener Typ:', type);
            console.log('numberOfBookings:', type?.numberOfBookings);

            const targetGroup = this.elements.form.targetLocationGroup;
            const targetSelect = this.elements.form.targetLocation;

            if (!targetGroup || !targetSelect) {
                console.error('Ziel-Lagerort Elemente nicht gefunden:', {
                    targetGroup: !!targetGroup,
                    targetSelect: !!targetSelect
                });
                return;
            }

            if (type && type.numberOfBookings === 2) {
                console.log('Aktiviere Ziel-Lagerort für Doppelbuchung');
                targetGroup.style.display = 'block';
                targetSelect.required = true;
            } else {
                console.log('Deaktiviere Ziel-Lagerort');
                targetGroup.style.display = 'none';
                targetSelect.required = false;
                targetSelect.value = '';
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
        
        const tableBody = this.elements.tables.inventoryBody;
        const tableHead = this.elements.tables.inventoryHead;
        
        try {
            // Verwende entweder die übergebenen Items oder die vom State
            const stockItems = items || this.state.stockItems || [];
            
            console.log('Aktualisiere Inventartabelle mit Daten:', {
                headers: this.state.stockHeaders,
                items: stockItems.length
            });
            
            // Tabellenkopf aktualisieren
            if (tableHead) {
                tableHead.innerHTML = '';
                
                if (!this.state.stockHeaders || this.state.stockHeaders.length === 0) {
                    console.warn('Keine Tabellenüberschriften gefunden, verwende Standardüberschriften');
                    const defaultHeaders = ['Artikel-ID', 'Artikel-Name', 'Bestand', 'Min-Bestand', 'Einheit', 'Status'];
                    defaultHeaders.forEach(header => {
                        const th = document.createElement('th');
                        th.textContent = header;
                        tableHead.appendChild(th);
                    });
                } else {
                    this.state.stockHeaders.forEach(header => {
                        const th = document.createElement('th');
                        th.textContent = header;
                        tableHead.appendChild(th);
                    });
                }
            }
            
            // Tabellenkörper aktualisieren
            tableBody.innerHTML = '';
            
            if (!stockItems || stockItems.length === 0) {
                console.warn('Keine Bestandsdaten gefunden');
                const row = tableBody.insertRow();
                const cell = row.insertCell();
                cell.colSpan = this.state.stockHeaders?.length || 5;
                cell.textContent = 'Keine Daten vorhanden';
                cell.style.textAlign = 'center';
                return;
            }
            
            // Debug-Ausgabe der Daten
            console.log('Bestandsdaten für Anzeige:', stockItems);
            
            const fragment = document.createDocumentFragment();
            
            // Erstelle die Tabellenzeilen
            stockItems.forEach(item => {
                const row = document.createElement('tr');
                
                // Bestimme Zeilenklasse basierend auf Bestandsstatus
                if (item._stockStatus || item.Status === 'warnung' || item.Status === 'kritisch') {
                    const statusClass = item._stockStatus || ('stock-' + item.Status);
                    row.classList.add(statusClass);
                    
                    if (item._statusMessage) {
                        row.setAttribute('title', item._statusMessage);
                    } else if (item.Status === 'warnung') {
                        row.setAttribute('title', 'Bestand unter Minimalbestand!');
                    } else if (item.Status === 'kritisch') {
                        row.setAttribute('title', 'Kritischer Bestand!');
                    }
                }
                
                // Füge alle Spalten hinzu
                if (this.state.stockHeaders && this.state.stockHeaders.length > 0) {
                    this.state.stockHeaders.forEach(header => {
                        const cell = document.createElement('td');
                        cell.textContent = item[header] || '';
                        row.appendChild(cell);
                    });
                } else {
                    // Fallback wenn keine Headers definiert sind
                    const defaultHeaders = ['Artikel-ID', 'Artikel-Name', 'Bestand', 'Min-Bestand', 'Einheit', 'Status'];
                    defaultHeaders.forEach(key => {
                        const cell = document.createElement('td');
                        // Versuche den Wert aus dem Item zu bekommen, auch wenn die Schlüssel nicht perfekt übereinstimmen
                        let value = '';
                        if (item[key]) {
                            value = item[key];
                        } else {
                            // Versuche ähnliche Schlüssel zu finden
                            const similarKeys = Object.keys(item).filter(itemKey => 
                                itemKey.toLowerCase().includes(key.toLowerCase().replace('-', ''))
                            );
                            if (similarKeys.length > 0) {
                                value = item[similarKeys[0]];
                            }
                        }
                        cell.textContent = value || '';
                        row.appendChild(cell);
                    });
                }
                
                fragment.appendChild(row);
            });
            
            // Batch-Update des DOM
            tableBody.appendChild(fragment);
            
            console.log('Bestandstabelle erfolgreich aktualisiert');
            
        } catch (error) {
            console.error('Fehler beim Aktualisieren der Bestandstabelle:', error);
            ErrorHandler.handle(error, 'Fehler beim Aktualisieren der Bestandstabelle');
        }
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
        eventBus.on('referencesLoaded', (references) => {
            console.log('Referenzdaten im UI aktualisiert:', references);
            this.updateFormSelects();
        });

        eventBus.on('stateInitialized', () => {
            console.log('State wurde initialisiert, aktualisiere UI');
            this.updateFormSelects();
        });

        // Event-Listener für Typ-Änderungen
        this.elements.form.type?.addEventListener('change', () => {
            console.log('Typ-Änderung erkannt');
            this.handleMovementTypeChange();
        });

        eventBus.on('movementsLoaded', (movements) => {
            this.updateMovementsTable();
            this.updatePagination();
        });
        
        // Bestandsdaten wurden geladen - aktualisiere die Tabelle
        eventBus.on('stockItemsLoaded', (items) => {
            console.log('Bestandsdaten geladen, aktualisiere Tabelle:', items.length);
            this.updateInventoryTable();
            this.updateStockPagination();
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
        const filterControls = this.elements.container.inventoryMovementsView.querySelector('.filter-controls');
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