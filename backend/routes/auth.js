const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { employees, hasPermission } = require('../data/employees');

// Login-Endpunkt
router.post('/login', async (req, res) => {
    const { employeeId, password } = req.body;
    const user = employees[employeeId];
    if (!user) {
        return res.status(401).json({ success: false, message: "Mitarbeiter nicht gefunden" });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
        return res.status(401).json({ success: false, message: "Falsches Passwort" });
    }
    
    // Speichere den authentifizierten User in der Session
    req.session.user = user;
    console.log("Login erfolgreich für:", user);
    
    return res.json({ 
        success: true, 
        employeeId: user.id, 
        name: user.name, 
        permissions: calculatePermissions(user) 
    });
});

// Session-Check-Endpunkt
router.get('/session', (req, res) => {
    if (req.session && req.session.user) {
        return res.json({ authenticated: true, user: req.session.user });
    } else {
        return res.status(401).json({ authenticated: false, message: "Session ungültig" });
    }
});

// Kleine Hilfsfunktion zur Berechnung der Berechtigungen (Beispiel)
function calculatePermissions(user) {
    return {
        timeTracking: {
            view: hasPermission(user.id, 'timeTracking', 'view'),
            edit: hasPermission(user.id, 'timeTracking', 'edit')
        },
        inventory: {
            view: hasPermission(user.id, 'inventory', 'view'),
            edit: hasPermission(user.id, 'inventory', 'edit'),
            delete: hasPermission(user.id, 'inventory', 'delete')
        }
    };
}

module.exports = router; 