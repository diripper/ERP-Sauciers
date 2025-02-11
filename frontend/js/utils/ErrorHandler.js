class ErrorHandler {
    static handle(error, context = '') {
        console.error(`${context}:`, error);

        // Wenn der Fehler bereits eine formatierte Nachricht hat
        const errorMessage = error.message || 'Ein unerwarteter Fehler ist aufgetreten';

        // Prüfe ob Modal verfügbar ist
        if (typeof Modal !== 'undefined' && Modal.error) {
            Modal.error(errorMessage);
        } else {
            // Fallback wenn Modal nicht verfügbar
            alert(errorMessage);
        }
    }

    static handleValidation(errors) {
        const message = Array.isArray(errors) ? errors.join('\n') : errors;
        if (typeof Modal !== 'undefined' && Modal.error) {
            Modal.error(message);
        } else {
            alert(message);
        }
    }

    static handleSuccess(message) {
        if (typeof Modal !== 'undefined' && Modal.show) {
            Modal.show('Erfolg', message);
            // Automatisch nach 2 Sekunden schließen
            setTimeout(() => Modal.hide(), 2000);
        } else {
            alert(message);
        }
    }
}

// Exportiere die Klasse für Module-Support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
} 