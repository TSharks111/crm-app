const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./leads.db', (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )
    `, (err) => {
        if (err) console.error('Error creating agents table:', err.message);
        else console.log('Agents table created or already exists');
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            status TEXT DEFAULT 'New',
            agent_id INTEGER,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
    `, (err) => {
        if (err) console.error('Error creating leads table:', err.message);
        else console.log('Leads table created or already exists');
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER,
            description TEXT,
            due_date TEXT,
            outcome TEXT DEFAULT 'Pending',
            FOREIGN KEY (lead_id) REFERENCES leads(id)
        )
    `, (err) => {
        if (err) console.error('Error creating tasks table:', err.message);
        else console.log('Tasks table created or already exists');
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS converted_leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER,
            name TEXT,
            email TEXT,
            phone TEXT,
            agent_id INTEGER,
            converted_date TEXT,
            FOREIGN KEY (lead_id) REFERENCES leads(id),
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
    `, (err) => {
        if (err) console.error('Error creating converted_leads table:', err.message);
        else console.log('Converted_leads table created or already exists');
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS unconverted_leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER,
            name TEXT,
            email TEXT,
            phone TEXT,
            agent_id INTEGER,
            contacted_date TEXT,
            FOREIGN KEY (lead_id) REFERENCES leads(id),
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
    `, (err) => {
        if (err) console.error('Error creating unconverted_leads table:', err.message);
        else console.log('Unconverted_leads table created or already exists');
    });
});

module.exports = db;