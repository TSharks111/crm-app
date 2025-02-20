const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://crm_db_0b6i_user:Xw6uEiRHIS3YK64iNnq7CRxTwFtwE3I0@dpg-curfjul6l47c73ccid70-a.oregon-postgres.render.com/crm_db_0b6i',
    ssl: { rejectUnauthorized: false },
    max: 10, // Max connections
    idleTimeoutMillis: 30000, // Close idle connections after 30s
    connectionTimeoutMillis: 10000, // Increase to 10s for slower networks
    keepAlive: true // Enable TCP keep-alive to prevent drops
});

// Handle connection errors and retry
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client:', err.message);
    setTimeout(() => {
        client.release();
        pool.connect((err) => {
            if (err) console.error('Reconnection failed:', err.message);
            else console.log('Reconnected to PostgreSQL database.');
        });
    }, 5000); // Retry after 5s
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

// Seed agents if empty with retry logic
function seedAgents() {
    pool.query('SELECT COUNT(*) FROM agents', (err, res) => {
        if (err) {
            console.error('Error checking agents:', err.message);
            setTimeout(seedAgents, 5000); // Retry after 5s
        } else if (parseInt(res.rows[0].count) === 0) {
            pool.query(`
                INSERT INTO agents (name) VALUES ('Agent 1'), ('Agent 2'), ('Agent 3');
            `, (err) => {
                if (err) console.error('Error seeding agents:', err.message);
                else console.log('Seeded initial agents');
            });
        }
    });
}
seedAgents();

module.exports = pool;