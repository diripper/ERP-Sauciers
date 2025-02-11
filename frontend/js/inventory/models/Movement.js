class Movement {
    constructor(data = {}) {
        this.mitarbeiter_id = data.mitarbeiter_id || '';
        this.typ_id = data.typ_id || '';
        this.artikel_id = data.artikel_id || '';
        this.transaktionsmenge = this.parseTransaktionsmenge(data.transaktionsmenge);
        this.buchungstext = data.buchungstext || '';
        this.lagerort_id = data.lagerort_id || '';
        this.timestamp = data.timestamp || new Date().toISOString();

    }

    parseTransaktionsmenge(menge) {
        const parsed = parseInt(menge);
        return isNaN(parsed) ? 0 : parsed;
    }

    requiresDoubleBooking(movementTypes) {
        if (!movementTypes || !this.typ_id) return false;
        const type = movementTypes.find(t => t.id === this.typ_id);
        return type?.numberOfBookings === 2;
    }

    validate() {
        const errors = [];

        if (!this.mitarbeiter_id) {
            errors.push('Mitarbeiter muss angegeben werden');
        }

        if (!this.lagerort_id) {
            errors.push('Lagerort muss ausgewählt werden');
        }

        if (!this.typ_id) {
            errors.push('Bewegungstyp muss ausgewählt werden');
        }

        if (!this.artikel_id) {
            errors.push('Artikel muss ausgewählt werden');
        }

        if (!this.transaktionsmenge) {
            errors.push('Gültige Transaktionsmenge erforderlich');
        }

        return errors;
    }

    toJSON() {
        return {
            mitarbeiter_id: this.mitarbeiter_id,
            typ_id: this.typ_id,
            artikel_id: this.artikel_id,
            transaktionsmenge: this.transaktionsmenge,
            buchungstext: this.buchungstext,
            lagerort_id: this.lagerort_id,
            timestamp: this.timestamp
        };
    }
}

// Exportiere die Klasse für Module-Support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Movement;
} 