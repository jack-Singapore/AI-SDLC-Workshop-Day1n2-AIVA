import Database from 'better-sqlite3';
import path from 'path';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

// Database file path (in project root)
const dbPath = path.join(process.cwd(), 'todos.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// TypeScript Interfaces
export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  public_key: string;
  counter: number;
  created_at: string;
}

export interface Todo {
  id: number;
  user_id: number;
  list_id: number | null;
  title: string;
  description: string | null;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface TodoTag {
  todo_id: number;
  tag_id: number;
}

export interface Template {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  subtasks_json: string | null;
  due_date_offset_days: number | null;
  created_at: string;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  created_at: string;
}

export interface List {
  id: number;
  user_id: number;
  name: string;
  icon: string;
  color: string;
  position: number;
  created_at: string;
}

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS authenticators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    list_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    completed BOOLEAN DEFAULT 0,
    due_date TEXT,
    priority TEXT DEFAULT 'medium',
    is_recurring BOOLEAN DEFAULT 0,
    recurrence_pattern TEXT,
    reminder_minutes INTEGER,
    last_notification_sent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    completed BOOLEAN DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS todo_tags (
    todo_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (todo_id, tag_id),
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    title_template TEXT NOT NULL,
    priority TEXT DEFAULT 'medium',
    is_recurring BOOLEAN DEFAULT 0,
    recurrence_pattern TEXT,
    reminder_minutes INTEGER,
    subtasks_json TEXT,
    due_date_offset_days INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📋',
    color TEXT DEFAULT '#3B82F6',
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migration: Add description column to todos table if it doesn't exist
try {
  db.exec(`ALTER TABLE todos ADD COLUMN description TEXT;`);
} catch (e) {
  // Column already exists
}

// Migration: Add updated_at column to todos table if it doesn't exist
try {
  db.exec(`ALTER TABLE todos ADD COLUMN updated_at TEXT;`);
  // Update existing rows to set updated_at = created_at
  db.exec(`UPDATE todos SET updated_at = created_at WHERE updated_at IS NULL;`);
} catch (e) {
  // Column already exists
}

// Migration: Add missing columns to templates table if they don't exist
try {
  db.exec(`ALTER TABLE templates ADD COLUMN description TEXT;`);
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE templates ADD COLUMN category TEXT;`);
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE templates ADD COLUMN is_recurring BOOLEAN DEFAULT 0;`);
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE templates ADD COLUMN recurrence_pattern TEXT;`);
} catch (e) {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE templates ADD COLUMN reminder_minutes INTEGER;`);
} catch (e) {
  // Column already exists
}
// Rename title to title_template if needed
try {
  const cols = db.pragma('table_info(templates)') as Array<{ name: string }>;
  const hasTitle = cols.some((c) => c.name === 'title');
  const hasTitleTemplate = cols.some((c) => c.name === 'title_template');
  if (hasTitle && !hasTitleTemplate) {
    db.exec(`ALTER TABLE templates RENAME COLUMN title TO title_template;`);
  }
} catch (e) {
  // Migration not needed
}

// Migration: Add list_id to todos table if it doesn't exist
try {
  db.exec(`ALTER TABLE todos ADD COLUMN list_id INTEGER REFERENCES lists(id) ON DELETE SET NULL;`);
} catch (e) {
  // Column already exists
}

// User Operations
export const userDB = {
  create(username: string): User {
    const stmt = db.prepare('INSERT INTO users (username) VALUES (?)');
    const result = stmt.run(username);
    return this.getById(Number(result.lastInsertRowid))!;
  },

  getById(id: number): User | undefined {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as User | undefined;
  },

  getByUsername(username: string): User | undefined {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username) as User | undefined;
  },
};

// Authenticator Operations
export const authenticatorDB = {
  create(authenticator: Omit<Authenticator, 'id' | 'created_at'>): Authenticator {
    const stmt = db.prepare(`
      INSERT INTO authenticators (user_id, credential_id, public_key, counter)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      authenticator.user_id,
      authenticator.credential_id,
      authenticator.public_key,
      authenticator.counter
    );
    return this.getById(Number(result.lastInsertRowid))!;
  },

  getById(id: number): Authenticator | undefined {
    const stmt = db.prepare('SELECT * FROM authenticators WHERE id = ?');
    return stmt.get(id) as Authenticator | undefined;
  },

  getByCredentialId(credentialId: string): Authenticator | undefined {
    const stmt = db.prepare('SELECT * FROM authenticators WHERE credential_id = ?');
    return stmt.get(credentialId) as Authenticator | undefined;
  },

  getByUserId(userId: number): Authenticator[] {
    const stmt = db.prepare('SELECT * FROM authenticators WHERE user_id = ?');
    return stmt.all(userId) as Authenticator[];
  },

  updateCounter(id: number, counter: number): void {
    const stmt = db.prepare('UPDATE authenticators SET counter = ? WHERE id = ?');
    stmt.run(counter, id);
  },
};

// Todo Operations
export const todoDB = {
  getAll(userId: number): Todo[] {
    const stmt = db.prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(userId) as Todo[];
  },

  getById(id: number, userId: number): Todo | undefined {
    const stmt = db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?');
    return stmt.get(id, userId) as Todo | undefined;
  },

  getByMonth(userId: number, month: string): Todo[] {
    const stmt = db.prepare(`
      SELECT * FROM todos 
      WHERE user_id = ? AND due_date LIKE ? 
      ORDER BY due_date
    `);
    return stmt.all(userId, `${month}%`) as Todo[];
  },

  create(todo: Omit<Todo, 'id' | 'created_at'>): Todo {
    const stmt = db.prepare(`
      INSERT INTO todos (
        user_id, list_id, title, description, completed, due_date, priority,
        is_recurring, recurrence_pattern, reminder_minutes, last_notification_sent, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      todo.user_id,
      todo.list_id,
      todo.title,
      todo.description,
      todo.completed ? 1 : 0,
      todo.due_date,
      todo.priority,
      todo.is_recurring ? 1 : 0,
      todo.recurrence_pattern,
      todo.reminder_minutes,
      todo.last_notification_sent,
      todo.updated_at
    );
    return this.getById(Number(result.lastInsertRowid), todo.user_id)!;
  },

  update(id: number, userId: number, updates: Partial<Omit<Todo, 'id' | 'user_id' | 'created_at'>>): Todo {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.completed !== undefined) {
      fields.push('completed = ?');
      values.push(updates.completed ? 1 : 0);
    }
    if (updates.due_date !== undefined) {
      fields.push('due_date = ?');
      values.push(updates.due_date);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.list_id !== undefined) {
      fields.push('list_id = ?');
      values.push(updates.list_id);
    }
    if (updates.is_recurring !== undefined) {
      fields.push('is_recurring = ?');
      values.push(updates.is_recurring ? 1 : 0);
    }
    if (updates.recurrence_pattern !== undefined) {
      fields.push('recurrence_pattern = ?');
      values.push(updates.recurrence_pattern);
    }
    if (updates.reminder_minutes !== undefined) {
      fields.push('reminder_minutes = ?');
      values.push(updates.reminder_minutes);
    }
    if (updates.last_notification_sent !== undefined) {
      fields.push('last_notification_sent = ?');
      values.push(updates.last_notification_sent);
    }

    if (fields.length === 0) {
      return this.getById(id, userId)!;
    }

    // Always update the updated_at timestamp
    fields.push('updated_at = datetime(\'now\')');

    values.push(id, userId);
    const stmt = db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`);
    stmt.run(...values);

    return this.getById(id, userId)!;
  },

  delete(id: number, userId: number): void {
    const stmt = db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?');
    stmt.run(id, userId);
  },
};

// Subtask Operations
export const subtaskDB = {
  getByTodoId(todoId: number): Subtask[] {
    const stmt = db.prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position');
    return stmt.all(todoId) as Subtask[];
  },

  create(subtask: Omit<Subtask, 'id' | 'created_at'>): Subtask {
    const stmt = db.prepare(`
      INSERT INTO subtasks (todo_id, title, completed, position)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      subtask.todo_id,
      subtask.title,
      subtask.completed ? 1 : 0,
      subtask.position
    );
    return this.getById(Number(result.lastInsertRowid))!;
  },

  getById(id: number): Subtask | undefined {
    const stmt = db.prepare('SELECT * FROM subtasks WHERE id = ?');
    return stmt.get(id) as Subtask | undefined;
  },

  update(id: number, updates: Partial<Omit<Subtask, 'id' | 'todo_id' | 'created_at'>>): Subtask {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.completed !== undefined) {
      fields.push('completed = ?');
      values.push(updates.completed ? 1 : 0);
    }
    if (updates.position !== undefined) {
      fields.push('position = ?');
      values.push(updates.position);
    }

    if (fields.length === 0) {
      return this.getById(id)!;
    }

    values.push(id);
    const stmt = db.prepare(`UPDATE subtasks SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.getById(id)!;
  },

  delete(id: number): void {
    const stmt = db.prepare('DELETE FROM subtasks WHERE id = ?');
    stmt.run(id);
  },
};

// Tag Operations
export const tagDB = {
  getAll(userId: number): Tag[] {
    const stmt = db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name');
    return stmt.all(userId) as Tag[];
  },

  getById(id: number, userId: number): Tag | undefined {
    const stmt = db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?');
    return stmt.get(id, userId) as Tag | undefined;
  },

  create(tag: Omit<Tag, 'id' | 'created_at'>): Tag {
    const stmt = db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)');
    const result = stmt.run(tag.user_id, tag.name, tag.color);
    return this.getById(Number(result.lastInsertRowid), tag.user_id)!;
  },

  update(id: number, userId: number, updates: Partial<Omit<Tag, 'id' | 'user_id' | 'created_at'>>): Tag {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }

    if (fields.length === 0) {
      return this.getById(id, userId)!;
    }

    values.push(id, userId);
    const stmt = db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`);
    stmt.run(...values);

    return this.getById(id, userId)!;
  },

  delete(id: number, userId: number): void {
    const stmt = db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?');
    stmt.run(id, userId);
  },
};

// TodoTag Operations (Many-to-Many)
export const todoTagDB = {
  getTagsForTodo(todoId: number): Tag[] {
    const stmt = db.prepare(`
      SELECT tags.* FROM tags
      INNER JOIN todo_tags ON tags.id = todo_tags.tag_id
      WHERE todo_tags.todo_id = ?
      ORDER BY tags.name
    `);
    return stmt.all(todoId) as Tag[];
  },

  getTodosForTag(tagId: number): number[] {
    const stmt = db.prepare('SELECT todo_id FROM todo_tags WHERE tag_id = ?');
    const results = stmt.all(tagId) as { todo_id: number }[];
    return results.map((r) => r.todo_id);
  },

  add(todoId: number, tagId: number): void {
    const stmt = db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
    stmt.run(todoId, tagId);
  },

  remove(todoId: number, tagId: number): void {
    const stmt = db.prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?');
    stmt.run(todoId, tagId);
  },

  removeAllForTodo(todoId: number): void {
    const stmt = db.prepare('DELETE FROM todo_tags WHERE todo_id = ?');
    stmt.run(todoId);
  },
};

// Template Operations
// Template Operations
export const templateDB = {
  getAll(userId: number): Template[] {
    const stmt = db.prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY name');
    return stmt.all(userId) as Template[];
  },

  getById(id: number, userId: number): Template | undefined {
    const stmt = db.prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?');
    return stmt.get(id, userId) as Template | undefined;
  },

  create(template: Omit<Template, 'id' | 'created_at'>): Template {
    const stmt = db.prepare(`
      INSERT INTO templates (
        user_id, name, description, category, title_template, priority,
        is_recurring, recurrence_pattern, reminder_minutes,
        subtasks_json, due_date_offset_days
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      template.user_id,
      template.name,
      template.description,
      template.category,
      template.title_template,
      template.priority,
      template.is_recurring ? 1 : 0,
      template.recurrence_pattern,
      template.reminder_minutes,
      template.subtasks_json,
      template.due_date_offset_days
    );
    return this.getById(Number(result.lastInsertRowid), template.user_id)!;
  },

  delete(id: number, userId: number): void {
    const stmt = db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?');
    stmt.run(id, userId);
  },
};

// Holiday Operations
export const holidayDB = {
  getAll(): Holiday[] {
    const stmt = db.prepare('SELECT * FROM holidays ORDER BY date');
    return stmt.all() as Holiday[];
  },

  getByMonth(month: string): Holiday[] {
    const stmt = db.prepare('SELECT * FROM holidays WHERE date LIKE ? ORDER BY date');
    return stmt.all(`${month}%`) as Holiday[];
  },

  getByDate(date: string): Holiday | undefined {
    const stmt = db.prepare('SELECT * FROM holidays WHERE date = ?');
    return stmt.get(date) as Holiday | undefined;
  },

  create(holiday: Omit<Holiday, 'id' | 'created_at'>): Holiday {
    const stmt = db.prepare('INSERT OR IGNORE INTO holidays (date, name) VALUES (?, ?)');
    stmt.run(holiday.date, holiday.name);
    return this.getByDate(holiday.date)!;
  },

  deleteAll(): void {
    const stmt = db.prepare('DELETE FROM holidays');
    stmt.run();
  },
};

// List Operations
export const listDB = {
  getAll(userId: number): List[] {
    const stmt = db.prepare('SELECT * FROM lists WHERE user_id = ? ORDER BY position, created_at');
    return stmt.all(userId) as List[];
  },

  getById(id: number, userId: number): List | undefined {
    const stmt = db.prepare('SELECT * FROM lists WHERE id = ? AND user_id = ?');
    return stmt.get(id, userId) as List | undefined;
  },

  create(list: Omit<List, 'id' | 'created_at'>): List {
    const stmt = db.prepare(`
      INSERT INTO lists (user_id, name, icon, color, position)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      list.user_id,
      list.name,
      list.icon,
      list.color,
      list.position
    );
    return this.getById(Number(result.lastInsertRowid), list.user_id)!;
  },

  update(id: number, userId: number, updates: Partial<Omit<List, 'id' | 'user_id' | 'created_at'>>): List {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.icon !== undefined) {
      fields.push('icon = ?');
      values.push(updates.icon);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    if (updates.position !== undefined) {
      fields.push('position = ?');
      values.push(updates.position);
    }

    if (fields.length === 0) {
      return this.getById(id, userId)!;
    }

    values.push(id, userId);
    const stmt = db.prepare(`UPDATE lists SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`);
    stmt.run(...values);
    return this.getById(id, userId)!;
  },

  delete(id: number, userId: number): void {
    const stmt = db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?');
    stmt.run(id, userId);
  },

  reorder(userId: number, listIds: number[]): void {
    const stmt = db.prepare('UPDATE lists SET position = ? WHERE id = ? AND user_id = ?');
    const transaction = db.transaction((ids: number[]) => {
      ids.forEach((id, index) => {
        stmt.run(index, id, userId);
      });
    });
    transaction(listIds);
  },
};

export default db;
