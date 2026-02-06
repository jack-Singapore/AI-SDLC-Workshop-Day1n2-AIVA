# Feature 02: Priority System

## Feature Overview

Implement a three-level priority system (High, Medium, Low) for todos with color-coded badges, automatic sorting by priority, and filtering capabilities. This feature enhances the basic CRUD operations by allowing users to organize and focus on their most important tasks.

## User Stories

**As a user**, I want to:
- Assign a priority level (High, Medium, or Low) to each todo when creating or editing
- See priority indicated by color-coded badges (red for High, yellow for Medium, blue for Low)
- Have todos automatically sorted by priority within each section (Overdue, Active, Completed)
- Filter todos to show only a specific priority level
- Change priority of existing todos easily
- See high-priority tasks at the top of my list to know what's most important

## User Flow

### Assign Priority on Create
1. User fills in todo title in creation form
2. User selects priority from dropdown: "High Priority" / "Medium Priority" / "Low Priority"
3. If no priority selected, defaults to "Medium"
4. User clicks "Add"
5. Todo appears with color-coded priority badge

### Change Priority on Edit
1. User clicks edit button on existing todo
2. Edit modal/form opens with current priority pre-selected
3. User changes priority dropdown to different value
4. User saves
5. Todo badge color updates immediately
6. Todo repositions in list based on new priority (if within same section)

### Filter by Priority
1. User clicks "Filter by Priority" dropdown
2. User selects: "All" / "High" / "Medium" / "Low"
3. Todo list updates to show only matching priorities
4. Filter indicator shows active filter
5. User can click "Clear Filter" to see all todos again

### View Sorted Todos
1. Within each section (Overdue, Active, Completed), todos are automatically sorted:
   - Primary sort: Priority (High → Medium → Low)
   - Secondary sort: Due date (earliest first) for todos with same priority
   - Tertiary sort: Creation date (newest first) if no due date
2. User sees high-priority tasks at top of each section
3. Sorting happens automatically on every operation (create, edit, complete)

## Technical Requirements

### Database Schema

Priority field already exists in todos table (from Feature 01):

```sql
-- No new tables needed
-- Using existing priority column in todos table:
priority TEXT NOT NULL DEFAULT 'medium'  -- 'high', 'medium', or 'low'
```

### TypeScript Types

```typescript
// lib/db.ts
export type Priority = 'high' | 'medium' | 'low';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  priority: Priority;  // Always non-null with default 'medium'
  due_date: string | null;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  completed_at: string | null;
}

export const PRIORITY_ORDER: Record<Priority, number> = {
  high: 1,
  medium: 2,
  low: 3,
};
```

### API Endpoint Updates

All CRUD endpoints from Feature 01 already support priority. No new endpoints needed, but validation must be added:

#### POST /api/todos - Priority Validation
```typescript
// app/api/todos/route.ts
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const body = await request.json();
  const { title, priority = 'medium', ...rest } = body;
  
  // Validate priority
  const validPriorities: Priority[] = ['high', 'medium', 'low'];
  if (!validPriorities.includes(priority as Priority)) {
    return NextResponse.json(
      { error: 'Priority must be high, medium, or low' },
      { status: 400 }
    );
  }
  
  // Create todo with validated priority
  const todo = todoDB.create({
    ...rest,
    title: title.trim(),
    priority: priority as Priority,
    user_id: session.userId,
  });
  
  return NextResponse.json(todo, { status: 201 });
}
```

#### PUT /api/todos/[id] - Priority Update
```typescript
// app/api/todos/[id]/route.ts
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const { id } = await params;
  const body = await request.json();
  
  // Validate priority if provided
  if (body.priority !== undefined) {
    const validPriorities: Priority[] = ['high', 'medium', 'low'];
    if (!validPriorities.includes(body.priority as Priority)) {
      return NextResponse.json(
        { error: 'Priority must be high, medium, or low' },
        { status: 400 }
      );
    }
  }
  
  const updated = todoDB.update(parseInt(id), session.userId, body);
  if (!updated) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }
  
  return NextResponse.json(updated);
}
```

### Sorting Logic

```typescript
// lib/utils.ts
export function sortTodos(todos: Todo[]): Todo[] {
  return todos.sort((a, b) => {
    // Primary: Sort by priority (high → medium → low)
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    // Secondary: Sort by due date (earliest first, nulls last)
    if (a.due_date && b.due_date) {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    
    // Tertiary: Sort by created_at (newest first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
```

### Filter Logic

```typescript
// lib/utils.ts
export function filterTodosByPriority(todos: Todo[], priority: Priority | null): Todo[] {
  if (priority === null) return todos;
  return todos.filter(todo => todo.priority === priority);
}
```

## UI Components

### Priority Badge Component

```typescript
// components/PriorityBadge.tsx
'use client';

import { Priority } from '@/lib/db';

const PRIORITY_STYLES: Record<Priority, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-red-500', text: 'text-white', label: 'HIGH' },
  medium: { bg: 'bg-yellow-500', text: 'text-white', label: 'MED' },
  low: { bg: 'bg-blue-500', text: 'text-white', label: 'LOW' },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const styles = PRIORITY_STYLES[priority];
  
  return (
    <span 
      className={`px-2 py-1 text-xs font-semibold rounded ${styles.bg} ${styles.text}`}
      data-testid={`priority-badge-${priority}`}
    >
      {styles.label}
    </span>
  );
}
```

### Priority Selector Component

```typescript
// components/PrioritySelector.tsx
'use client';

import { Priority } from '@/lib/db';

export function PrioritySelector({ 
  value, 
  onChange 
}: { 
  value: Priority;
  onChange: (priority: Priority) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Priority)}
      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
      data-testid="todo-priority-select"
    >
      <option value="low">🔵 Low Priority</option>
      <option value="medium">🟡 Medium Priority</option>
      <option value="high">🔴 High Priority</option>
    </select>
  );
}
```

### Priority Filter Component

```typescript
// components/PriorityFilter.tsx
'use client';

import { Priority } from '@/lib/db';

export function PriorityFilter({ 
  selectedPriority, 
  onFilterChange 
}: {
  selectedPriority: Priority | null;
  onFilterChange: (priority: Priority | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="font-medium">Filter by Priority:</label>
      <select
        value={selectedPriority || 'all'}
        onChange={(e) => {
          const value = e.target.value;
          onFilterChange(value === 'all' ? null : value as Priority);
        }}
        className="px-4 py-2 border border-gray-300 rounded-lg"
        data-testid="priority-filter-select"
      >
        <option value="all">All Priorities</option>
        <option value="high">🔴 High Only</option>
        <option value="medium">🟡 Medium Only</option>
        <option value="low">🔵 Low Only</option>
      </select>
      
      {selectedPriority && (
        <button
          onClick={() => onFilterChange(null)}
          className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 underline"
          data-testid="clear-priority-filter"
        >
          Clear Filter
        </button>
      )}
    </div>
  );
}
```

### Updated TodoList with Sorting

```typescript
// app/page.tsx (within main component)
'use client';

import { useState, useEffect } from 'react';
import { Todo, Priority } from '@/lib/db';
import { sortTodos, filterTodosByPriority } from '@/lib/utils';
import { PriorityFilter } from '@/components/PriorityFilter';

export default function HomePage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);
  
  // Fetch todos on mount
  useEffect(() => {
    fetch('/api/todos')
      .then(res => res.json())
      .then(data => setTodos(data.todos));
  }, []);
  
  // Apply filtering and sorting
  const filteredTodos = filterTodosByPriority(todos, priorityFilter);
  
  // Categorize and sort
  const overdueTodos = sortTodos(
    filteredTodos.filter(t => !t.completed && t.due_date && new Date(t.due_date) < new Date())
  );
  const activeTodos = sortTodos(
    filteredTodos.filter(t => !t.completed && (!t.due_date || new Date(t.due_date) >= new Date()))
  );
  const completedTodos = sortTodos(
    filteredTodos.filter(t => t.completed)
  );
  
  return (
    <div className="container mx-auto p-4">
      <PriorityFilter 
        selectedPriority={priorityFilter} 
        onFilterChange={setPriorityFilter} 
      />
      
      {/* Todo list sections */}
      {/* ... */}
    </div>
  );
}
```

## Edge Cases

### 1. Invalid Priority Value
- **Scenario**: API receives priority outside allowed values
- **Handling**: Return 400 error with clear message
- **Error Message**: "Priority must be high, medium, or low"

### 2. Null/Undefined Priority
- **Scenario**: Client sends null or omits priority field
- **Handling**: Default to 'medium'
- **Result**: All todos have valid priority

### 3. Case Sensitivity
- **Scenario**: Client sends "HIGH" instead of "high"
- **Handling**: Normalize to lowercase before validation
- **Implementation**: `priority.toLowerCase() as Priority`

### 4. Priority Change Affecting Sort Order
- **Scenario**: User changes todo from low to high priority
- **Handling**: Re-sort todos after update, move todo to top
- **UI Update**: Smooth transition, not jarring jump

### 5. Filter with No Matching Todos
- **Scenario**: User filters by priority that has no todos
- **Handling**: Show empty state message
- **Message**: "No todos with [priority] priority. Try a different filter."

### 6. Multiple Todos Same Priority and Due Date
- **Scenario**: Two high-priority todos both due tomorrow
- **Handling**: Fall back to tertiary sort (created_at, newest first)
- **Result**: Consistent ordering

### 7. Priority Filter Persistence
- **Scenario**: User refreshes page after setting filter
- **Handling**: Filter resets (no persistence by default)
- **Future Enhancement**: Store in localStorage or URL params

## Acceptance Criteria

### Must Have
- ✅ Three priority levels available: High, Medium, Low
- ✅ Priority defaults to Medium if not specified
- ✅ Priority badges display with correct colors:
  - High: Red background (`bg-red-500`)
  - Medium: Yellow background (`bg-yellow-500`)
  - Low: Blue background (`bg-blue-500`)
- ✅ Priority dropdown in todo creation form
- ✅ Priority editable in edit form
- ✅ Todos sorted by priority within each section (High → Medium → Low)
- ✅ Secondary sort by due date for same priority
- ✅ Priority filter dropdown with "All" / "High" / "Medium" / "Low" options
- ✅ Filter updates todo list in real-time
- ✅ Clear filter button visible when filter active
- ✅ API validates priority values
- ✅ Invalid priority returns 400 error

### Should Have
- ⚠️ Priority icons/emojis (🔴 🟡 🔵) in dropdowns for visual clarity
- ⚠️ Keyboard shortcuts to set priority (1=High, 2=Medium, 3=Low)
- ⚠️ Filter count indicator ("Showing 5 high priority todos")
- ⚠️ Smooth transitions when todos reorder

### Nice to Have
- ❌ Customizable priority levels (user-defined names and colors)
- ❌ Priority history tracking
- ❌ Auto-escalate priority based on approaching due date
- ❌ Dark mode color adjustments for better contrast

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/02-priority-system.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Priority System', () => {
  test('should create todo with default medium priority', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="todo-title-input"]', 'Default priority task');
    await page.click('[data-testid="add-todo-button"]');
    
    await expect(page.locator('[data-testid="priority-badge-medium"]')).toBeVisible();
  });
  
  test('should create todo with high priority', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="todo-title-input"]', 'Important task');
    await page.selectOption('[data-testid="todo-priority-select"]', 'high');
    await page.click('[data-testid="add-todo-button"]');
    
    await expect(page.locator('[data-testid="priority-badge-high"]')).toBeVisible();
  });
  
  test('should sort todos by priority', async ({ page }) => {
    await page.goto('/');
    
    // Create low priority todo
    await page.fill('[data-testid="todo-title-input"]', 'Low priority task');
    await page.selectOption('[data-testid="todo-priority-select"]', 'low');
    await page.click('[data-testid="add-todo-button"]');
    
    // Create high priority todo
    await page.fill('[data-testid="todo-title-input"]', 'High priority task');
    await page.selectOption('[data-testid="todo-priority-select"]', 'high');
    await page.click('[data-testid="add-todo-button"]');
    
    // Verify high priority appears before low priority
    const todoItems = page.locator('[data-testid="todo-item"]');
    const firstTodo = todoItems.first();
    await expect(firstTodo.locator('text=High priority task')).toBeVisible();
  });
  
  test('should edit todo priority', async ({ page }) => {
    await page.goto('/');
    
    // Create medium priority todo
    await page.fill('[data-testid="todo-title-input"]', 'Editable task');
    await page.click('[data-testid="add-todo-button"]');
    
    // Edit to high priority
    await page.click('[data-testid^="edit-todo-"]').first();
    await page.selectOption('[data-testid="edit-priority-select"]', 'high');
    await page.click('[data-testid="save-edit-button"]');
    
    await expect(page.locator('[data-testid="priority-badge-high"]')).toBeVisible();
  });
  
  test('should filter by high priority', async ({ page }) => {
    await page.goto('/');
    
    // Create high and low priority todos
    await page.fill('[data-testid="todo-title-input"]', 'High task');
    await page.selectOption('[data-testid="todo-priority-select"]', 'high');
    await page.click('[data-testid="add-todo-button"]');
    
    await page.fill('[data-testid="todo-title-input"]', 'Low task');
    await page.selectOption('[data-testid="todo-priority-select"]', 'low');
    await page.click('[data-testid="add-todo-button"]');
    
    // Filter by high priority
    await page.selectOption('[data-testid="priority-filter-select"]', 'high');
    
    // Verify only high priority visible
    await expect(page.locator('text=High task')).toBeVisible();
    await expect(page.locator('text=Low task')).not.toBeVisible();
  });
  
  test('should clear priority filter', async ({ page }) => {
    await page.goto('/');
    
    // Set filter
    await page.selectOption('[data-testid="priority-filter-select"]', 'high');
    
    // Clear filter
    await page.click('[data-testid="clear-priority-filter"]');
    
    // Verify all todos visible again
    await expect(page.locator('[data-testid="priority-filter-select"]')).toHaveValue('all');
  });
  
  test('should reject invalid priority via API', async ({ page, request }) => {
    const response = await request.post('/api/todos', {
      data: {
        title: 'Invalid priority',
        priority: 'urgent', // Invalid value
      },
    });
    
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Priority must be high, medium, or low');
  });
});
```

### Unit Tests

```typescript
// tests/utils.test.ts
import { sortTodos, filterTodosByPriority } from '@/lib/utils';
import { Todo, Priority } from '@/lib/db';

describe('Priority Utilities', () => {
  describe('sortTodos', () => {
    it('should sort by priority (high → medium → low)', () => {
      const todos: Todo[] = [
        { id: 1, priority: 'low', title: 'Low', due_date: null, created_at: '2026-01-01' } as Todo,
        { id: 2, priority: 'high', title: 'High', due_date: null, created_at: '2026-01-01' } as Todo,
        { id: 3, priority: 'medium', title: 'Med', due_date: null, created_at: '2026-01-01' } as Todo,
      ];
      
      const sorted = sortTodos(todos);
      expect(sorted[0].priority).toBe('high');
      expect(sorted[1].priority).toBe('medium');
      expect(sorted[2].priority).toBe('low');
    });
    
    it('should sort by due date within same priority', () => {
      const todos: Todo[] = [
        { id: 1, priority: 'high', due_date: '2026-02-10', created_at: '2026-01-01' } as Todo,
        { id: 2, priority: 'high', due_date: '2026-02-08', created_at: '2026-01-01' } as Todo,
      ];
      
      const sorted = sortTodos(todos);
      expect(sorted[0].due_date).toBe('2026-02-08');
      expect(sorted[1].due_date).toBe('2026-02-10');
    });
    
    it('should place todos with due dates before those without', () => {
      const todos: Todo[] = [
        { id: 1, priority: 'high', due_date: null, created_at: '2026-01-01' } as Todo,
        { id: 2, priority: 'high', due_date: '2026-02-10', created_at: '2026-01-01' } as Todo,
      ];
      
      const sorted = sortTodos(todos);
      expect(sorted[0].due_date).toBe('2026-02-10');
      expect(sorted[1].due_date).toBe(null);
    });
  });
  
  describe('filterTodosByPriority', () => {
    const todos: Todo[] = [
      { id: 1, priority: 'high', title: 'High' } as Todo,
      { id: 2, priority: 'medium', title: 'Med' } as Todo,
      { id: 3, priority: 'low', title: 'Low' } as Todo,
    ];
    
    it('should return all todos when filter is null', () => {
      const filtered = filterTodosByPriority(todos, null);
      expect(filtered).toHaveLength(3);
    });
    
    it('should filter by high priority', () => {
      const filtered = filterTodosByPriority(todos, 'high');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].priority).toBe('high');
    });
    
    it('should filter by medium priority', () => {
      const filtered = filterTodosByPriority(todos, 'medium');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].priority).toBe('medium');
    });
    
    it('should filter by low priority', () => {
      const filtered = filterTodosByPriority(todos, 'low');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].priority).toBe('low');
    });
  });
});
```

## Out of Scope

The following are NOT part of this priority system implementation:
- More than three priority levels
- User-customizable priority names or colors
- Priority escalation rules (auto-increase priority as due date approaches)
- Priority-based notifications
- Priority analytics/statistics
- Bulk priority updates
- Priority templates
- Priority history/audit log

## Success Metrics

### Functional Metrics
- ✅ 100% of todos have valid priority (no nulls)
- ✅ Priority filter works with zero lag
- ✅ Sorting is visually consistent
- ✅ Priority changes reflect immediately in UI

### Technical Metrics
- ✅ Sort algorithm completes in < 10ms for 1000 todos
- ✅ Filter algorithm completes in < 5ms for 1000 todos
- ✅ All E2E tests passing (7 priority tests)
- ✅ Zero TypeScript errors
- ✅ API validation prevents invalid priorities

### User Experience Metrics
- ✅ Color-coded badges clearly distinguish priorities
- ✅ High-priority tasks always visible at top
- ✅ Filter dropdown intuitive and responsive
- ✅ WCAG AA contrast ratios met for all badge colors

## Implementation Checklist

- [ ] Priority validation in API routes (POST, PUT)
- [ ] Default priority to 'medium' if not specified
- [ ] PriorityBadge component with color styles
- [ ] PrioritySelector component in create/edit forms
- [ ] PriorityFilter component with dropdown
- [ ] sortTodos utility function (primary, secondary, tertiary sort)
- [ ] filterTodosByPriority utility function
- [ ] Update TodoList to use sorting and filtering
- [ ] E2E tests for create, edit, sort, filter
- [ ] Unit tests for sorting and filtering logic
- [ ] Color contrast accessibility check
- [ ] Data migration (if upgrading existing todos without priority)

---

**Last Updated**: February 6, 2026
**Feature Status**: Phase 1 - Core Feature
**Dependencies**: Feature 01 (Todo CRUD)
