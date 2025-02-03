const bcrypt = require('bcryptjs');

async function generateHash(password) {
    const hash = await bcrypt.hash(password, 10);
    console.log('Generierter Hash:', hash);
    return hash;
}

// Generiere Hashes für neue Mitarbeiter
async function generateEmployeeHashes() {
    console.log('MA004 - Josef Toledo:');
    await generateHash('josef123');
    
    console.log('MA005 - Doktor Cheerio:');
    await generateHash('doktor123');
}

generateEmployeeHashes(); 