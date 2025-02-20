const db = require('./db');

const leads = [
    { name: 'John Doe', email: 'john@example.com', phone: '123-456-7890' },
    { name: 'Jane Smith', email: 'jane@example.com', phone: '987-654-3210' }
];

// Track last assigned agent for round-robin
let lastAgentIndex = -1;

db.serialize(() => {
    db.all('SELECT id FROM agents', [], (err, agents) => {
        if (err) {
            console.error('Error fetching agents:', err.message);
            return;
        }
        if (!agents || agents.length === 0) {
            console.error('No agents found in the database. Please add agents first.');
            return;
        }

        leads.forEach(lead => {
            lastAgentIndex = (lastAgentIndex + 1) % agents.length;
            const agentId = agents[lastAgentIndex].id;
            db.run(
                'INSERT INTO leads (name, email, phone, status, agent_id) VALUES (?, ?, ?, ?, ?)',
                [lead.name, lead.email, lead.phone, 'New', agentId],
                function (err) {
                    if (err) {
                        console.error('Error inserting lead:', err.message);
                        return;
                    }
                    const leadId = this.lastID;
                    db.run(
                        'INSERT INTO tasks (lead_id, description, due_date) VALUES (?, ?, ?)',
                        [leadId, `Contact ${lead.name}`, new Date().toISOString().split('T')[0]],
                        (err) => {
                            if (err) console.error('Error inserting task:', err.message);
                            else console.log(`Lead ${lead.name} added and assigned to agent ${agentId}`);
                        }
                    );
                }
            );
        });
    });
});

setTimeout(() => db.close(), 2000);