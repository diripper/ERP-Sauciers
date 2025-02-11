const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { employees, getUserPermissions } = require('../data/employees');

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
    
    // Berechne Berechtigungen mit der neuen Funktion
    const permissions = getUserPermissions(user.id);
    if (!permissions) {
        return res.status(500).json({ success: false, message: "Fehler beim Laden der Berechtigungen" });
    }
    
    // Speichere den authentifizierten User in der Session
    req.session.user = {
        ...user,
        permissions // Füge Berechtigungen zur Session hinzu
    };
    
    console.log("Login erfolgreich für:", {
        id: user.id,
        name: user.name,
        permissions
    });
    
    return res.json({ 
        success: true, 
        employeeId: user.id, 
        name: user.name, 
        permissions 
    });
});

// Session-Check-Endpunkt
router.get('/session', (req, res) => {
    if (req.session && req.session.user) {
        // Aktualisiere Berechtigungen bei jedem Session-Check
        const permissions = getUserPermissions(req.session.user.id);
        if (!permissions) {
            return res.status(401).json({ 
                authenticated: false, 
                message: "Fehler beim Laden der Berechtigungen" 
            });
        }
        
        req.session.user.permissions = permissions;
        return res.json({ 
            authenticated: true, 
            user: req.session.user 
        });
    } else {
        return res.status(401).json({ 
            authenticated: false, 
            message: "Session ungültig" 
        });
    }
});

module.exports = router; 