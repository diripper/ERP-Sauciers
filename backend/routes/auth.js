router.post('/login', async (req, res) => {
    try {
        const { employeeId, password } = req.body;
        const user = await authenticateUser(employeeId, password);

        req.session.user = {
            id: user.id,
            name: user.name,
            permissions: user.permissions
        };

        res.json({ success: true, user: req.session.user });
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ success: false, message: 'Anmeldung fehlgeschlagen' });
    }
}); 