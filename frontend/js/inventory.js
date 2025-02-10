class InventoryManager {
    constructor() {
        document.addEventListener('DOMContentLoaded', async () => {
            await this.initializeDependencies();
            this.initializeElements();
            this.initializeState();
            this.bindEvents();
            await this.loadInitialData();
        });
    }

    async initializeDependencies() {
        this.currentUser = await checkSession();
        if (!this.currentUser?.permissions?.inventory?.view) {
            Modal.error('Keine Berechtigung');
            return;
        }
    }

    initializeElements() {
        this.elements = {
            entriesPerPage: document.getElementById('entriesPerPage'),
            prevPage: document.getElementById('prevPage'),
            nextPage: document.getElementById('nextPage'),
            currentPage: document.getElementById('currentPage'),
            totalPages: document.getElementById('totalPages'),
            tableBody: document.querySelector('#movementsTable tbody'),
            newMovementForm: document.getElementById('newMovementForm'),
            newLocationId: document.getElementById('newLocationId'),
            newTargetLocationId: document.getElementById('newTargetLocationId'),
            targetLocationGroup: document.getElementById('targetLocationGroup'),
            newTypeId: document.getElementById('newTypeId'),
            newArticleId: document.getElementById('newArticleId'),
            newQuantity: document.getElementById('newQuantity'),
            newText: document.getElementById('newText')
        };

        if (this.elements.newTypeId) {
            this.elements.newTypeId.addEventListener('change', () => this.handleMovementTypeChange());
        }

        if (this.elements.newMovementForm) {
            this.elements.newMovementForm.addEventListener('submit', (e) => this.handleNewMovement(e));
        }
    }

    initializeState() {
        this.state = {
            currentPage: 1,
            entriesPerPage: 10,
            totalRows: 0,
            references: null,
            movementTypes: []
        };
    }

    bindEvents() {
        this.elements.entriesPerPage.addEventListener('change', () => this.handlePageSizeChange());
        this.elements.prevPage.addEventListener('click', () => this.handlePageNavigation(-1));
        this.elements.nextPage.addEventListener('click', () => this.handlePageNavigation(1));
    }

    async handlePageSizeChange() {
        this.state.entriesPerPage = parseInt(this.elements.entriesPerPage.value);
        this.state.currentPage = 1;
        await this.loadData();
    }

    async handlePageNavigation(direction) {
        this.state.currentPage += direction;
        await this.loadData();
    }

    async loadInitialData() {
        try {
            const response = await fetch('/api/inventory/references');
            const data = await response.json();
            
            if (data.success) {
                this.state.references = data.references;
                this.state.movementTypes = data.references.types;
                
                // Fülle die Auswahlfelder
                this.populateSelects();
            }
        } catch (error) {
            console.error('Fehler beim Laden der Initialdaten:', error);
            Modal.error('Fehler beim Laden der Daten');
        }
    }

    populateSelects() {
        // Lagerorte
        if (this.elements.newLocationId && this.elements.newTargetLocationId) {
            const locations = this.state.references.locations;
            const locationOptions = locations.map(loc => 
                `<option value="${loc.id}">${loc.name}</option>`
            ).join('');
            
            this.elements.newLocationId.innerHTML = '<option value="">Bitte wählen...</option>' + locationOptions;
            this.elements.newTargetLocationId.innerHTML = '<option value="">Bitte wählen...</option>' + locationOptions;
        }

        // Bewegungstypen
        if (this.elements.newTypeId) {
            const types = this.state.references.types;
            this.elements.newTypeId.innerHTML = '<option value="">Bitte wählen...</option>' + 
                types.map(type => `<option value="${type.id}">${type.name}</option>`).join('');
        }

        // Artikel
        if (this.elements.newArticleId) {
            const articles = this.state.references.articles;
            this.elements.newArticleId.innerHTML = '<option value="">Bitte wählen...</option>' + 
                articles.map(article => `<option value="${article.id}">${article.name}</option>`).join('');
        }
    }

    updateUI(data) {
        // Tabelle aktualisieren
        this.elements.tableBody.innerHTML = data.movements
            .map(movement => this.createTableRow(movement))
            .join('');

        // Pagination aktualisieren
        this.elements.currentPage.textContent = data.pagination.page;
        this.elements.totalPages.textContent = data.pagination.totalPages;
        this.elements.prevPage.disabled = data.pagination.page <= 1;
        this.elements.nextPage.disabled = data.pagination.page >= data.pagination.totalPages;
    }

    showView(viewName) {
        // Alle Views ausblenden
        [this.listView, this.movementsView, this.newMovementView].forEach(view => {
            view.classList.add('hidden');
        });

        // Gewählte View einblenden
        switch(viewName) {
            case 'list':
                this.listView.classList.remove('hidden');
                this.loadInventoryList();
                break;
            case 'movements':
                this.movementsView.classList.remove('hidden');
                this.loadMovements();
                break;
            case 'newMovement':
                this.newMovementView.classList.remove('hidden');
                this.loadArticlesForSelect();
                break;
        }
        
        this.currentView = viewName;
    }

    async loadInventoryList() {
        try {
            const response = await fetch('/api/inventory/items');
            const data = await response.json();
            
            if (data.success) {
                const tbody = document.querySelector('#inventoryTable tbody');
                tbody.innerHTML = '';
                
                data.items.forEach(item => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${item.id}</td>
                        <td>${item.name}</td>
                        <td>${item.category}</td>
                        <td>${item.stock}</td>
                        <td>${item.minStock}</td>
                        <td>${item.unit}</td>
                    `;
                    tbody.appendChild(row);
                });
            }
        } catch (error) {
            console.error('Fehler beim Laden der Bestandsliste:', error);
            Modal.error('Fehler beim Laden der Bestandsliste');
        }
    }

    async loadMovements() {
        try {
            const tbody = document.querySelector('#movementsTable tbody');
            if (!tbody) throw new Error('Tabellenkörper nicht gefunden');
            
            tbody.innerHTML = '<tr><td colspan="11">Lade Daten...</td></tr>';
            
            const response = await fetch(`/api/inventory/movements?${queryParams}`);
            
            if (!response.ok) {
                throw new Error(`HTTP Fehler! Status: ${response.status}`);
            }
            
            const data = await response.json();

            if (!data || !data.pagination) {
                throw new Error('Ungültige Serverantwort');
            }

            this.totalRows = data.pagination.totalRows;
            
            console.log('Response received:', {
                receivedMovements: data.movements.length,
                pagination: data.pagination,
                currentState: {
                    currentPage: this.currentPage,
                    entriesPerPage: this.entriesPerPage,
                    totalRows: this.totalRows
                }
            });

            // Tabelle aktualisieren
            tbody.innerHTML = '';
            
            if (data.movements.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11">Keine Daten verfügbar</td></tr>';
                return;
            }

            data.movements.forEach(movement => {
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
                    <td>${movement.lo_bestand}</td>
                    <td>${movement.buchungstext}</td>
                `;
                tbody.appendChild(row);
            });

            // Pagination aktualisieren
            this.currentPageSpan.textContent = data.pagination.page;
            this.totalPagesSpan.textContent = data.pagination.totalPages;
            
            // Buttons aktualisieren (korrigierte Logik)
            this.prevPageBtn.disabled = data.pagination.page <= 1;
            this.nextPageBtn.disabled = data.pagination.page >= data.pagination.totalPages;

            // Debug-Ausgabe
            console.log('Aktuelle Paginierung:', {
                currentPage: data.pagination.page,
                totalPages: data.pagination.totalPages,
                prevDisabled: this.prevPageBtn.disabled,
                nextDisabled: this.nextPageBtn.disabled
            });

            console.log('=== End Loading Movements ===\n');
        } catch (error) {
            console.error('Ladefehler:', error);
            Modal.error(`Fehler: ${error.message}`);
        }
    }

    async loadNextBuffer() {
        // Implementierung für das Laden der nächsten 100 Datensätze
        // Wird später hinzugefügt, wenn benötigt
    }

    async loadArticlesForSelect() {
        try {
            const response = await fetch('/api/inventory/items');
            const data = await response.json();
            
            if (data.success) {
                const select = document.getElementById('articleSelect');
                select.innerHTML = '<option value="">Artikel auswählen...</option>';
                
                data.items.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = `${item.name} (${item.id})`;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Fehler beim Laden der Artikel:', error);
            Modal.error('Fehler beim Laden der Artikel');
        }
    }

    async handleMovementTypeChange() {
        const selectedTypeId = this.elements.newTypeId.value;
        const selectedType = this.state.movementTypes.find(type => type.id === selectedTypeId);
        
        console.log('Ausgewählter Typ:', selectedType);
        
        if (selectedType && selectedType.numberOfBookings === 2) {
            this.elements.targetLocationGroup.style.display = 'block';
            this.elements.newTargetLocationId.required = true;
        } else {
            this.elements.targetLocationGroup.style.display = 'none';
            this.elements.newTargetLocationId.required = false;
            this.elements.newTargetLocationId.value = '';
        }
    }

    async handleNewMovement(e) {
        e.preventDefault();
        
        const selectedTypeId = this.elements.newTypeId.value;
        const selectedType = this.state.movementTypes.find(type => type.id === selectedTypeId);
        
        const baseMovement = {
            mitarbeiter_id: this.currentUser.id,
            typ_id: selectedTypeId,
            artikel_id: this.elements.newArticleId.value,
            transaktionsmenge: parseInt(this.elements.newQuantity.value),
            buchungstext: this.elements.newText.value || '',
            lagerort_id: this.elements.newLocationId.value
        };

        try {
            if (selectedType?.numberOfBookings === 2) {
                // Erste Buchung (negative Menge)
                const firstMovement = {
                    ...baseMovement,
                    transaktionsmenge: -Math.abs(baseMovement.transaktionsmenge)
                };

                // Zweite Buchung (positive Menge im Ziellager)
                const secondMovement = {
                    ...baseMovement,
                    transaktionsmenge: Math.abs(baseMovement.transaktionsmenge),
                    lagerort_id: this.elements.newTargetLocationId.value
                };

                // Sequentielle Buchungen mit kleinem Zeitversatz
                await this.postMovement(firstMovement);
                await new Promise(resolve => setTimeout(resolve, 100)); // 100ms Verzögerung
                await this.postMovement(secondMovement);
            } else {
                // Normale Einzelbuchung
                await this.postMovement(baseMovement);
            }

            Modal.show('Erfolg', 'Bewegung wurde erfolgreich gebucht');
            this.elements.newMovementForm.reset();
            this.elements.targetLocationGroup.style.display = 'none';
            
        } catch (error) {
            console.error('Fehler beim Buchen der Bewegung:', error);
            Modal.error('Fehler beim Buchen der Bewegung');
        }
    }

    async postMovement(movement) {
        const response = await fetch('/api/inventory/movements', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(movement)
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || 'Fehler beim Buchen der Bewegung');
        }
        return data;
    }
}

// Initialisierung erst nach vollständigem DOM-Load
document.addEventListener('DOMContentLoaded', () => {
    new InventoryManager();
}); 