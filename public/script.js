document.addEventListener('DOMContentLoaded', () => {
    const leadsTable = document.getElementById('leadsTable');
    const leadForm = document.getElementById('leadForm');
    const editForm = document.getElementById('editForm');
    const cancelEdit = document.getElementById('cancelEdit');
    const tasksTable = document.getElementById('tasksTable');
    const taskForm = document.getElementById('taskForm');
    const cancelTask = document.getElementById('cancelTask');
    const summary = document.getElementById('summary');

    function loadSummary() {
        fetch('/api/leads')
            .then(response => response.json())
            .then(leads => {
                const agentCounts = {};
                leads.forEach(lead => {
                    const agent = lead.agent_name || 'Unassigned';
                    agentCounts[agent] = (agentCounts[agent] || 0) + 1;
                });
                summary.innerHTML = '<h3>Lead Summary</h3>' + 
                    Object.entries(agentCounts).map(([agent, count]) => `${agent}: ${count} leads`).join('<br>');
            });
    }

    function loadLeads() {
        leadsTable.innerHTML = '';
        fetch('/api/leads')
            .then(response => response.json())
            .then(leads => {
                leads.forEach(lead => {
                    const tr = document.createElement('tr');
                    tr.className = `agent-${lead.agent_id || 'unassigned'}`;
                    let statusColor = lead.status === 'New' ? 'background-color: #ffeb3b;' :
                                     lead.status === 'Contacted' ? 'background-color: #2196F3; color: white;' :
                                     'background-color: #4CAF50; color: white;';
                    tr.innerHTML = `
                        <td>${lead.name}</td>
                        <td>${lead.email}</td>
                        <td>${lead.phone}</td>
                        <td style="${statusColor}">${lead.status}</td>
                        <td>${lead.agent_name || 'Unassigned'}</td>
                        <td>
                            <button onclick="editLead(${JSON.stringify(lead)})">Edit</button>
                            <button onclick="deleteLead(${lead.id})">Delete</button>
                            <button onclick="addTask(${lead.id}, '${lead.name}')">Add Task</button>
                        </td>
                    `;
                    leadsTable.appendChild(tr);
                });
            });
    }

    function loadTasks() {
        tasksTable.innerHTML = '';
        fetch('/api/leads')
            .then(response => response.json())
            .then(leads => {
                leads.forEach(lead => {
                    fetch(`/api/leads/${lead.id}/tasks`)
                        .then(response => response.json())
                        .then(tasks => {
                            tasks.forEach(task => {
                                const tr = document.createElement('tr');
                                tr.className = task.outcome === 'Converted' ? 'converted' :
                                              task.outcome === 'Unconverted' ? 'unconverted' : '';
                                tr.innerHTML = `
                                    <td>${lead.name}</td>
                                    <td>${task.description}</td>
                                    <td>${task.due_date}</td>
                                    <td>${task.outcome}</td>
                                    <td>
                                        <button onclick="updateTask(${task.id}, 'Converted')">Converted</button>
                                        <button onclick="updateTask(${task.id}, 'Unconverted')">Unconverted</button>
                                        <button onclick="updateTask(${task.id}, 'Not Reached')">Not Reached</button>
                                    </td>
                                `;
                                tasksTable.appendChild(tr);
                            });
                        });
                });
            });
    }

    leadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const lead = {
            name: formData.get('name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            status: formData.get('status')
        };
        fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lead)
        })
        .then(response => response.json())
        .then(() => {
            loadLeads();
            loadTasks();
            loadSummary();
            e.target.reset();
        });
    });

    window.editLead = function(lead) {
        editForm.style.display = 'block';
        leadForm.style.display = 'none';
        taskForm.style.display = 'none';
        editForm.id.value = lead.id;
        editForm.name.value = lead.name;
        editForm.email.value = lead.email;
        editForm.phone.value = lead.phone;
        editForm.status.value = lead.status;
    };

    editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const lead = {
            name: formData.get('name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            status: formData.get('status')
        };
        const id = formData.get('id');
        fetch(`/api/leads/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lead)
        })
        .then(response => response.json())
        .then(() => {
            loadLeads();
            loadSummary();
            editForm.style.display = 'none';
            leadForm.style.display = 'block';
        });
    });

    cancelEdit.addEventListener('click', () => {
        editForm.style.display = 'none';
        leadForm.style.display = 'block';
    });

    window.deleteLead = function(id) {
        if (confirm('Are you sure you want to delete this lead?')) {
            fetch(`/api/leads/${id}`, { method: 'DELETE' })
            .then(response => response.json())
            .then(() => {
                loadLeads();
                loadTasks();
                loadSummary();
            });
        }
    };

    window.addTask = function(leadId, leadName) {
        taskForm.style.display = 'block';
        leadForm.style.display = 'none';
        editForm.style.display = 'none';
        taskForm.lead_id.value = leadId;
        taskForm.description.placeholder = `Task for ${leadName}`;
    };

    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const task = {
            description: formData.get('description'),
            due_date: formData.get('due_date')
        };
        const leadId = formData.get('lead_id');
        fetch(`/api/leads/${leadId}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(task)
        })
        .then(response => response.json())
        .then(() => {
            loadTasks();
            taskForm.style.display = 'none';
            leadForm.style.display = 'block';
            e.target.reset();
        });
    });

    cancelTask.addEventListener('click', () => {
        taskForm.style.display = 'none';
        leadForm.style.display = 'block';
    });

    window.updateTask = function(taskId, outcome) {
        fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome })
        })
        .then(response => response.json())
        .then(() => {
            loadTasks();
            loadSummary();
        });
    };

    window.searchLeads = function() {
        const searchValue = document.getElementById('searchInput').value.toLowerCase();
        leadsTable.innerHTML = '';
        fetch('/api/leads')
            .then(response => response.json())
            .then(leads => {
                const filteredLeads = leads.filter(lead =>
                    lead.name.toLowerCase().includes(searchValue) ||
                    lead.email.toLowerCase().includes(searchValue) ||
                    lead.status.toLowerCase().includes(searchValue)
                );
                filteredLeads.forEach(lead => {
                    const tr = document.createElement('tr');
                    tr.className = `agent-${lead.agent_id || 'unassigned'}`;
                    let statusColor = lead.status === 'New' ? 'background-color: #ffeb3b;' :
                                     lead.status === 'Contacted' ? 'background-color: #2196F3; color: white;' :
                                     'background-color: #4CAF50; color: white;';
                    tr.innerHTML = `
                        <td>${lead.name}</td>
                        <td>${lead.email}</td>
                        <td>${lead.phone}</td>
                        <td style="${statusColor}">${lead.status}</td>
                        <td>${lead.agent_name || 'Unassigned'}</td>
                        <td>
                            <button onclick="editLead(${JSON.stringify(lead)})">Edit</button>
                            <button onclick="deleteLead(${lead.id})">Delete</button>
                            <button onclick="addTask(${lead.id}, '${lead.name}')">Add Task</button>
                        </td>
                    `;
                    leadsTable.appendChild(tr);
                });
            });
    };

    loadLeads();
    loadTasks();
    loadSummary();
});