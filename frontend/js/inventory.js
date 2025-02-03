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
            tableBody: document.querySelector('#movementsTable tbody')
        };
    }

    initializeState() {
        this.state = {
            currentPage: 1,
            entriesPerPage: 10,
            totalRows: 0
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
            const [movements, total] = await Promise.all([
                this.fetchMovements(),
                this.fetchTotalCount()
            ]);
            
            this.state.totalRows = total;
            this.updateUI(movements);
        } catch (error) {
            this.handleError(error);
        }
    }

    async fetchMovements() {
        const response = await fetch(`/api/inventory/movements?page=${this.state.currentPage}&limit=${this.state.entriesPerPage}`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Daten konnten nicht geladen werden');
        return response.json();
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

    async handleNewMovement(e) {
        e.preventDefault();
        
        const movement = {
            articleId: document.getElementById('articleSelect').value,
            type: document.getElementById('movementType').value,
            quantity: parseInt(document.getElementById('quantity').value),
            reason: document.getElementById('reason').value,
            employeeId: currentUser.id
        };

        try {
            const response = await fetch('/api/inventory/movements', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(movement)
            });

            const data = await response.json();
            
            if (data.success) {
                Modal.show('Erfolg', 'Bewegung wurde erfolgreich gebucht');
                this.movementForm.reset();
                // Optional: Zurück zur Bewegungsübersicht
                this.showView('movements');
            } else {
                Modal.error(data.message || 'Fehler beim Buchen der Bewegung');
            }
        } catch (error) {
            console.error('Fehler beim Buchen der Bewegung:', error);
            Modal.error('Fehler beim Buchen der Bewegung');
        }
    }
}

// Initialisierung erst nach vollständigem DOM-Load
document.addEventListener('DOMContentLoaded', () => {
    new InventoryManager();
}); 