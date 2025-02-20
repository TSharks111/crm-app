const express = require('express');
const db = require('./db');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

db.serialize(() => {
    db.run('SELECT 1', (err) => {
        if (err) {
            console.error('Failed to connect to database:', err.message);
            process.exit(1);
        }
    });
});

// Track last assigned agent for round-robin
let lastAgentIndex = -1;

app.get('/', (req, res) => {
    res.send('Welcome to your CRM!');
});

app.get('/api/agents', (req, res) => {
    db.all('SELECT * FROM agents', [], (err, rows) => {
        if (err) res.status(500).send(err.message);
        else res.json(rows);
    });
});

app.get('/api/leads', (req, res) => {
    db.all('SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id', [], (err, rows) => {
        if (err) res.status(500).send(err.message);
        else res.json(rows);
    });
});

app.post('/api/leads', (req, res) => {
    const { name, email, phone, status } = req.body;
    db.all('SELECT id FROM agents', [], (err, agents) => {
        if (err) return res.status(500).send(err.message);
        if (!agents.length) return res.status(500).send('No agents available');

        // Round-robin assignment
        lastAgentIndex = (lastAgentIndex + 1) % agents.length;
        const agentId = agents[lastAgentIndex].id;

        db.run(
            'INSERT INTO leads (name, email, phone, status, agent_id) VALUES (?, ?, ?, ?, ?)',
            [name, email, phone, status || 'New', agentId],
            function (err) {
                if (err) res.status(400).send(err.message);
                else {
                    const leadId = this.lastID;
                    db.run(
                        'INSERT INTO tasks (lead_id, description, due_date) VALUES (?, ?, ?)',
                        [leadId, `Contact ${name}`, new Date().toISOString().split('T')[0]],
                        (err) => {
                            if (err) res.status(400).send(err.message);
                            else res.json({ id: leadId, message: 'Lead added and assigned' });
                        }
                    );
                }
            }
        );
    });
});

app.put('/api/leads/:id', (req, res) => {
    const { name, email, phone, status } = req.body;
    const id = req.params.id;
    db.run(
        'UPDATE leads SET name = ?, email = ?, phone = ?, status = ? WHERE id = ?',
        [name, email, phone, status, id],
        function (err) {
            if (err) res.status(400).send(err.message);
            else if (this.changes === 0) res.status(404).send('Lead not found');
            else res.json({ message: 'Lead updated' });
        }
    );
});

app.delete('/api/leads/:id', (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM leads WHERE id = ?', [id], function (err) {
        if (err) res.status(400).send(err.message);
        else if (this.changes === 0) res.status(404).send('Lead not found');
        else res.json({ message: 'Lead deleted' });
    });
});

app.get('/api/leads/export', (req, res) => {
    db.all('SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id', [], (err, rows) => {
        if (err) res.status(500).send(err.message);
        else {
            const csv = [
                'ID,Name,Email,Phone,Status,Agent',
                ...rows.map(row => `${row.id},${row.name},${row.email},${row.phone},${row.status},${row.agent_name}`)
            ].join('\n');
            res.header('Content-Type', 'text/csv');
            res.attachment('leads.csv');
            res.send(csv);
        }
    });
});

app.get('/api/converted/export', (req, res) => {
    db.all('SELECT c.*, a.name as agent_name FROM converted_leads c JOIN agents a ON c.agent_id = a.id', [], (err, rows) => {
        if (err) res.status(500).send(err.message);
        else {
            const csv = [
                'ID,Lead ID,Name,Email,Phone,Agent,Converted Date',
                ...rows.map(row => `${row.id},${row.lead_id},${row.name},${row.email},${row.phone},${row.agent_name},${row.converted_date}`)
            ].join('\n');
            res.header('Content-Type', 'text/csv');
            res.attachment('converted_leads.csv');
            res.send(csv);
        }
    });
});

app.get('/api/unconverted/export', (req, res) => {
    db.all('SELECT u.*, a.name as agent_name FROM unconverted_leads u JOIN agents a ON u.agent_id = a.id', [], (err, rows) => {
        if (err) res.status(500).send(err.message);
        else {
            const csv = [
                'ID,Lead ID,Name,Email,Phone,Agent,Contacted Date',
                ...rows.map(row => `${row.id},${row.lead_id},${row.name},${row.email},${row.phone},${row.agent_name},${row.contacted_date}`)
            ].join('\n');
            res.header('Content-Type', 'text/csv');
            res.attachment('unconverted_leads.csv');
            res.send(csv);
        }
    });
});

app.get('/api/leads/:id/tasks', (req, res) => {
    const leadId = req.params.id;
    db.all('SELECT * FROM tasks WHERE lead_id = ?', [leadId], (err, rows) => {
        if (err) res.status(500).send(err.message);
        else res.json(rows);
    });
});

app.post('/api/leads/:id/tasks', (req, res) => {
    const { description, due_date } = req.body;
    const leadId = req.params.id;
    db.run(
        'INSERT INTO tasks (lead_id, description, due_date) VALUES (?, ?, ?)',
        [leadId, description, due_date],
        function (err) {
            if (err) res.status(400).send(err.message);
            else res.json({ id: this.lastID, message: 'Task added' });
        }
    );
});

app.put('/api/tasks/:id', (req, res) => {
    const { outcome } = req.body;
    const taskId = req.params.id;
    db.run('UPDATE tasks SET outcome = ? WHERE id = ?', [outcome, taskId], function (err) {
        if (err) return res.status(400).send(err.message);
        if (this.changes === 0) return res.status(404).send('Task not found');

        db.get('SELECT lead_id FROM tasks WHERE id = ?', [taskId], (err, task) => {
            if (err) return res.status(500).send(err.message);
            db.get('SELECT * FROM leads WHERE id = ?', [task.lead_id], (err, lead) => {
                if (err) return res.status(500).send(err.message);
                const today = new Date().toISOString().split('T')[0];
                if (outcome === 'Converted') {
                    db.run(
                        'INSERT INTO converted_leads (lead_id, name, email, phone, agent_id, converted_date) VALUES (?, ?, ?, ?, ?, ?)',
                        [lead.id, lead.name, lead.email, lead.phone, lead.agent_id, today],
                        (err) => {
                            if (err) res.status(400).send(err.message);
                            else res.json({ message: 'Task marked as Converted' });
                        }
                    );
                } else if (outcome === 'Unconverted') {
                    db.run(
                        'INSERT INTO unconverted_leads (lead_id, name, email, phone, agent_id, contacted_date) VALUES (?, ?, ?, ?, ?, ?)',
                        [lead.id, lead.name, lead.email, lead.phone, lead.agent_id, today],
                        (err) => {
                            if (err) res.status(400).send(err.message);
                            else res.json({ message: 'Task marked as Unconverted' });
                        }
                    );
                } else {
                    res.json({ message: 'Task updated' });
                }
            });
        });
    });
});

app.listen(port, () => {
    console.log(`CRM app running at http://localhost:${port}`);
});