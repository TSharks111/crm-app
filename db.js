const { Pool } = require('pg');

// Use Render's internal URL (replace with your actual URL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://user:password@host:port/dbname',
    ssl: { rejectUnauthorized: false } // Required for Render
});

pool.connect((err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to PostgreSQL database.');
});

// Initialize tables
pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        status TEXT DEFAULT 'New',
        agent_id INTEGER REFERENCES agents(id)
    );
    CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id),
        description TEXT,
        due_date TEXT,
        outcome TEXT DEFAULT 'Pending'
    );
    CREATE TABLE IF NOT EXISTS converted_leads (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id),
        name TEXT,
        email TEXT,
        phone TEXT,
        agent_id INTEGER REFERENCES agents(id),
        converted_date TEXT
    );
    CREATE TABLE IF NOT EXISTS unconverted_leads (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id),
        name TEXT,
        email TEXT,
        phone TEXT,
        agent_id INTEGER REFERENCES agents(id),
        contacted_date TEXT
    );
`, (err) => {
    if (err) console.error('Error creating tables:', err.message);
    else console.log('Tables created or already exist');
});

// Seed agents if empty
pool.query('SELECT COUNT(*) FROM agents', (err, res) => {
    if (err) console.error('Error checking agents:', err.message);
    else if (parseInt(res.rows[0].count) === 0) {
        pool.query(`
            INSERT INTO agents (name) VALUES ('Agent 1'), ('Agent 2'), ('Agent 3');
        `, (err) => {
            if (err) console.error('Error seeding agents:', err.message);
            else console.log('Seeded initial agents');
        });
    }
});

module.exports = pool;