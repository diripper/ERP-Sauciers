/**
 * Service-Klasse für die Verwaltung des Inventars.
 * Handhabt die Kommunikation mit der API und die Geschäftslogik.
 */
class InventoryService {
    constructor(state) {
        this.state = state;
        this.currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
        this.token = sessionStorage.getItem('token');
        
        // Verbessertes Cache-System
        this._cache = {
            movements: new Map(),
            references: new Map()
        };
        this._cacheConfig = {
            movements: {
                duration: 60000,  // 1 Minute für Bewegungen
                lastUpdate: null
            },
            references: {
                duration: 300000, // 5 Minuten für Referenzdaten
                lastUpdate: null
            }
        };
    }

    /**
     * Erstellt eine neue Bewegung im System.
     * @param {Object} movementData - Die Daten der Bewegung
     * @returns {Promise<boolean>} - True wenn erfolgreich, sonst false
     */
    async createMovement(movementData) {
        try {
            // Debug-Logging für Berechtigungen
            console.log('Prüfe Berechtigungen:', {
                user: this.currentUser,
                permissions: this.currentUser?.permissions,
                inventoryPerms: this.currentUser?.permissions?.inventory,
                token: this.token ? 'vorhanden' : 'nicht vorhanden'
            });

            // Berechtigungsprüfung
            if (!this.currentUser?.permissions?.inventory?.edit) {
                throw new Error('Keine Berechtigung für diese Aktion');
            }

            // Erstelle Movement-Objekt
            const movement = new Movement(movementData);
            
            // Validiere die Daten
            const validationErrors = movement.validate();
            if (validationErrors.length > 0) {
                ErrorHandler.handleValidation(validationErrors);
                return false;
            }

            // Prüfe ob Doppelbuchung erforderlich
            const type = this.state.getMovementType(movement.typ_id);
            console.log('Bewegungstyp:', type);

            if (type?.numberOfBookings === 2 && document.getElementById('newTargetLocationId')?.value) {
                console.log('Starte Doppelbuchung...');
                return await this.handleDoubleBooking(movement);
            }

            // Normale Einzelbuchung
            console.log('Starte Einzelbuchung...');
            const result = await this.postMovement(movement.toJSON());
            
            if (result.success) {
                this._invalidateAllCaches(); // Invalidiere alle Caches nach Änderung
                eventBus.emit('movementCreated', result.data);
                return true;
            }
            return false;
        } catch (error) {
            ErrorHandler.handle(error);
            return false;
        }
    }

    /**
     * Invalidiert den Cache für einen bestimmten Typ
     * @private
     * @param {string} type - Der Cache-Typ ('movements' oder 'references')
     */
    _invalidateCache(type = 'movements') {
        this._cache[type].clear();
        this._cacheConfig[type].lastUpdate = null;
    }

    /**
     * Prüft ob der Cache für einen bestimmten Typ noch gültig ist
     * @private
     * @param {string} type - Der Cache-Typ ('movements' oder 'references')
     * @returns {boolean}
     */
    _isCacheValid(type) {
        const config = this._cacheConfig[type];
        return config.lastUpdate && 
               (Date.now() - config.lastUpdate) < config.duration;
    }

    /**
     * Speichert Daten im Cache
     * @private
     * @param {string} type - Der Cache-Typ ('movements' oder 'references')
     * @param {string} key - Der Cache-Schlüssel
     * @param {any} data - Die zu cachenden Daten
     */
    _setCache(type, key, data) {
        this._cache[type].set(key, data);
        this._cacheConfig[type].lastUpdate = Date.now();
    }

    /**
     * Liest Daten aus dem Cache
     * @private
     * @param {string} type - Der Cache-Typ ('movements' oder 'references')
     * @param {string} key - Der Cache-Schlüssel
     * @returns {any|null} Die gecachten Daten oder null
     */
    _getCache(type, key) {
        if (!this._isCacheValid(type)) {
            this._cache[type].clear();
            return null;
        }
        return this._cache[type].get(key);
    }

    async handleDoubleBooking(baseMovement) {
        try {
            console.log('Verarbeite Doppelbuchung:', baseMovement);
            
            // Erste Buchung (Ausgang)
            const firstMovement = {
                mitarbeiter_id: baseMovement.mitarbeiter_id,
                lagerort_id: baseMovement.lagerort_id,
                typ_id: baseMovement.typ_id,
                artikel_id: baseMovement.artikel_id,
                transaktionsmenge: -Math.abs(baseMovement.transaktionsmenge),
                buchungstext: baseMovement.buchungstext
            };

            // Zweite Buchung (Eingang im Ziellager)
            const targetLocationId = document.getElementById('newTargetLocationId')?.value;
            if (!targetLocationId) {
                throw new Error('Kein Ziellagerort für Doppelbuchung ausgewählt');
            }

            const secondMovement = {
                mitarbeiter_id: baseMovement.mitarbeiter_id,
                lagerort_id: targetLocationId, // Verwende den Ziellagerort als lagerort_id
                typ_id: baseMovement.typ_id,
                artikel_id: baseMovement.artikel_id,
                transaktionsmenge: Math.abs(baseMovement.transaktionsmenge),
                buchungstext: baseMovement.buchungstext
            };

            console.log('Sende Buchungen:', {
                erste: firstMovement,
                zweite: secondMovement
            });

            // Sende beide Buchungen nacheinander
            const firstResult = await this.postMovement(firstMovement);
            if (!firstResult.success) {
                throw new Error('Fehler bei der ersten Buchung');
            }

            const secondResult = await this.postMovement(secondMovement);
            if (!secondResult.success) {
                throw new Error('Fehler bei der zweiten Buchung');
            }

            console.log('Doppelbuchung erfolgreich durchgeführt');
            
            // Invalidiere alle Caches und erzwinge Neuladen
            this._invalidateAllCaches();
            this.state._invalidateCache();
            this.state._forceReload = true;
            
            return true;
        } catch (error) {
            console.error('Fehler bei der Doppelbuchung:', error);
            ErrorHandler.handle(error, 'Fehler bei der Doppelbuchung');
            return false;
        }
    }

    async postMovement(movementData) {
        try {
            if (!this.token) {
                throw new Error('Kein gültiger Token vorhanden');
            }

            const response = await fetch('/api/inventory/movements', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    ...movementData,
                    employeeId: this.currentUser.id
                })
            });

            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('Keine Berechtigung für diese Aktion');
                }
                throw new Error('Fehler beim Speichern der Bewegung');
            }

            const data = await response.json();
            return { success: true, data };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Lädt die Referenzdaten mit optimiertem Caching
     * @returns {Promise<Object>}
     */
    async loadReferences() {
        const cacheKey = 'allReferences';
        const cachedData = this._getCache('references', cacheKey);
        
        if (cachedData) {
            console.log('Verwende gecachte Referenzdaten');
            return cachedData;
        }

        try {
            console.log('Lade Referenzdaten vom Server');
            if (!this.token) {
                throw new Error('Kein gültiger Token vorhanden');
            }

            const response = await fetch('/api/inventory/references', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Fehler beim Laden der Referenzdaten');
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || 'Fehler beim Laden der Referenzdaten');
            }

            this._setCache('references', cacheKey, data.references);
            return data.references;
        } catch (error) {
            console.error('Fehler beim Laden der Referenzdaten:', error);
            throw error;
        }
    }

    /**
     * Lädt die Bestandsliste mit optimiertem Caching
     * @returns {Promise<Array>}
     */
    async loadInventoryList() {
        const cacheKey = 'inventoryList';
        const cachedData = this._getCache('references', cacheKey);
        
        if (cachedData) {
            console.log('Verwende gecachte Bestandsliste');
            return cachedData;
        }

        try {
            console.log('Lade Bestandsliste vom Server');
            if (!this.token) {
                throw new Error('Kein gültiger Token vorhanden');
            }

            const response = await fetch('/api/inventory/items', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Fehler beim Laden der Bestandsliste');
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || 'Fehler beim Laden der Bestandsliste');
            }

            // Berechne zusätzliche Informationen für jeden Artikel
            const enrichedItems = data.items.map(item => ({
                ...item,
                stockStatus: this.calculateStockStatus(item),
                lastMovement: null,
                averageConsumption: 0
            }));

            // Lade die letzten Bewegungen für jeden Artikel
            await this.enrichItemsWithMovementData(enrichedItems);

            this._setCache('references', cacheKey, enrichedItems);
            eventBus.emit('inventoryListLoaded', enrichedItems);
            return enrichedItems;
        } catch (error) {
            ErrorHandler.handle(error, 'Fehler beim Laden der Bestandsliste');
            return [];
        }
    }

    calculateStockStatus(item) {
        if (!item.stock || !item.minStock) return 'normal';
        
        const ratio = item.stock / item.minStock;
        if (ratio <= 1) return 'kritisch';
        if (ratio <= 1.5) return 'warnung';
        return 'normal';
    }

    /**
     * Lädt die neuesten Bewegungen, mit verbessertem Caching
     * @returns {Promise<Array>}
     */
    async loadLatestMovements() {
        const cacheKey = 'latestMovements';
        const cachedData = this._getCache('movements', cacheKey);
        
        if (cachedData) {
            console.log('Verwende gecachte Bewegungen');
            return cachedData;
        }

        try {
            console.log('Lade Bewegungen vom Server');
            const response = await fetch(`/api/inventory/movements?limit=1000`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Fehler beim Laden der Bewegungen');
            }

            const data = await response.json();
            const movements = data.movements || [];
            
            this._setCache('movements', cacheKey, movements);
            return movements;
        } catch (error) {
            console.error('Fehler beim Laden der letzten Bewegungen:', error);
            return [];
        }
    }

    /**
     * Optimierte Version der enrichItemsWithMovementData Methode
     * @param {Array} items - Array von Artikeln
     */
    async enrichItemsWithMovementData(items) {
        try {
            const movements = await this.loadLatestMovements();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            // Erstelle Index für schnelleren Zugriff
            const movementsByArticle = new Map();
            movements.forEach(movement => {
                if (!movementsByArticle.has(movement.artikel_id)) {
                    movementsByArticle.set(movement.artikel_id, []);
                }
                movementsByArticle.get(movement.artikel_id).push(movement);
            });

            items.forEach(item => {
                const itemMovements = movementsByArticle.get(item.id) || [];
                if (itemMovements.length > 0) {
                    item.lastMovement = itemMovements[0];
                    
                    const recentMovements = itemMovements.filter(m => {
                        const movementDate = new Date(m.timestamp);
                        return movementDate >= thirtyDaysAgo;
                    });

                    const totalConsumption = recentMovements.reduce((sum, m) => 
                        sum + (m.transaktionsmenge < 0 ? Math.abs(m.transaktionsmenge) : 0), 0);

                    item.averageConsumption = totalConsumption / 30;
                }
            });
        } catch (error) {
            console.error('Fehler beim Anreichern der Artikeldaten:', error);
        }
    }

    getLocationName(locationId) {
        return this.state.references.locations.find(loc => loc.id === locationId)?.name || '';
    }

    getTypeName(typeId) {
        return this.state.references.types.find(type => type.id === typeId)?.name || '';
    }

    getArticleName(articleId) {
        return this.state.references.articles.find(article => article.id === articleId)?.name || '';
    }

    /**
     * Invalidiert alle Caches nach einer Bewegungsbuchung
     * @private
     */
    _invalidateAllCaches() {
        this._invalidateCache('movements');
        this._invalidateCache('references');
        console.log('Alle Caches wurden invalidiert');
    }
}

// Exportiere die Klasse für Module-Support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InventoryService;
} 