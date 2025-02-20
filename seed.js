const db = require('./db');

db.serialize(() => {
    // Clear existing agents (optional, for testing)
    db.run('DELETE FROM agents', (err) => {
        if (err) console.error('Error clearing agents:', err.message);
    });

    // Insert agents
    const agents = ['Agent 1', 'Agent 2', 'Agent 3']; // Replace with your actual agent names
    const stmt = db.prepare('INSERT INTO agents (name) VALUES (?)');
    agents.forEach(agent => {
        stmt.run(agent, (err) => {
            if (err) console.error('Error adding agent:', err.message);
        });
    });
    stmt.finalize((err) => {
        if (err) console.error('Error finalizing:', err.message);
        else console.log('Agents added successfully');
    });

    // Verify agents
    db.all('SELECT * FROM agents', [], (err, rows) => {
        if (err) console.error('Error fetching agents:', err.message);
        else console.log('Current agents:', rows);
    });
});

setTimeout(() => db.close(), 1000); // Give time for operations to complete