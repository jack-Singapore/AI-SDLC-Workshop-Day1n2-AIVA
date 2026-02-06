# Feature 05: Subtasks & Progress Tracking

## Feature Overview

Implement a comprehensive subtask system that allows users to break down complex todos into smaller, manageable steps with real-time visual progress tracking. This feature enhances productivity by enabling granular task management and providing clear visual feedback on completion status through an animated progress bar that displays percentage and uses color coding (blue for in-progress, green for 100% complete).

## User Stories

**As a user**, I want to:
- Add multiple subtasks to any todo to break down complex tasks into manageable steps
- Check off subtasks as I complete them to track my progress
- See a visual progress bar showing completion percentage (X/Y format and %)
- Delete subtasks I no longer need without affecting the parent todo
- Expand and collapse the subtasks section to keep my todo list clean
- Have subtasks automatically deleted when I delete the parent todo (CASCADE behavior)
- See the progress bar change from blue (in-progress) to green (100% complete)
- View subtask progress even when the subtasks section is collapsed

## User Flow

### Create Subtask Flow
1. User finds a todo they want to add subtasks to
2. User clicks "▶ Subtasks" button (or "▼ Subtasks" if already expanded)
3. Subtasks section expands, revealing:
   - Existing subtasks list (if any)
   - "Add subtask" input field
   - Add button
4. User types subtask title in input field
5. User clicks "Add" button or presses Enter
6. System validates:
   - Subtask title is not empty (after trimming)
   - Subtask title is unique within this todo (optional validation)
7. Subtask appears immediately in the list
8. Progress bar updates automatically
9. Input field clears for next entry

### Toggle Subtask Completion Flow
1. User sees list of subtasks under expanded todo
2. User clicks checkbox next to subtask
3. Subtask completion status toggles:
   - If marking complete: checkbox fills, text may strike through
   - If marking incomplete: checkbox empties, strike-through removed
4. Progress bar updates in real-time:
   - Percentage recalculates (completed/total * 100)
   - Bar width animates to new percentage
   - Text updates to show new count (e.g., "3/7 subtasks")
   - Color remains blue unless 100% complete
5. If all subtasks complete (100%):
   - Progress bar turns green
   - Shows "X/X subtasks" with 100%

### Delete Subtask Flow
1. User hovers over subtask row
2. Delete button (✕) appears on right side
3. User clicks delete button
4. Subtask is immediately removed from list
5. Progress bar recalculates and updates
6. If last subtask deleted:
   - Progress section may hide or show 0/0 state

### Collapse/Expand Subtasks Flow
1. User clicks "▼ Subtasks (X)" button on expanded todo
2. Subtasks list collapses, hiding all subtasks
3. Button changes to "▶ Subtasks (X)"
4. Progress bar remains visible (if subtasks exist)
5. Count indicator shows total subtasks
6. User clicks "▶ Subtasks (X)" to expand again

### Delete Parent Todo with Subtasks
1. User clicks delete button on todo that has subtasks
2. Confirmation may appear (or immediate delete based on UX)
3. Database CASCADE DELETE triggers
4. Parent todo deleted
5. All associated subtasks automatically deleted
6. Todo disappears from list

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_position ON subtasks(position);
```

**Key Schema Decisions:**
- `todo_id`: Foreign key with **CASCADE DELETE** - when todo deleted, all subtasks auto-delete
- `position`: Integer for ordering subtasks (allows drag-drop in future)
- `completed`: Boolean for completion tracking
- `created_at`: Timestamp for audit trail

### TypeScript Types

```typescript
// lib/db.ts
export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface SubtaskProgress {
  total: number;
  completed: number;
  percentage: number; // 0-100
}

export interface TodoWithSubtasks extends Todo {
  subtasks?: Subtask[];
  progress?: SubtaskProgress;
}
```

### API Endpoints

#### POST /api/todos/[id]/subtasks - Create Subtask

**Request:**
```typescript
// app/api/todos/[id]/subtasks/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = parseInt(id);
  const body = await request.json();
  const { title } = body;

  // Validate title
  if (!title || title.trim().length === 0) {
    return NextResponse.json(
      { error: 'Subtask title cannot be empty' },
      { status: 400 }
    );
  }

  // Verify todo ownership
  const todo = todoDB.get(todoId, session.userId);
  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Get next position
  const existingSubtasks = subtaskDB.getByTodoId(todoId);
  const nextPosition = existingSubtasks.length;

  // Create subtask
  const subtask = subtaskDB.create({
    todo_id: todoId,
    title: title.trim(),
    completed: false,
    position: nextPosition,
  });

  return NextResponse.json(subtask, { status: 201 });
}
```

**Response (201):**
```json
{
  "id": 1,
  "todo_id": 5,
  "title": "Research options",
  "completed": false,
  "position": 0,
  "created_at": "2025-11-02T10:30:00+08:00"
}
```

**Error Responses:**
- 400: Empty title
- 401: Not authenticated
- 404: Todo not found or not owned by user

#### GET /api/todos/[id]/subtasks - List Subtasks

**Request:**
```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const todoId = parseInt(id);

  // Verify todo ownership
  const todo = todoDB.get(todoId, session.userId);
  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Get subtasks ordered by position
  const subtasks = subtaskDB.getByTodoId(todoId);
  
  return NextResponse.json({ subtasks });
}
```

**Response (200):**
```json
{
  "subtasks": [
    {
      "id": 1,
      "todo_id": 5,
      "title": "Research options",
      "completed": true,
      "position": 0,
      "created_at": "2025-11-02T10:30:00+08:00"
    },
    {
      "id": 2,
      "todo_id": 5,
      "title": "Compare prices",
      "completed": false,
      "position": 1,
      "created_at": "2025-11-02T10:31:00+08:00"
    }
  ]
}
```

#### PUT /api/subtasks/[id] - Update Subtask

**Request:**
```typescript
// app/api/subtasks/[id]/route.ts
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const subtaskId = parseInt(id);
  const body = await request.json();

  // Get subtask to verify ownership via todo
  const subtask = subtaskDB.get(subtaskId);
  if (!subtask) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  const todo = todoDB.get(subtask.todo_id, session.userId);
  if (!todo) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Validate updates
  const updates: Partial<Subtask> = {};
  
  if (body.title !== undefined) {
    if (body.title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Subtask title cannot be empty' },
        { status: 400 }
      );
    }
    updates.title = body.title.trim();
  }

  if (body.completed !== undefined) {
    updates.completed = Boolean(body.completed);
  }

  if (body.position !== undefined) {
    updates.position = parseInt(body.position);
  }

  // Update subtask
  const updated = subtaskDB.update(subtaskId, updates);

  return NextResponse.json(updated);
}
```

**Request Body:**
```json
{
  "completed": true
}
```

**Response (200):**
```json
{
  "id": 1,
  "todo_id": 5,
  "title": "Research options",
  "completed": true,
  "position": 0,
  "created_at": "2025-11-02T10:30:00+08:00"
}
```

#### DELETE /api/subtasks/[id] - Delete Subtask

**Request:**
```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const subtaskId = parseInt(id);

  // Get subtask to verify ownership
  const subtask = subtaskDB.get(subtaskId);
  if (!subtask) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  const todo = todoDB.get(subtask.todo_id, session.userId);
  if (!todo) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Delete subtask
  subtaskDB.delete(subtaskId);

  return NextResponse.json({ message: 'Subtask deleted' });
}
```

**Response (200):**
```json
{
  "message": "Subtask deleted"
}
```

### Database Operations (lib/db.ts)

```typescript
// lib/db.ts
export const subtaskDB = {
  create(data: Omit<Subtask, 'id' | 'created_at'>): Subtask {
    const stmt = db.prepare(`
      INSERT INTO subtasks (todo_id, title, completed, position)
      VALUES (?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      data.todo_id,
      data.title,
      data.completed ? 1 : 0,
      data.position
    );
    
    return this.get(Number(info.lastInsertRowid))!;
  },

  get(id: number): Subtask | null {
    const stmt = db.prepare('SELECT * FROM subtasks WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
      ...row,
      completed: Boolean(row.completed),
    };
  },

  getByTodoId(todoId: number): Subtask[] {
    const stmt = db.prepare(`
      SELECT * FROM subtasks 
      WHERE todo_id = ? 
      ORDER BY position ASC
    `);
    
    const rows = stmt.all(todoId) as any[];
    
    return rows.map(row => ({
      ...row,
      completed: Boolean(row.completed),
    }));
  },

  update(id: number, data: Partial<Subtask>): Subtask | null {
    const fields = [];
    const values = [];

    if (data.title !== undefined) {
      fields.push('title = ?');
      values.push(data.title);
    }
    if (data.completed !== undefined) {
      fields.push('completed = ?');
      values.push(data.completed ? 1 : 0);
    }
    if (data.position !== undefined) {
      fields.push('position = ?');
      values.push(data.position);
    }

    if (fields.length === 0) return this.get(id);

    values.push(id);

    const stmt = db.prepare(`
      UPDATE subtasks 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `);
    
    stmt.run(...values);
    
    return this.get(id);
  },

  delete(id: number): void {
    const stmt = db.prepare('DELETE FROM subtasks WHERE id = ?');
    stmt.run(id);
  },

  deleteByTodoId(todoId: number): void {
    const stmt = db.prepare('DELETE FROM subtasks WHERE todo_id = ?');
    stmt.run(todoId);
  },

  calculateProgress(todoId: number): SubtaskProgress {
    const subtasks = this.getByTodoId(todoId);
    const total = subtasks.length;
    const completed = subtasks.filter(s => s.completed).length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

    return { total, completed, percentage };
  },
};
```

### Progress Calculation Utility

```typescript
// lib/utils.ts
export function calculateSubtaskProgress(subtasks: Subtask[]): SubtaskProgress {
  const total = subtasks.length;
  const completed = subtasks.filter(s => s.completed).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { total, completed, percentage };
}

export function getProgressBarColor(percentage: number): string {
  return percentage === 100 ? 'bg-green-500' : 'bg-blue-500';
}
```

## UI Components

### ProgressBar Component

```typescript
// components/ProgressBar.tsx
'use client';

import { SubtaskProgress } from '@/lib/db';
import { getProgressBarColor } from '@/lib/utils';

interface ProgressBarProps {
  progress: SubtaskProgress;
  size?: 'sm' | 'md' | 'lg';
}

export default function ProgressBar({ progress, size = 'md' }: ProgressBarProps) {
  const { total, completed, percentage } = progress;

  if (total === 0) return null;

  const heightClass = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  }[size];

  const textSizeClass = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }[size];

  const barColor = getProgressBarColor(percentage);

  return (
    <div className="w-full" data-testid="progress-bar">
      <div className="flex justify-between items-center mb-1">
        <span className={`${textSizeClass} text-gray-600 dark:text-gray-400`}>
          {completed}/{total} subtasks
        </span>
        <span className={`${textSizeClass} font-medium text-gray-700 dark:text-gray-300`}>
          {percentage}%
        </span>
      </div>
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${heightClass}`}>
        <div
          className={`${barColor} ${heightClass} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
          data-testid="progress-bar-fill"
        />
      </div>
    </div>
  );
}
```

### SubtaskList Component

```typescript
// components/SubtaskList.tsx
'use client';

import { useState } from 'react';
import { Subtask } from '@/lib/db';
import ProgressBar from './ProgressBar';
import { calculateSubtaskProgress } from '@/lib/utils';

interface SubtaskListProps {
  todoId: number;
  subtasks: Subtask[];
  onUpdate: () => void;
}

export default function SubtaskList({ todoId, subtasks, onUpdate }: SubtaskListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const progress = calculateSubtaskProgress(subtasks);

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;

    setIsAdding(true);
    try {
      const response = await fetch(`/api/todos/${todoId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSubtaskTitle }),
      });

      if (response.ok) {
        setNewSubtaskTitle('');
        onUpdate();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to add subtask');
      }
    } catch (error) {
      console.error('Error adding subtask:', error);
      alert('Failed to add subtask');
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleComplete = async (subtaskId: number, completed: boolean) => {
    try {
      const response = await fetch(`/api/subtasks/${subtaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      });

      if (response.ok) {
        onUpdate();
      } else {
        alert('Failed to update subtask');
      }
    } catch (error) {
      console.error('Error updating subtask:', error);
      alert('Failed to update subtask');
    }
  };

  const handleDeleteSubtask = async (subtaskId: number) => {
    try {
      const response = await fetch(`/api/subtasks/${subtaskId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onUpdate();
      } else {
        alert('Failed to delete subtask');
      }
    } catch (error) {
      console.error('Error deleting subtask:', error);
      alert('Failed to delete subtask');
    }
  };

  return (
    <div className="mt-3 space-y-2" data-testid="subtask-list">
      {/* Progress Bar - Always visible if subtasks exist */}
      {subtasks.length > 0 && (
        <ProgressBar progress={progress} size="md" />
      )}

      {/* Expand/Collapse Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
        data-testid="toggle-subtasks-button"
      >
        <span>{isExpanded ? '▼' : '▶'}</span>
        <span>
          Subtasks {subtasks.length > 0 && `(${subtasks.length})`}
        </span>
      </button>

      {/* Subtasks List - Expanded */}
      {isExpanded && (
        <div className="pl-4 space-y-2">
          {/* Existing Subtasks */}
          {subtasks.map((subtask) => (
            <div
              key={subtask.id}
              className="flex items-center gap-2 group"
              data-testid={`subtask-item-${subtask.id}`}
            >
              <input
                type="checkbox"
                checked={subtask.completed}
                onChange={() => handleToggleComplete(subtask.id, subtask.completed)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                data-testid={`subtask-checkbox-${subtask.id}`}
              />
              <span
                className={`flex-1 text-sm ${
                  subtask.completed
                    ? 'line-through text-gray-500 dark:text-gray-600'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {subtask.title}
              </span>
              <button
                onClick={() => handleDeleteSubtask(subtask.id)}
                className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 text-sm"
                data-testid={`delete-subtask-${subtask.id}`}
              >
                ✕
              </button>
            </div>
          ))}

          {/* Add Subtask Input */}
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isAdding) {
                  handleAddSubtask();
                }
              }}
              placeholder="Add subtask..."
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              data-testid="add-subtask-input"
              disabled={isAdding}
            />
            <button
              onClick={handleAddSubtask}
              disabled={isAdding || !newSubtaskTitle.trim()}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              data-testid="add-subtask-button"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Integration in TodoItem Component

```typescript
// app/page.tsx or components/TodoItem.tsx
import SubtaskList from '@/components/SubtaskList';

// Inside TodoItem component
{todo.subtasks && (
  <SubtaskList
    todoId={todo.id}
    subtasks={todo.subtasks}
    onUpdate={fetchTodos}
  />
)}
```

## Edge Cases

### Database Edge Cases

1. **Deleting todo with many subtasks**
   - CASCADE DELETE should handle cleanly
   - Test with 100+ subtasks
   - Verify no orphaned subtasks remain

2. **Concurrent subtask operations**
   - Two users editing same todo's subtasks (if multi-user)
   - Use database transactions if needed
   - Handle optimistic UI updates

3. **Position conflicts**
   - When reordering subtasks (future feature)
   - Ensure unique positions or handle duplicates
   - Auto-fix position gaps

### UI Edge Cases

1. **Empty state**
   - Todo with no subtasks: hide progress bar
   - Show helpful prompt to add first subtask

2. **Long subtask titles**
   - Wrap text properly
   - Don't break layout
   - Truncate with ellipsis if needed

3. **Rapid clicking**
   - Disable checkbox during API call
   - Prevent duplicate requests
   - Show loading state

4. **Network failures**
   - Optimistic UI updates with rollback
   - Show error messages
   - Retry mechanism

5. **100% completion edge case**
   - Progress bar turns green at exactly 100%
   - Reverts to blue if any subtask unchecked
   - Test color transition animation

### Validation Edge Cases

1. **Empty subtask title**
   - Reject on client side
   - Reject on server side
   - Show clear error message

2. **Maximum subtasks**
   - Consider limit (e.g., 50 per todo)
   - Show warning near limit
   - Reject at API level if exceeded

3. **Special characters in title**
   - Emoji support
   - Unicode characters
   - HTML/script injection prevention

## Acceptance Criteria

### Must Have
- ✅ Can add unlimited subtasks to any todo
- ✅ Subtasks stored in database with CASCADE DELETE
- ✅ POST /api/todos/[id]/subtasks endpoint creates subtasks
- ✅ PUT /api/subtasks/[id] endpoint updates completion status
- ✅ DELETE /api/subtasks/[id] endpoint removes subtasks
- ✅ Checkbox toggles subtask completion
- ✅ Progress bar shows X/Y format and percentage
- ✅ Progress bar is blue (0-99%) and green (100%)
- ✅ Progress updates in real-time when subtasks toggle
- ✅ Expand/collapse button works (▶/▼ indicator)
- ✅ Progress bar visible even when collapsed
- ✅ Delete subtask button (✕) works
- ✅ Deleting parent todo deletes all subtasks
- ✅ Empty subtask title rejected with error message
- ✅ Subtasks ordered by position field

### Should Have
- ✅ Smooth progress bar animation (CSS transition)
- ✅ Subtask input clears after adding
- ✅ Enter key submits new subtask
- ✅ Hover state on delete button
- ✅ Loading state during API calls
- ⚠️ Optimistic UI updates with rollback on error
- ⚠️ Subtask count badge on collapsed state
- ⚠️ Keyboard navigation (arrow keys, space)

### Nice to Have
- ❌ Drag-and-drop reordering of subtasks
- ❌ Inline editing of subtask titles
- ❌ Bulk operations (complete all, delete all)
- ❌ Subtask templates
- ❌ Progress milestones (alerts at 25%, 50%, 75%)
- ❌ Undo delete subtask
- ❌ Copy subtasks to another todo

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/05-subtasks-progress.spec.ts
import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers';

test.describe('Subtasks & Progress Tracking', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.registerAndLogin('subtask_user');
    await helpers.createTodo('Project Alpha', { priority: 'high' });
  });

  test('should expand and collapse subtasks section', async ({ page }) => {
    const toggleButton = page.locator('[data-testid="toggle-subtasks-button"]').first();
    
    // Initially collapsed
    await expect(page.locator('[data-testid="add-subtask-input"]')).not.toBeVisible();
    
    // Expand
    await toggleButton.click();
    await expect(page.locator('[data-testid="add-subtask-input"]')).toBeVisible();
    await expect(toggleButton).toContainText('▼');
    
    // Collapse
    await toggleButton.click();
    await expect(page.locator('[data-testid="add-subtask-input"]')).not.toBeVisible();
    await expect(toggleButton).toContainText('▶');
  });

  test('should add multiple subtasks', async ({ page }) => {
    await helpers.expandSubtasks(0);
    
    await helpers.addSubtask('Research options');
    await helpers.addSubtask('Compare prices');
    await helpers.addSubtask('Make decision');
    
    await expect(page.locator('[data-testid^="subtask-item-"]')).toHaveCount(3);
    await expect(page.locator('text=Research options')).toBeVisible();
    await expect(page.locator('text=Compare prices')).toBeVisible();
    await expect(page.locator('text=Make decision')).toBeVisible();
  });

  test('should reject empty subtask title', async ({ page }) => {
    await helpers.expandSubtasks(0);
    
    const addButton = page.locator('[data-testid="add-subtask-button"]');
    
    // Button should be disabled when input is empty
    await expect(addButton).toBeDisabled();
    
    // Try to add with whitespace only
    await page.fill('[data-testid="add-subtask-input"]', '   ');
    await expect(addButton).toBeDisabled();
  });

  test('should toggle subtask completion', async ({ page }) => {
    await helpers.expandSubtasks(0);
    await helpers.addSubtask('Test task');
    
    const checkbox = page.locator('[data-testid^="subtask-checkbox-"]').first();
    
    // Initially unchecked
    await expect(checkbox).not.toBeChecked();
    
    // Check it
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    
    // Uncheck it
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });

  test('should update progress bar in real-time', async ({ page }) => {
    await helpers.expandSubtasks(0);
    
    // Add 4 subtasks
    await helpers.addSubtask('Task 1');
    await helpers.addSubtask('Task 2');
    await helpers.addSubtask('Task 3');
    await helpers.addSubtask('Task 4');
    
    // Check progress: 0/4 (0%)
    await expect(page.locator('[data-testid="progress-bar"]')).toContainText('0/4 subtasks');
    await expect(page.locator('[data-testid="progress-bar"]')).toContainText('0%');
    
    // Complete first task: 1/4 (25%)
    await page.locator('[data-testid^="subtask-checkbox-"]').first().check();
    await page.waitForTimeout(300); // Animation time
    await expect(page.locator('[data-testid="progress-bar"]')).toContainText('1/4 subtasks');
    await expect(page.locator('[data-testid="progress-bar"]')).toContainText('25%');
    
    // Complete second task: 2/4 (50%)
    await page.locator('[data-testid^="subtask-checkbox-"]').nth(1).check();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="progress-bar"]')).toContainText('2/4 subtasks');
    await expect(page.locator('[data-testid="progress-bar"]')).toContainText('50%');
    
    // Complete third task: 3/4 (75%)
    await page.locator('[data-testid^="subtask-checkbox-"]').nth(2).check();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="progress-bar"]')).toContainText('3/4 subtasks');
    await expect(page.locator('[data-testid="progress-bar"]')).toContainText('75%');
    
    // Complete fourth task: 4/4 (100%)
    await page.locator('[data-testid^="subtask-checkbox-"]').nth(3).check();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="progress-bar"]')).toContainText('4/4 subtasks');
    await expect(page.locator('[data-testid="progress-bar"]')).toContainText('100%');
  });

  test('should show blue progress bar until 100%', async ({ page }) => {
    await helpers.expandSubtasks(0);
    
    await helpers.addSubtask('Task 1');
    await helpers.addSubtask('Task 2');
    
    const progressFill = page.locator('[data-testid="progress-bar-fill"]');
    
    // 0% - blue
    await expect(progressFill).toHaveClass(/bg-blue-500/);
    
    // 50% - still blue
    await page.locator('[data-testid^="subtask-checkbox-"]').first().check();
    await page.waitForTimeout(300);
    await expect(progressFill).toHaveClass(/bg-blue-500/);
    
    // 100% - green
    await page.locator('[data-testid^="subtask-checkbox-"]').nth(1).check();
    await page.waitForTimeout(300);
    await expect(progressFill).toHaveClass(/bg-green-500/);
    
    // Back to 50% - blue again
    await page.locator('[data-testid^="subtask-checkbox-"]').first().uncheck();
    await page.waitForTimeout(300);
    await expect(progressFill).toHaveClass(/bg-blue-500/);
  });

  test('should delete subtask', async ({ page }) => {
    await helpers.expandSubtasks(0);
    
    await helpers.addSubtask('Delete me');
    await expect(page.locator('text=Delete me')).toBeVisible();
    
    // Hover to show delete button
    const subtaskItem = page.locator('[data-testid^="subtask-item-"]').first();
    await subtaskItem.hover();
    
    // Click delete
    await page.locator('[data-testid^="delete-subtask-"]').first().click();
    
    // Subtask should be gone
    await expect(page.locator('text=Delete me')).not.toBeVisible();
  });

  test('should show progress bar even when collapsed', async ({ page }) => {
    await helpers.expandSubtasks(0);
    await helpers.addSubtask('Task 1');
    
    // Progress bar visible when expanded
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    
    // Collapse
    await page.locator('[data-testid="toggle-subtasks-button"]').first().click();
    
    // Progress bar still visible when collapsed
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="add-subtask-input"]')).not.toBeVisible();
  });

  test('should cascade delete subtasks when parent todo deleted', async ({ page }) => {
    await helpers.expandSubtasks(0);
    
    await helpers.addSubtask('Will be deleted');
    await helpers.addSubtask('Also deleted');
    
    // Delete parent todo
    await page.locator('[data-testid^="delete-todo-"]').first().click();
    
    // Verify todo and subtasks are gone
    await expect(page.locator('text=Project Alpha')).not.toBeVisible();
    await expect(page.locator('text=Will be deleted')).not.toBeVisible();
    
    // Verify in database (via API)
    const response = await page.request.get('/api/todos');
    const { todos } = await response.json();
    expect(todos.length).toBe(0);
  });

  test('should clear input after adding subtask', async ({ page }) => {
    await helpers.expandSubtasks(0);
    
    const input = page.locator('[data-testid="add-subtask-input"]');
    
    await input.fill('New subtask');
    await page.locator('[data-testid="add-subtask-button"]').click();
    
    // Input should be cleared
    await expect(input).toHaveValue('');
  });

  test('should add subtask with Enter key', async ({ page }) => {
    await helpers.expandSubtasks(0);
    
    const input = page.locator('[data-testid="add-subtask-input"]');
    
    await input.fill('Press enter task');
    await input.press('Enter');
    
    await expect(page.locator('text=Press enter task')).toBeVisible();
    await expect(input).toHaveValue('');
  });

  test('should handle long subtask titles', async ({ page }) => {
    await helpers.expandSubtasks(0);
    
    const longTitle = 'This is a very long subtask title that should wrap properly and not break the layout or overflow the container';
    await helpers.addSubtask(longTitle);
    
    await expect(page.locator(`text=${longTitle}`)).toBeVisible();
    
    // Verify layout not broken (progress bar still visible)
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
  });
});
```

### Unit Tests

```typescript
// lib/utils.test.ts
import { calculateSubtaskProgress, getProgressBarColor } from '@/lib/utils';
import { Subtask } from '@/lib/db';

describe('Subtask Progress Utilities', () => {
  describe('calculateSubtaskProgress', () => {
    it('should return 0% for empty array', () => {
      const result = calculateSubtaskProgress([]);
      expect(result).toEqual({ total: 0, completed: 0, percentage: 0 });
    });

    it('should return 0% for all incomplete', () => {
      const subtasks: Subtask[] = [
        { id: 1, todo_id: 1, title: 'Task 1', completed: false, position: 0, created_at: '2025-11-02T10:00:00' },
        { id: 2, todo_id: 1, title: 'Task 2', completed: false, position: 1, created_at: '2025-11-02T10:01:00' },
      ];
      const result = calculateSubtaskProgress(subtasks);
      expect(result).toEqual({ total: 2, completed: 0, percentage: 0 });
    });

    it('should return 100% for all complete', () => {
      const subtasks: Subtask[] = [
        { id: 1, todo_id: 1, title: 'Task 1', completed: true, position: 0, created_at: '2025-11-02T10:00:00' },
        { id: 2, todo_id: 1, title: 'Task 2', completed: true, position: 1, created_at: '2025-11-02T10:01:00' },
      ];
      const result = calculateSubtaskProgress(subtasks);
      expect(result).toEqual({ total: 2, completed: 2, percentage: 100 });
    });

    it('should return 50% for half complete', () => {
      const subtasks: Subtask[] = [
        { id: 1, todo_id: 1, title: 'Task 1', completed: true, position: 0, created_at: '2025-11-02T10:00:00' },
        { id: 2, todo_id: 1, title: 'Task 2', completed: false, position: 1, created_at: '2025-11-02T10:01:00' },
      ];
      const result = calculateSubtaskProgress(subtasks);
      expect(result).toEqual({ total: 2, completed: 1, percentage: 50 });
    });

    it('should round percentage correctly (1 of 3 = 33%)', () => {
      const subtasks: Subtask[] = [
        { id: 1, todo_id: 1, title: 'Task 1', completed: true, position: 0, created_at: '2025-11-02T10:00:00' },
        { id: 2, todo_id: 1, title: 'Task 2', completed: false, position: 1, created_at: '2025-11-02T10:01:00' },
        { id: 3, todo_id: 1, title: 'Task 3', completed: false, position: 2, created_at: '2025-11-02T10:02:00' },
      ];
      const result = calculateSubtaskProgress(subtasks);
      expect(result.percentage).toBe(33);
    });

    it('should round percentage correctly (2 of 3 = 67%)', () => {
      const subtasks: Subtask[] = [
        { id: 1, todo_id: 1, title: 'Task 1', completed: true, position: 0, created_at: '2025-11-02T10:00:00' },
        { id: 2, todo_id: 1, title: 'Task 2', completed: true, position: 1, created_at: '2025-11-02T10:01:00' },
        { id: 3, todo_id: 1, title: 'Task 3', completed: false, position: 2, created_at: '2025-11-02T10:02:00' },
      ];
      const result = calculateSubtaskProgress(subtasks);
      expect(result.percentage).toBe(67);
    });
  });

  describe('getProgressBarColor', () => {
    it('should return blue for 0%', () => {
      expect(getProgressBarColor(0)).toBe('bg-blue-500');
    });

    it('should return blue for 50%', () => {
      expect(getProgressBarColor(50)).toBe('bg-blue-500');
    });

    it('should return blue for 99%', () => {
      expect(getProgressBarColor(99)).toBe('bg-blue-500');
    });

    it('should return green for 100%', () => {
      expect(getProgressBarColor(100)).toBe('bg-green-500');
    });
  });
});
```

### Database Tests

```typescript
// lib/db.test.ts (subtask section)
import { subtaskDB } from '@/lib/db';

describe('SubtaskDB', () => {
  beforeEach(() => {
    // Clear database
    db.exec('DELETE FROM subtasks');
    db.exec('DELETE FROM todos');
    db.exec('DELETE FROM users');
  });

  describe('create', () => {
    it('should create subtask with correct fields', () => {
      const subtask = subtaskDB.create({
        todo_id: 1,
        title: 'Test subtask',
        completed: false,
        position: 0,
      });

      expect(subtask.id).toBeDefined();
      expect(subtask.title).toBe('Test subtask');
      expect(subtask.completed).toBe(false);
      expect(subtask.position).toBe(0);
      expect(subtask.created_at).toBeDefined();
    });
  });

  describe('getByTodoId', () => {
    it('should return subtasks ordered by position', () => {
      subtaskDB.create({ todo_id: 1, title: 'Third', completed: false, position: 2 });
      subtaskDB.create({ todo_id: 1, title: 'First', completed: false, position: 0 });
      subtaskDB.create({ todo_id: 1, title: 'Second', completed: false, position: 1 });

      const subtasks = subtaskDB.getByTodoId(1);

      expect(subtasks).toHaveLength(3);
      expect(subtasks[0].title).toBe('First');
      expect(subtasks[1].title).toBe('Second');
      expect(subtasks[2].title).toBe('Third');
    });
  });

  describe('calculateProgress', () => {
    it('should calculate progress correctly', () => {
      subtaskDB.create({ todo_id: 1, title: 'Task 1', completed: true, position: 0 });
      subtaskDB.create({ todo_id: 1, title: 'Task 2', completed: false, position: 1 });
      subtaskDB.create({ todo_id: 1, title: 'Task 3', completed: false, position: 2 });

      const progress = subtaskDB.calculateProgress(1);

      expect(progress.total).toBe(3);
      expect(progress.completed).toBe(1);
      expect(progress.percentage).toBe(33);
    });
  });
});
```

## Out of Scope

The following features are **not** included in this initial implementation:

1. **Drag-and-drop reordering**: Manual reordering of subtasks
2. **Subtask due dates**: Individual deadlines for subtasks
3. **Subtask assignments**: Multi-user task assignment
4. **Nested subtasks**: Sub-subtasks (multi-level hierarchy)
5. **Subtask templates**: Reusable subtask sets
6. **Subtask comments**: Discussion threads on subtasks
7. **Subtask attachments**: File uploads on subtasks
8. **Time tracking**: Duration/effort logging per subtask
9. **Dependencies**: Subtask A must complete before B
10. **Progress milestones**: Notifications at 25%, 50%, 75%

## Success Metrics

### Quantitative Metrics

1. **API Performance**
   - Subtask creation: < 100ms
   - Subtask update: < 50ms
   - Subtask deletion: < 50ms
   - Progress calculation: < 10ms

2. **UI Performance**
   - Progress bar animation: smooth 60fps
   - Checkbox toggle response: < 100ms
   - List rendering: < 200ms for 50 subtasks

3. **Test Coverage**
   - E2E tests: 15+ scenarios passing
   - Unit tests: 100% coverage on utils
   - Database tests: 10+ scenarios

4. **User Adoption**
   - 70%+ of todos have at least 1 subtask
   - Average 3-5 subtasks per todo
   - 90%+ subtask completion rate

### Qualitative Metrics

1. **User Experience**
   - Intuitive expand/collapse interaction
   - Clear visual progress feedback
   - Satisfying completion animations
   - No confusion about 100% = green

2. **Code Quality**
   - Clean component architecture
   - Reusable progress bar component
   - Well-typed database operations
   - Comprehensive error handling

3. **Data Integrity**
   - No orphaned subtasks in database
   - CASCADE delete works 100%
   - Progress calculations always accurate
   - Positions maintain order

## Implementation Checklist

- [ ] **Database Setup**
  - [ ] Create `subtasks` table with migration
  - [ ] Add CASCADE DELETE constraint
  - [ ] Create indexes on `todo_id` and `position`
  - [ ] Test CASCADE behavior manually

- [ ] **Backend Implementation**
  - [ ] Implement `subtaskDB` operations in `lib/db.ts`
  - [ ] Create POST `/api/todos/[id]/subtasks` endpoint
  - [ ] Create GET `/api/todos/[id]/subtasks` endpoint
  - [ ] Create PUT `/api/subtasks/[id]` endpoint
  - [ ] Create DELETE `/api/subtasks/[id]` endpoint
  - [ ] Add validation for empty titles
  - [ ] Add ownership verification on all endpoints
  - [ ] Implement progress calculation function

- [ ] **Frontend Components**
  - [ ] Create `ProgressBar` component with color logic
  - [ ] Create `SubtaskList` component with expand/collapse
  - [ ] Add subtask input field with validation
  - [ ] Implement checkbox toggle handler
  - [ ] Implement delete subtask handler
  - [ ] Add progress bar animation CSS
  - [ ] Integrate into main TodoItem component
  - [ ] Add data-testid attributes for testing

- [ ] **Testing**
  - [ ] Write 15+ E2E tests for all flows
  - [ ] Write unit tests for progress calculations
  - [ ] Write unit tests for color selection
  - [ ] Write database tests for CRUD operations
  - [ ] Test CASCADE delete manually
  - [ ] Test with 50+ subtasks for performance
  - [ ] Test rapid clicking scenarios

- [ ] **Edge Cases & Error Handling**
  - [ ] Handle empty subtask title
  - [ ] Handle network failures gracefully
  - [ ] Handle long subtask titles
  - [ ] Handle concurrent operations
  - [ ] Test 100% → 99% → 100% color changes

- [ ] **Documentation**
  - [ ] Update USER_GUIDE.md with subtasks section
  - [ ] Add API documentation
  - [ ] Add component documentation
  - [ ] Create troubleshooting guide

- [ ] **Final Verification**
  - [ ] All E2E tests passing
  - [ ] All unit tests passing
  - [ ] Manual testing complete
  - [ ] Code review passed
  - [ ] Performance benchmarks met
  - [ ] Security review passed (CodeQL)
