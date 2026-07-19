const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'doit.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let db;

// Initialize Database
async function initDb() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON');

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      project_id INTEGER,
      priority TEXT CHECK(priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
      due_date TEXT,
      reminder_time TEXT,
      status TEXT CHECK(status IN ('pending', 'completed')) DEFAULT 'pending',
      recurring TEXT CHECK(recurring IN ('none', 'daily', 'weekly', 'monthly')) DEFAULT 'none',
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id INTEGER,
      tag_id INTEGER,
      PRIMARY KEY (task_id, tag_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default projects if empty
  const projectCount = await db.get('SELECT COUNT(*) as count FROM projects');
  if (projectCount.count === 0) {
    await db.run("INSERT INTO projects (name, color) VALUES ('Inbox', '#3b82f6')");
    await db.run("INSERT INTO projects (name, color) VALUES ('Personal', '#10b981')");
    await db.run("INSERT INTO projects (name, color) VALUES ('Work', '#f59e0b')");
  }

  // Seed default settings if empty
  const settingsCount = await db.get('SELECT COUNT(*) as count FROM settings');
  if (settingsCount.count === 0) {
    await db.run("INSERT INTO settings (key, value) VALUES ('theme', 'dark')");
  }

  console.log('Database initialized successfully.');
}

// Helper to calculate the next recurring due date
function getNextRecurringDate(currentDateStr, recurrence) {
  if (!currentDateStr || recurrence === 'none') return null;
  const current = new Date(currentDateStr);
  if (isNaN(current.getTime())) return null;

  switch (recurrence) {
    case 'daily':
      current.setDate(current.getDate() + 1);
      break;
    case 'weekly':
      current.setDate(current.getDate() + 7);
      break;
    case 'monthly':
      current.setMonth(current.getMonth() + 1);
      break;
    default:
      return null;
  }
  return current.toISOString().split('T')[0];
}

// --- API ROUTES ---

// Projects API
app.get('/api/projects', async (req, res) => {
  try {
    const query = `
      SELECT p.*,
             COUNT(t.id) as total_tasks,
             SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      GROUP BY p.id
      ORDER BY p.name ASC
    `;
    const projects = await db.all(query);
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', async (req, res) => {
  const { name, color } = req.body;
  if (!name || !color) return res.status(400).json({ error: 'Name and color are required.' });

  try {
    const result = await db.run('INSERT INTO projects (name, color) VALUES (?, ?)', [name, color]);
    const newProj = await db.get('SELECT * FROM projects WHERE id = ?', [result.lastID]);
    res.status(201).json(newProj);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Project name already exists.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Check if it's the last remaining project, we shouldn't allow deleting all projects
    const countResult = await db.get('SELECT COUNT(*) as count FROM projects');
    if (countResult.count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining project.' });
    }

    await db.run('DELETE FROM projects WHERE id = ?', [id]);
    res.json({ message: 'Project deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tasks API
app.get('/api/tasks', async (req, res) => {
  const { list, projectId, tagId, search } = req.query;
  try {
    let query = `
      SELECT t.*, p.name as project_name, p.color as project_color,
             GROUP_CONCAT(tg.name, ',') as tags_csv
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
    `;
    const params = [];
    const conditions = [];

    // Filters
    if (projectId) {
      conditions.push('t.project_id = ?');
      params.push(projectId);
    }
    if (tagId) {
      conditions.push('t.id IN (SELECT task_id FROM task_tags WHERE tag_id = ?)');
      params.push(tagId);
    }
    if (search) {
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
      const match = `%${search}%`;
      params.push(match, match);
    }

    // List filters (Today, Upcoming, Overdue, Completed)
    const todayStr = new Date().toISOString().split('T')[0];
    if (list === 'today') {
      conditions.push("t.due_date = ? AND t.status = 'pending'");
      params.push(todayStr);
    } else if (list === 'upcoming') {
      conditions.push("t.due_date > ? AND t.status = 'pending'");
      params.push(todayStr);
    } else if (list === 'overdue') {
      conditions.push("t.due_date < ? AND t.status = 'pending'");
      params.push(todayStr);
    } else if (list === 'completed') {
      conditions.push("t.status = 'completed'");
    } else if (list === 'pending') {
      conditions.push("t.status = 'pending'");
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY t.id ORDER BY t.order_index ASC, t.created_at DESC';

    const tasks = await db.all(query, params);
    
    // Parse tags CSV into an array
    const formattedTasks = tasks.map(task => {
      task.tags = task.tags_csv ? task.tags_csv.split(',') : [];
      delete task.tags_csv;
      return task;
    });

    res.json(formattedTasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { title, project_id, priority, due_date, reminder_time } = req.body;
  if (!title) return res.status(400).json({ error: 'Task title is required.' });

  try {
    // Get max order_index to append
    const maxOrder = await db.get('SELECT MAX(order_index) as max_order FROM tasks');
    const orderIndex = (maxOrder.max_order || 0) + 1;

    const result = await db.run(`
      INSERT INTO tasks (title, project_id, priority, due_date, reminder_time, order_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [title, project_id || null, priority || 'medium', due_date || null, reminder_time || null, orderIndex]);

    const newTask = await db.get('SELECT * FROM tasks WHERE id = ?', [result.lastID]);
    newTask.tags = [];
    res.status(201).json(newTask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/reorder', async (req, res) => {
  const { reorders } = req.body; // Array of { id, order_index }
  if (!Array.isArray(reorders)) return res.status(400).json({ error: 'Invalid reorders data format.' });

  try {
    await db.run('BEGIN TRANSACTION');
    for (const item of reorders) {
      await db.run('UPDATE tasks SET order_index = ? WHERE id = ?', [item.order_index, item.id]);
    }
    await db.run('COMMIT');
    res.json({ message: 'Tasks reordered successfully.' });
  } catch (err) {
    await db.run('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, project_id, priority, due_date, reminder_time, status, recurring, tags } = req.body;

  try {
    // Retrieve current state of task
    const oldTask = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!oldTask) return res.status(404).json({ error: 'Task not found.' });

    let newStatus = status || oldTask.status;
    let newDueDate = due_date !== undefined ? due_date : oldTask.due_date;
    const taskRecurrence = recurring || oldTask.recurring;

    // Handle completed logic for recurring tasks
    if (status === 'completed' && oldTask.status === 'pending' && taskRecurrence !== 'none') {
      const nextDate = getNextRecurringDate(oldTask.due_date || new Date().toISOString().split('T')[0], taskRecurrence);
      
      if (nextDate) {
        // 1. Create a duplicate completed task record (without recurrence, marked completed)
        const dupResult = await db.run(`
          INSERT INTO tasks (title, description, project_id, priority, due_date, reminder_time, status, recurring)
          VALUES (?, ?, ?, ?, ?, ?, 'completed', 'none')
        `, [
          title || oldTask.title,
          description !== undefined ? description : oldTask.description,
          project_id !== undefined ? project_id : oldTask.project_id,
          priority || oldTask.priority,
          oldTask.due_date,
          oldTask.reminder_time,
        ]);
        
        // Link duplicate task tags
        const oldTags = await db.all('SELECT tag_id FROM task_tags WHERE task_id = ?', [id]);
        for (const t of oldTags) {
          await db.run('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)', [dupResult.lastID, t.tag_id]);
        }

        // 2. Set the current task to remain 'pending' but advance the due date to the next occurrence
        newStatus = 'pending';
        newDueDate = nextDate;
      }
    }

    // Update main task details
    await db.run(`
      UPDATE tasks
      SET title = ?,
          description = ?,
          project_id = ?,
          priority = ?,
          due_date = ?,
          reminder_time = ?,
          status = ?,
          recurring = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title !== undefined ? title : oldTask.title,
      description !== undefined ? description : oldTask.description,
      project_id !== undefined ? project_id : oldTask.project_id,
      priority !== undefined ? priority : oldTask.priority,
      newDueDate,
      reminder_time !== undefined ? reminder_time : oldTask.reminder_time,
      newStatus,
      taskRecurrence,
      id
    ]);

    // Handle Tags update if tags array is provided
    if (Array.isArray(tags)) {
      // Remove existing tags association
      await db.run('DELETE FROM task_tags WHERE task_id = ?', [id]);

      for (const tagName of tags) {
        const trimmed = tagName.trim();
        if (!trimmed) continue;

        // Ensure tag exists in tags table
        await db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [trimmed]);
        const tagRecord = await db.get('SELECT id FROM tags WHERE name = ?', [trimmed]);
        
        // Link task and tag
        await db.run('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)', [id, tagRecord.id]);
      }
      
      // Clean up orphaned tags
      await db.run(`
        DELETE FROM tags 
        WHERE id NOT IN (SELECT DISTINCT tag_id FROM task_tags)
      `);
    }

    // Get the updated task and its tags
    const updatedTask = await db.get(`
      SELECT t.*, p.name as project_name, p.color as project_color,
             GROUP_CONCAT(tg.name, ',') as tags_csv
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
      WHERE t.id = ?
      GROUP BY t.id
    `, [id]);

    updatedTask.tags = updatedTask.tags_csv ? updatedTask.tags_csv.split(',') : [];
    delete updatedTask.tags_csv;

    res.json(updatedTask);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM tasks WHERE id = ?', [id]);
    
    // Clean up orphaned tags
    await db.run(`
      DELETE FROM tags 
      WHERE id NOT IN (SELECT DISTINCT tag_id FROM task_tags)
    `);

    res.json({ message: 'Task deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tags API
app.get('/api/tags', async (req, res) => {
  try {
    const tags = await db.all('SELECT * FROM tags ORDER BY name ASC');
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings API
app.get('/api/settings', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) return res.status(400).json({ error: 'Key and value are required.' });

  try {
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
    res.json({ success: true, key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Express Server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`DOIT server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database/server:', err);
});
