const express = require('express');
const { google } = require('googleapis');
const db = require('./db');
const ExcelJS = require('exceljs');
const basicAuth = require('express-basic-auth'); // Add this
const app = express();
const fs = require('fs'); // Add this for file reading
const port = 3000;

app.use(express.static('public'));
app.use(basicAuth({
    users: { 'LHCS2025': 'CallCenter2025!' }, // Username: LHCS2025, Password: password123 (change this!)
    challenge: true,
    unauthorizedResponse: 'Unauthorized - Please log in'
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let lastAgentIndex = -1;
let credentials;
if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
    credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
} else {
    try {
        credentials = JSON.parse(fs.readFileSync('./crm-service-key.json', 'utf8'));
    } catch (err) {
        console.error('Error loading local credentials file:', err.message);
        throw new Error('GOOGLE_SHEETS_CREDENTIALS env variable or crm-service-key.json file required');
    }
}

const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = '1pnVbXjNrjs8t7HqUMk3PSAXRoJkOs4eBM_mr-bY9BXQ';
async function pullLeadsFromSheets() {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Sheet1!A:C' // Adjust if your sheet/tab name differs
        });
        const rows = res.data.values || [];
        if (rows.length <= 1) return;

        const agents = (await db.query('SELECT id FROM agents')).rows;
        const existingLeads = (await db.query('SELECT name, email, phone FROM leads')).rows;

        for (const row of rows.slice(1)) {
            const [name, email, phone] = row;
            if (!name) continue;

            const exists = existingLeads.some(lead => 
                lead.name === name && lead.email === email && lead.phone === phone
            );
            if (!exists) {
                lastAgentIndex = (lastAgentIndex + 1) % agents.length;
                const agentId = agents[lastAgentIndex].id;
                const leadResult = await db.query(
                    'INSERT INTO leads (name, email, phone, status, agent_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                    [name, email, phone, 'New', agentId]
                );
                const leadId = leadResult.rows[0].id;
                await db.query(
                    'INSERT INTO tasks (lead_id, description, due_date) VALUES ($1, $2, $3)',
                    [leadId, `Contact ${name}`, new Date().toISOString().split('T')[0]]
                );
                console.log(`Imported lead: ${name} assigned to agent ${agentId}`);
            }
        }
    } catch (err) {
        console.error('Error pulling leads from Google Sheets:', err.message);
    }
}

// Pull on startup and every 30 seconds
pullLeadsFromSheets();
setInterval(pullLeadsFromSheets, 30 * 1000);

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
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leads');

    worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Agent', key: 'agent_name', width: 20 }
    ];

    worksheet.addRows(result.rows);

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.columns.forEach(column => {
        column.width = column.width || 10;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=leads.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.get('/api/converted/export', async (req, res) => {
    const result = await db.query('SELECT c.*, a.name as agent_name FROM converted_leads c JOIN agents a ON c.agent_id = a.id');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Converted Leads');

    worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Lead ID', key: 'lead_id', width: 10 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Agent', key: 'agent_name', width: 20 },
        { header: 'Converted Date', key: 'converted_date', width: 20 }
    ];

    worksheet.addRows(result.rows);

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.columns.forEach(column => {
        column.width = column.width || 10;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=converted_leads.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

app.get('/api/unconverted/export', async (req, res) => {
    const result = await db.query('SELECT u.*, a.name as agent_name FROM unconverted_leads u JOIN agents a ON u.agent_id = a.id');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Unconverted Leads');

    worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Lead ID', key: 'lead_id', width: 10 },
        { header: 'Name', key: 'name', width: 20 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Agent', key: 'agent_name', width: 20 },
        { header: 'Contacted Date', key: 'contacted_date', width: 20 }
    ];

    worksheet.addRows(result.rows);

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.columns.forEach(column => {
        column.width = column.width || 10;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=unconverted_leads.xlsx');
    await workbook.xlsx.write(res);
    res.end();
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