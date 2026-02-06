# Feature 01: Todo CRUD Operations

## Feature Overview

Implement core Create, Read, Update, Delete (CRUD) operations for todo items with Singapore timezone support, proper validation, and a responsive UI that organizes todos into Overdue, Active, and Completed sections.

## User Stories

**As a user**, I want to:
- Create new todos with just a title or with full metadata (priority, due date, recurrence, reminders)
- View all my todos organized by status (Overdue, Active, Completed)
- Edit existing todos to update title, due date, priority, or other settings
- Mark todos as complete or incomplete with a checkbox
- Delete todos I no longer need
- See validation errors if I enter invalid data
- Have all dates in Singapore timezone

## User Flow

### Create Todo Flow
1. User types todo title in the "Add new todo" input field
2. User optionally sets priority, due date, recurrence pattern, and reminder
3. User clicks "Add" button
4. System validates:
   - Title is not empty (after trimming whitespace)
   - Due date is in the future (minimum 1 minute from now)
   - All fields match expected types/formats
5. Todo appears immediately in the Active section
6. Input field clears for next entry

### View Todos Flow
1. User opens the app
2. Todos are displayed in three sections:
   - **Overdue**: Incomplete todos with due dates in the past (sorted by due date, earliest first)
   - **Active**: Incomplete todos without due dates or with future due dates (sorted by priority, then due date)
   - **Completed**: All completed todos (sorted by completion date, most recent first)
3. Each todo displays: title, priority badge, due date, recurring indicator, reminder badge, and tags

### Edit Todo Flow
1. User clicks edit icon/button on a todo
2. Modal or inline form opens with current values pre-filled
3. User modifies desired fields
4. User clicks "Save"
5. System validates changes
6. Todo updates in place with new values
7. If due date changes, todo may move between sections

### Toggle Completion Flow
1. User clicks checkbox next to todo
2. Todo completion status toggles
3. If marking complete:
   - Todo moves to Completed section
   - If recurring, new instance is created (see Feature 03)
4. If marking incomplete:
   - Todo moves back to Active or Overdue section based on due date

### Delete Todo Flow
1. User clicks delete icon/button
2. Confirmation dialog appears: "Are you sure you want to delete this todo?"
3. User confirms
4. Todo is removed from database and UI
5. Associated subtasks and tag relationships are also deleted (CASCADE)

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  last_notification_sent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
```

### TypeScript Types

```typescript
// lib/db.ts
export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly' | null;

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  priority: Priority;
  due_date: string | null; // ISO 8601 string in Singapore timezone
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  completed_at: string | null;
}
```

### API Endpoints

#### POST /api/todos - Create Todo
**Request Body:**
```typescript
{
  title: string;             // Required, non-empty after trim
  priority?: Priority;       // Optional, defaults to 'medium'
  due_date?: string;         // Optional, ISO 8601 in Singapore timezone
  is_recurring?: boolean;    // Optional, defaults to false
  recurrence_pattern?: RecurrencePattern; // Required if is_recurring is true
  reminder_minutes?: number; // Optional, one of: 15, 30, 60, 120, 1440, 2880, 10080
}
```

**Response:**
```typescript
{
  id: number;
  title: string;
  completed: boolean;
  priority: Priority;
  due_date: string | null;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
  last_notification_sent: null;
  created_at: string;
  completed_at: null;
}
```

**Status Codes:**
- 201: Todo created successfully
- 400: Invalid input (title empty, past due date, invalid priority, etc.)
- 401: Not authenticated
- 500: Server error

#### GET /api/todos - List All Todos
**Response:**
```typescript
{
  todos: Todo[];
}
```

**Status Codes:**
- 200: Success
- 401: Not authenticated
- 500: Server error

#### GET /api/todos/[id] - Get Single Todo
**Response:**
```typescript
{
  todo: Todo;
}
```

**Status Codes:**
- 200: Success
- 401: Not authenticated
- 404: Todo not found or doesn't belong to user
- 500: Server error

#### PUT /api/todos/[id] - Update Todo
**Request Body:** (All fields optional)
```typescript
{
  title?: string;
  completed?: boolean;
  priority?: Priority;
  due_date?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  reminder_minutes?: number | null;
}
```

**Response:**
```typescript
{
  todo: Todo;
}
```

**Special Behavior:**
- When `completed` changes from `false` to `true` on a recurring todo, create next instance
- When `completed` changes to `true`, set `completed_at` to current Singapore time
- When `completed` changes to `false`, set `completed_at` to null

**Status Codes:**
- 200: Updated successfully
- 400: Invalid input
- 401: Not authenticated
- 404: Todo not found
- 500: Server error

#### DELETE /api/todos/[id] - Delete Todo
**Response:**
```typescript
{
  message: "Todo deleted successfully"
}
```

**Status Codes:**
- 200: Deleted successfully
- 401: Not authenticated
- 404: Todo not found
- 500: Server error

### Validation Rules

```typescript
// lib/validation.ts
export function validateTodoTitle(title: string): { valid: boolean; error?: string } {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Title cannot be empty' };
  }
  if (trimmed.length > 500) {
    return { valid: false, error: 'Title cannot exceed 500 characters' };
  }
  return { valid: true };
}

export function validateDueDate(due_date: string | null): { valid: boolean; error?: string } {
  if (due_date === null) return { valid: true };
  
  const dueDate = new Date(due_date);
  const now = getSingaporeNow(); // from lib/timezone.ts
  
  // Due date must be at least 1 minute in the future
  const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);
  
  if (dueDate < oneMinuteFromNow) {
    return { valid: false, error: 'Due date must be at least 1 minute in the future' };
  }
  
  return { valid: true };
}

export function validatePriority(priority: string): { valid: boolean; error?: string } {
  const validPriorities: Priority[] = ['high', 'medium', 'low'];
  if (!validPriorities.includes(priority as Priority)) {
    return { valid: false, error: 'Priority must be high, medium, or low' };
  }
  return { valid: true };
}
```

### Singapore Timezone Handling

**CRITICAL**: All date/time operations MUST use `lib/timezone.ts`:

```typescript
import { getSingaporeNow, formatSingaporeDate, formatSingaporeDateLong } from '@/lib/timezone';

// Creating todos - use current Singapore time
const now = getSingaporeNow(); // NOT new Date()
const created_at = now.toISOString();

// Validating due dates - compare against Singapore time
const nowSG = getSingaporeNow();
const dueDate = new Date(due_date);
if (dueDate < nowSG) {
  throw new Error('Due date is in the past');
}

// Displaying dates - format in Singapore timezone
const displayDate = formatSingaporeDate(todo.due_date); // "Feb 6, 2026"
const fullDate = formatSingaporeDateLong(todo.due_date); // "February 6, 2026 at 2:30 PM"
```

## UI Components

### TodoForm Component
```typescript
// components/TodoForm.tsx
'use client';

import { useState } from 'react';
import { Priority } from '@/lib/db';

export function TodoForm({ onSubmit }: { onSubmit: (todo: TodoInput) => void }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      priority,
      due_date: dueDate || null,
    });
    setTitle('');
    setDueDate('');
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add new todo"
        className="w-full px-4 py-2 border rounded"
        data-testid="todo-title-input"
        required
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as Priority)}
        className="px-4 py-2 border rounded"
        data-testid="todo-priority-select"
      >
        <option value="low">Low Priority</option>
        <option value="medium">Medium Priority</option>
        <option value="high">High Priority</option>
      </select>
      <input
        type="datetime-local"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="px-4 py-2 border rounded"
        data-testid="todo-due-date-input"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded"
        data-testid="add-todo-button"
      >
        Add Todo
      </button>
    </form>
  );
}
```

### TodoList Component
```typescript
// components/TodoList.tsx
'use client';

import { Todo } from '@/lib/db';
import { TodoItem } from './TodoItem';

export function TodoList({ 
  todos, 
  onToggle, 
  onDelete, 
  onEdit 
}: {
  todos: Todo[];
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number, updates: Partial<Todo>) => void;
}) {
  // Categorize todos
  const overdue = todos.filter(t => !t.completed && t.due_date && new Date(t.due_date) < new Date());
  const active = todos.filter(t => !t.completed && (!t.due_date || new Date(t.due_date) >= new Date()));
  const completed = todos.filter(t => t.completed);
  
  return (
    <div className="space-y-8">
      {overdue.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-red-600 mb-4">Overdue ({overdue.length})</h2>
          <div className="space-y-2">
            {overdue.map(todo => (
              <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
            ))}
          </div>
        </section>
      )}
      
      {active.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4">Active ({active.length})</h2>
          <div className="space-y-2">
            {active.map(todo => (
              <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
            ))}
          </div>
        </section>
      )}
      
      {completed.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-gray-500 mb-4">Completed ({completed.length})</h2>
          <div className="space-y-2">
            {completed.map(todo => (
              <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

### TodoItem Component
```typescript
// components/TodoItem.tsx
'use client';

import { Todo } from '@/lib/db';
import { formatSingaporeDate } from '@/lib/timezone';

export function TodoItem({ 
  todo, 
  onToggle, 
  onDelete, 
  onEdit 
}: {
  todo: Todo;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onEdit: (id: number, updates: Partial<Todo>) => void;
}) {
  const priorityColors = {
    high: 'bg-red-500',
    medium: 'bg-yellow-500',
    low: 'bg-blue-500',
  };
  
  return (
    <div className="flex items-center gap-4 p-4 bg-white border rounded shadow-sm" data-testid="todo-item">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
        className="w-5 h-5"
        data-testid={`todo-checkbox-${todo.id}`}
      />
      
      <div className="flex-1">
        <h3 className={`font-medium ${todo.completed ? 'line-through text-gray-500' : ''}`}>
          {todo.title}
        </h3>
        {todo.due_date && (
          <p className="text-sm text-gray-600">
            Due: {formatSingaporeDate(todo.due_date)}
          </p>
        )}
      </div>
      
      <span className={`px-2 py-1 text-xs text-white rounded ${priorityColors[todo.priority]}`}>
        {todo.priority.toUpperCase()}
      </span>
      
      <button
        onClick={() => onEdit(todo.id, {})}
        className="px-3 py-1 text-blue-600 hover:bg-blue-50 rounded"
        data-testid={`edit-todo-${todo.id}`}
      >
        Edit
      </button>
      
      <button
        onClick={() => {
          if (confirm('Are you sure you want to delete this todo?')) {
            onDelete(todo.id);
          }
        }}
        className="px-3 py-1 text-red-600 hover:bg-red-50 rounded"
        data-testid={`delete-todo-${todo.id}`}
      >
        Delete
      </button>
    </div>
  );
}
```

## Edge Cases

### 1. Empty Title
- **Scenario**: User tries to create/update todo with empty or whitespace-only title
- **Handling**: Trim title, return 400 error if empty after trimming
- **Error Message**: "Title cannot be empty"

### 2. Past Due Date
- **Scenario**: User sets due date in the past or less than 1 minute in the future
- **Handling**: Validate due date against Singapore current time + 1 minute
- **Error Message**: "Due date must be at least 1 minute in the future"

### 3. Invalid Priority
- **Scenario**: API receives priority value other than 'high', 'medium', 'low'
- **Handling**: Return 400 error
- **Error Message**: "Priority must be high, medium, or low"

### 4. Todo Not Found
- **Scenario**: User tries to update/delete todo that doesn't exist or belongs to another user
- **Handling**: Return 404 error
- **Error Message**: "Todo not found"

### 5. Timezone Misalignment
- **Scenario**: User in different timezone creates todo
- **Handling**: Always convert to Singapore timezone using `getSingaporeNow()`
- **Display**: Format all dates in Singapore timezone for consistency

### 6. Concurrent Updates
- **Scenario**: Two requests try to update same todo simultaneously
- **Handling**: SQLite handles this with transactions; last write wins
- **Mitigation**: Client should refresh after update to get latest state

### 7. Very Long Title
- **Scenario**: User enters title > 500 characters
- **Handling**: Return 400 error
- **Error Message**: "Title cannot exceed 500 characters"

### 8. Delete with Dependencies
- **Scenario**: Delete todo that has subtasks and tag associations
- **Handling**: CASCADE delete configured in database removes all related records
- **Confirmation**: Show deletion confirmation dialog

## Acceptance Criteria

### Must Have
- ✅ Can create todo with just title (all other fields optional)
- ✅ Can create todo with all metadata fields (priority, due date, recurrence, reminder)
- ✅ Title is trimmed and validated as non-empty
- ✅ Due date validated to be in future (Singapore timezone)
- ✅ Priority defaults to 'medium' if not specified
- ✅ Todos display in three sections: Overdue, Active, Completed
- ✅ Can toggle completion status with checkbox
- ✅ Completed todos show strike-through text
- ✅ Can edit all todo fields
- ✅ Can delete todo with confirmation
- ✅ Deletion cascades to subtasks and tag associations
- ✅ All dates use Singapore timezone
- ✅ Error messages are clear and actionable

### Should Have
- ⚠️ Optimistic UI updates (update UI before API response)
- ⚠️ Loading states during API calls
- ⚠️ Undo delete functionality
- ⚠️ Keyboard shortcuts (Enter to add, Escape to cancel edit)

### Nice to Have
- ❌ Drag-and-drop reordering
- ❌ Bulk operations (select multiple, delete multiple)
- ❌ Archived todos (soft delete)
- ❌ Todo history/audit log

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/01-todo-crud.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Todo CRUD Operations', () => {
  test('should create todo with title only', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="todo-title-input"]', 'Buy groceries');
    await page.click('[data-testid="add-todo-button"]');
    
    await expect(page.locator('text=Buy groceries')).toBeVisible();
  });
  
  test('should create todo with all metadata', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="todo-title-input"]', 'Complete project');
    await page.selectOption('[data-testid="todo-priority-select"]', 'high');
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.fill('[data-testid="todo-due-date-input"]', tomorrow.toISOString().slice(0, 16));
    
    await page.click('[data-testid="add-todo-button"]');
    
    await expect(page.locator('text=Complete project')).toBeVisible();
    await expect(page.locator('text=HIGH')).toBeVisible();
  });
  
  test('should reject past due date', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="todo-title-input"]', 'Old task');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await page.fill('[data-testid="todo-due-date-input"]', yesterday.toISOString().slice(0, 16));
    
    await page.click('[data-testid="add-todo-button"]');
    
    await expect(page.locator('text=Due date must be at least 1 minute in the future')).toBeVisible();
  });
  
  test('should toggle todo completion', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="todo-title-input"]', 'Test completion');
    await page.click('[data-testid="add-todo-button"]');
    
    const checkbox = page.locator('[data-testid^="todo-checkbox-"]').first();
    await checkbox.check();
    
    await expect(page.locator('text=Completed')).toBeVisible();
    await expect(page.locator('text=Test completion').locator('..')).toHaveClass(/line-through/);
  });
  
  test('should edit todo', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="todo-title-input"]', 'Original title');
    await page.click('[data-testid="add-todo-button"]');
    
    await page.click('[data-testid^="edit-todo-"]').first();
    await page.fill('[data-testid="edit-title-input"]', 'Updated title');
    await page.click('[data-testid="save-edit-button"]');
    
    await expect(page.locator('text=Updated title')).toBeVisible();
    await expect(page.locator('text=Original title')).not.toBeVisible();
  });
  
  test('should delete todo with confirmation', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="todo-title-input"]', 'Delete me');
    await page.click('[data-testid="add-todo-button"]');
    
    page.on('dialog', dialog => dialog.accept());
    await page.click('[data-testid^="delete-todo-"]').first();
    
    await expect(page.locator('text=Delete me')).not.toBeVisible();
  });
});
```

### Unit Tests

```typescript
// tests/validation.test.ts
import { validateTodoTitle, validateDueDate, validatePriority } from '@/lib/validation';
import { getSingaporeNow } from '@/lib/timezone';

describe('Todo Validation', () => {
  describe('validateTodoTitle', () => {
    it('should accept non-empty title', () => {
      expect(validateTodoTitle('Valid title').valid).toBe(true);
    });
    
    it('should reject empty title', () => {
      const result = validateTodoTitle('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Title cannot be empty');
    });
    
    it('should reject whitespace-only title', () => {
      const result = validateTodoTitle('   ');
      expect(result.valid).toBe(false);
    });
    
    it('should reject title over 500 characters', () => {
      const longTitle = 'a'.repeat(501);
      const result = validateTodoTitle(longTitle);
      expect(result.valid).toBe(false);
    });
  });
  
  describe('validateDueDate', () => {
    it('should accept null due date', () => {
      expect(validateDueDate(null).valid).toBe(true);
    });
    
    it('should accept future date', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(validateDueDate(tomorrow.toISOString()).valid).toBe(true);
    });
    
    it('should reject past date', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = validateDueDate(yesterday.toISOString());
      expect(result.valid).toBe(false);
    });
    
    it('should reject date less than 1 minute in future', () => {
      const now = getSingaporeNow();
      const thirtySecondsLater = new Date(now.getTime() + 30 * 1000);
      const result = validateDueDate(thirtySecondsLater.toISOString());
      expect(result.valid).toBe(false);
    });
  });
  
  describe('validatePriority', () => {
    it('should accept high priority', () => {
      expect(validatePriority('high').valid).toBe(true);
    });
    
    it('should accept medium priority', () => {
      expect(validatePriority('medium').valid).toBe(true);
    });
    
    it('should accept low priority', () => {
      expect(validatePriority('low').valid).toBe(true);
    });
    
    it('should reject invalid priority', () => {
      const result = validatePriority('urgent');
      expect(result.valid).toBe(false);
    });
  });
});
```

## Out of Scope

The following features are NOT part of this CRUD implementation:
- Drag-and-drop reordering (may be added in future)
- Bulk operations (select/delete multiple todos)
- Undo/redo functionality
- Todo templates (covered in Feature 07)
- Subtasks (covered in Feature 05)
- Tags (covered in Feature 06)
- Recurring logic (covered in Feature 03)
- Reminders (covered in Feature 04)
- Calendar view (covered in Feature 10)
- Export/import (covered in Feature 09)
- Real-time collaboration
- Offline support

## Success Metrics

### Functional Metrics
- ✅ User can create todo in < 3 clicks
- ✅ Todo appears in UI within 500ms of creation
- ✅ 100% of CRUD operations work on first attempt
- ✅ Zero data loss on delete (CASCADE configured correctly)
- ✅ All dates display in Singapore timezone

### Technical Metrics
- ✅ API response time < 300ms (average)
- ✅ Database queries use prepared statements (SQL injection safe)
- ✅ All E2E tests passing (6 core CRUD tests)
- ✅ Unit test coverage > 80% for validation functions
- ✅ TypeScript strict mode with zero errors

### User Experience Metrics
- ✅ Clear error messages for all validation failures
- ✅ Confirmation dialog prevents accidental deletions
- ✅ Todo sections clearly labeled (Overdue, Active, Completed)
- ✅ Priority badges color-coded and visible

## Implementation Checklist

- [ ] Database schema created with indexes
- [ ] API routes implemented (POST, GET, GET/:id, PUT/:id, DELETE/:id)
- [ ] Singapore timezone utilities used throughout
- [ ] Validation functions with comprehensive tests
- [ ] React components (TodoForm, TodoList, TodoItem)
- [ ] Error handling in API routes
- [ ] CASCADE delete configured
- [ ] E2E tests written and passing
- [ ] Unit tests for validation functions
- [ ] Priority sorting implemented
- [ ] Due date sorting implemented
- [ ] Completion status toggle
- [ ] Delete confirmation dialog
- [ ] Test data seeding script (optional)

---

**Last Updated**: February 6, 2026
**Feature Status**: Foundation - implement first
**Dependencies**: None (base feature)
