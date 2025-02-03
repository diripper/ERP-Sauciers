const bcrypt = require('bcryptjs');

const password = "test123"; // Das Beispiel-Passwort
bcrypt.hash(password, 10).then(hash => {
    console.log('Passwort-Hash:', hash);
}); 