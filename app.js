const express = require('express');
const db = require('./db');
const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let lastAgentIndex = -1;

app.get('/', (req, res) => res.send('Welcome to your CRM!'));

app.get('/api/agents', async (req, res) => {
    const result = await db.query('SELECT * FROM agents');
    res.json(result.rows);
});

app.get('/api/leads', async (req, res) => {
    const result = await db.query('SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id');
    res.json(result.rows);
});

app.post('/api/leads', async (req, res) => {
    const { name, email, phone, status } = req.body;
    const agentResult = await db.query('SELECT id FROM agents');
    const agents = agentResult.rows;
    if (!agents.length) return res.status(500).json({ error: 'No agents available' });

    lastAgentIndex = (lastAgentIndex + 1) % agents.length;
    const agentId = agents[lastAgentIndex].id;

    const leadResult = await db.query(
        'INSERT INTO leads (name, email, phone, status, agent_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [name, email, phone, status || 'New', agentId]
    );
    const leadId = leadResult.rows[0].id;

    await db.query(
        'INSERT INTO tasks (lead_id, description, due_date) VALUES ($1, $2, $3)',
        [leadId, `Contact ${name}`, new Date().toISOString().split('T')[0]]
    );

    res.json({ id: leadId, message: 'Lead added and assigned' });
});

app.put('/api/leads/:id', async (req, res) => {
    const { name, email, phone, status } = req.body;
    const id = parseInt(req.params.id);
    const result = await db.query(
        'UPDATE leads SET name = $1, email = $2, phone = $3, status = $4 WHERE id = $5 RETURNING *',
        [name, email, phone, status, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Lead not found' });
    res.json({ message: 'Lead updated' });
});

app.delete('/api/leads/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const result = await db.query('DELETE FROM leads WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Lead not found' });
    res.json({ message: 'Lead deleted' });
});

app.get('/api/leads/export', async (req, res) => {
    const result = await db.query('SELECT l.*, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id = a.id');
    const csv = [
        'ID,Name,Email,Phone,Status,Agent',
        ...result.rows.map(row => `${row.id},${row.name},${row.email},${row.phone},${row.status},${row.agent_name}`)
    ].join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('leads.csv');
    res.send(csv);
});

app.get('/api/converted/export', async (req, res) => {
    const result = await db.query('SELECT c.*, a.name as agent_name FROM converted_leads c JOIN agents a ON c.agent_id = a.id');
    const csv = [
        'ID,Lead ID,Name,Email,Phone,Agent,Converted Date',
        ...result.rows.map(row => `${row.id},${row.lead_id},${row.name},${row.email},${row.phone},${row.agent_name},${row.converted_date}`)
    ].join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('converted_leads.csv');
    res.send(csv);
});

app.get('/api/unconverted/export', async (req, res) => {
    const result = await db.query('SELECT u.*, a.name as agent_name FROM unconverted_leads u JOIN agents a ON u.agent_id = a.id');
    const csv = [
        'ID,Lead ID,Name,Email,Phone,Agent,Contacted Date',
        ...result.rows.map(row => `${row.id},${row.lead_id},${row.name},${row.email},${row.phone},${row.agent_name},${row.contacted_date}`)
    ].join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('unconverted_leads.csv');
    res.send(csv);
});

app.get('/api/leads/:id/tasks', async (req, res) => {
    const leadId = parseInt(req.params.id);
    const result = await db.query('SELECT * FROM tasks WHERE lead_id = $1', [leadId]);
    res.json(result.rows);
});

app.post('/api/leads/:id/tasks', async (req, res) => {
    const { description, due_date } = req.body;
    const leadId = parseInt(req.params.id);
    const result = await db.query(
        'INSERT INTO tasks (lead_id, description, due_date) VALUES ($1, $2, $3) RETURNING id',
        [leadId, description, due_date]
    );
    res.json({ id: result.rows[0].id, message: 'Task added' });
});

app.put('/api/tasks/:id', async (req, res) => {
    const { outcome } = req.body;
    const taskId = parseInt(req.params.id);
    const taskResult = await db.query('UPDATE tasks SET outcome = $1 WHERE id = $2 RETURNING lead_id', [outcome, taskId]);
    if (taskResult.rowCount === 0) return res.status(404).json({ error: 'Task not found' });

    const leadId = taskResult.rows[0].lead_id;
    const leadResult = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    const lead = leadResult.rows[0];
    const today = new Date().toISOString().split('T')[0];

    if (outcome === 'Converted') {
        await db.query(
            'INSERT INTO converted_leads (lead_id, name, email, phone, agent_id, converted_date) VALUES ($1, $2, $3, $4, $5, $6)',
            [lead.id, lead.name, lead.email, lead.phone, lead.agent_id, today]
        );
    } else if (outcome === 'Unconverted') {
        await db.query(
            'INSERT INTO unconverted_leads (lead_id, name, email, phone, agent_id, contacted_date) VALUES ($1, $2, $3, $4, $5, $6)',
            [lead.id, lead.name, lead.email, lead.phone, lead.agent_id, today]
        );
    }
    res.json({ message: 'Task updated' });
});

app.listen(port, () => console.log(`CRM app running at http://localhost:${port}`));