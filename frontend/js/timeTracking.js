class TimeTrackingManager {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.selectedEntries = new Set();
        this.loadLocations(); // Initial Standorte laden
    }

    initializeElements() {
        // Formular-Elemente
        this.timeEntryForm = document.getElementById('timeEntry');
        this.locationSelect = document.getElementById('location');
        this.dateInput = document.getElementById('date');
        this.startTimeInput = document.getElementById('startTime');
        this.endTimeInput = document.getElementById('endTime');
        
        // Tabellen-Elemente
        this.timeTable = document.getElementById('timeTable');
        this.totalHoursSpan = document.getElementById('totalHours');
        this.deleteButton = document.getElementById('deleteSelectedEntries');
        
        // View-Buttons
        this.showTimeEntryFormBtn = document.getElementById('showTimeEntryForm');
        this.showTimeHistoryBtn = document.getElementById('showTimeHistory');
    }

    bindEvents() {
        // Form Submission
        this.timeEntryForm.addEventListener('submit', (e) => this.handleTimeEntry(e));
        
        // View Switching
        this.showTimeEntryFormBtn.addEventListener('click', () => this.showView('entry'));
        this.showTimeHistoryBtn.addEventListener('click', () => this.showView('history'));
        
        // Delete Button
        this.deleteButton.addEventListener('click', () => this.handleDelete());
    }

    async handleTimeEntry(e) {
        e.preventDefault();
        try {
            const formData = {
                employeeId: currentUser.id,
                date: this.dateInput.value,
                location: this.locationSelect.value,
                startTime: this.startTimeInput.value,
                endTime: this.endTimeInput.value
            };
            
            const response = await fetch('/api/time/entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();
            if (data.success) {
                Modal.success('Zeit erfolgreich erfasst');
                this.timeEntryForm.reset();
            } else {
                Modal.error(data.message || 'Fehler beim Speichern der Zeit');
            }
        } catch (error) {
            console.error('Fehler beim Speichern:', error);
            Modal.error('Ein Fehler ist aufgetreten');
        }
    }

    async loadLocations() {
        try {
            const response = await fetch('/api/time/locations');
            const data = await response.json();
            
            if (data.success) {
                this.locationSelect.innerHTML = '<option value="">Bitte wählen...</option>';
                data.locations.forEach(location => {
                    const option = document.createElement('option');
                    option.value = location;
                    option.textContent = location;
                    this.locationSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Fehler beim Laden der Standorte:', error);
            Modal.error('Fehler beim Laden der Standorte');
        }
    }

    async loadTimeHistory() {
        try {
            const response = await fetch(`/api/time/history/${currentUser.id}`);
            const data = await response.json();
            
            if (data.success) {
                this.updateTimeTable(data.times);
            }
        } catch (error) {
            console.error('Fehler beim Laden des Zeitkontos:', error);
        }
    }

    updateTimeTable(times) {
        const tbody = this.timeTable.querySelector('tbody');
        tbody.innerHTML = '';
        let totalMinutes = 0;

        times.forEach(entry => {
            const row = this.createTimeTableRow(entry);
            tbody.appendChild(row);
            
            const [hours, minutes] = entry.workingHours.split(':').map(Number);
            totalMinutes += hours * 60 + minutes;
        });

        this.updateTotalHours(totalMinutes);
    }

    showView(viewName) {
        document.getElementById('timeEntryForm').classList.add('hidden');
        document.getElementById('timeHistory').classList.add('hidden');

        switch(viewName) {
            case 'entry':
                document.getElementById('timeEntryForm').classList.remove('hidden');
                break;
            case 'history':
                document.getElementById('timeHistory').classList.remove('hidden');
                this.loadTimeHistory();
                break;
        }
    }

    async handleDelete() {
        if (this.selectedEntries.size === 0) return;

        const confirmed = await Modal.confirm('Möchten Sie die ausgewählten Einträge wirklich löschen?');
        if (confirmed) {
            try {
                const response = await fetch('/api/time/entries', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        employeeId: currentUser.id,
                        timestamps: Array.from(this.selectedEntries)
                    })
                });

                const data = await response.json();
                if (data.success) {
                    await Modal.success('Einträge erfolgreich gelöscht');
                    this.selectedEntries.clear();
                    await this.loadTimeHistory();
                } else {
                    await Modal.error('Fehler beim Löschen der Einträge');
                }
            } catch (error) {
                console.error('Fehler beim Löschen:', error);
                await Modal.error('Fehler beim Löschen der Einträge');
            }
        }
    }

    createTimeTableRow(entry) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <input type="checkbox" 
                       data-timestamp="${entry.timestamp}"
                       ${this.selectedEntries.has(entry.timestamp) ? 'checked' : ''}>
            </td>
            <td>${entry.date}</td>
            <td>${entry.day || ''}</td>
            <td>${entry.location}</td>
            <td>${entry.startTime}</td>
            <td>${entry.endTime}</td>
            <td>${entry.workingHours}</td>
        `;

        // Event-Listener für Checkbox
        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.selectedEntries.add(entry.timestamp);
            } else {
                this.selectedEntries.delete(entry.timestamp);
            }
            this.updateDeleteButton();
        });

        return row;
    }

    updateDeleteButton() {
        this.deleteButton.disabled = this.selectedEntries.size === 0;
    }

    updateTotalHours(totalMinutes) {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        this.totalHoursSpan.textContent = 
            `${hours}:${minutes.toString().padStart(2, '0')}`;
    }
}

// Initialisierung
document.addEventListener('DOMContentLoaded', () => {
    window.timeTrackingManager = new TimeTrackingManager();
}); 