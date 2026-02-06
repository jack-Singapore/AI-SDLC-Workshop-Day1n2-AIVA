# Feature 03: Recurring Todos

## Feature Overview

Implement recurring todo functionality with four recurrence patterns (daily, weekly, monthly, yearly). When a recurring todo is completed, automatically create the next instance with the same metadata, calculated due date based on the pattern, and inheritance of priority, tags, reminder settings, and recurrence configuration.

## User Stories

**As a user**, I want to:
- Mark a todo as recurring when creating or editing it
- Choose from daily, weekly, monthly, or yearly recurrence patterns
- Have a new instance automatically created when I complete a recurring todo
- See the next due date calculated correctly based on the pattern
- Have the new instance inherit my original settings (priority, tags, reminder, recurrence)
- Identify recurring todos easily with a visual indicator (🔄 badge)
- Disable recurrence on an existing todo without losing data

## User Flow

### Create Recurring Todo
1. User enters todo title: "Daily standup meeting"
2. User sets due date: Tomorrow 9:00 AM
3. User checks "Repeat" checkbox
4. Recurrence pattern dropdown becomes enabled
5. User selects "Daily" from dropdown
6. User sets priority: High
7. User sets reminder: 15 minutes before
8. User clicks "Add"
9. Todo appears with 🔄 badge showing "Daily"

### Complete Recurring Todo
1. User clicks checkbox on recurring todo to mark complete
2. Original todo moves to Completed section with completed_at timestamp
3. New instance is created automatically with:
   - Same title ("Daily standup meeting")
   - Same priority (High)
   - New due date (tomorrow's date + 1 day = day after tomorrow 9:00 AM)
   - Same recurrence settings (is_recurring: true, pattern: "daily")
   - Same reminder settings (15 minutes before new due date)
   - Tags copied from original
4. New instance appears in Active section
5. User sees both completed original and new instance

### Edit Recurrence Settings
1. User clicks edit on existing recurring todo
2. User can:
   - Change recurrence pattern (daily → weekly)
   - Disable recurrence (uncheck "Repeat")
   - Change due date (which affects next instance calculation)
3. Next completion will use updated settings

### Disable Recurrence
1. User edits recurring todo
2. User unchecks "Repeat" checkbox
3. Recurrence pattern dropdown becomes disabled/hidden
4. User saves
5. Next completion will NOT create new instance (behaves like regular todo)

## Technical Requirements

### Database Schema

Fields already exist in todos table from Feature 01:

```sql
-- No new tables needed
-- Using existing columns:
is_recurring BOOLEAN NOT NULL DEFAULT 0
recurrence_pattern TEXT  -- 'daily' | 'weekly' | 'monthly' | 'yearly' | NULL
```

### TypeScript Types

```typescript
// lib/db.ts
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  priority: Priority;
  due_date: string | null;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RecurringTodoMetadata {
  title: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
  tag_ids: number[];
}
```

### Validation Rules

```typescript
// lib/validation.ts
export function validateRecurrence(
  is_recurring: boolean,
  recurrence_pattern: RecurrencePattern | null,
  due_date: string | null
): { valid: boolean; error?: string } {
  // If not recurring, pattern should be null
  if (!is_recurring) {
    if (recurrence_pattern !== null) {
      return { valid: false, error: 'Non-recurring todos cannot have a recurrence pattern' };
    }
    return { valid: true };
  }
  
  // If recurring, must have valid pattern
  const validPatterns: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];
  if (!recurrence_pattern || !validPatterns.includes(recurrence_pattern)) {
    return { valid: false, error: 'Recurring todos must have a valid recurrence pattern' };
  }
  
  // Recurring todos must have a due date
  if (!due_date) {
    return { valid: false, error: 'Recurring todos must have a due date' };
  }
  
  return { valid: true };
}
```

### Due Date Calculation Logic

```typescript
// lib/recurrence.ts
import { getSingaporeNow } from './timezone';

export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern
): string {
  const current = new Date(currentDueDate);
  let next = new Date(current);
  
  switch (pattern) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
      
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
      
    case 'monthly':
      // Add 1 month, handle edge cases (e.g., Jan 31 → Feb 28/29)
      const currentDay = current.getDate();
      next.setMonth(next.getMonth() + 1);
      
      // If day changed (overflow), set to last day of previous month
      if (next.getDate() !== currentDay) {
        next.setDate(0); // Go to last day of previous month
      }
      break;
      
    case 'yearly':
      // Add 1 year, handle leap year edge case (Feb 29)
      next.setFullYear(next.getFullYear() + 1);
      
      // If date changed (Feb 29 → Feb 28), use Feb 28
      if (next.getMonth() !== current.getMonth()) {
        next.setDate(0); // Go to last day of previous month
      }
      break;
  }
  
  return next.toISOString();
}
```

### API Endpoint Updates

#### PUT /api/todos/[id] - Handle Recurring Completion

```typescript
// app/api/todos/[id]/route.ts
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const { id } = await params;
  const body = await request.json();
  
  // Get current todo
  const currentTodo = todoDB.findById(parseInt(id), session.userId);
  if (!currentTodo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }
  
  // Validate recurrence if being updated
  if (body.is_recurring !== undefined || body.recurrence_pattern !== undefined) {
    const is_recurring = body.is_recurring ?? currentTodo.is_recurring;
    const recurrence_pattern = body.recurrence_pattern ?? currentTodo.recurrence_pattern;
    const due_date = body.due_date ?? currentTodo.due_date;
    
    const validation = validateRecurrence(is_recurring, recurrence_pattern, due_date);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
  }
  
  // Update the todo
  const updated = todoDB.update(parseInt(id), session.userId, body);
  
  // If marking recurring todo as complete, create next instance
  if (
    body.completed === true &&
    currentTodo.completed === false &&
    currentTodo.is_recurring &&
    currentTodo.recurrence_pattern &&
    currentTodo.due_date
  ) {
    const nextDueDate = calculateNextDueDate(
      currentTodo.due_date,
      currentTodo.recurrence_pattern
    );
    
    // Get tags associated with current todo
    const currentTags = tagDB.getTagsForTodo(parseInt(id));
    
    // Create next instance
    const nextTodo = todoDB.create({
      user_id: session.userId,
      title: currentTodo.title,
      priority: currentTodo.priority,
      due_date: nextDueDate,
      is_recurring: true,
      recurrence_pattern: currentTodo.recurrence_pattern,
      reminder_minutes: currentTodo.reminder_minutes,
      completed: false,
    });
    
    // Copy tags to new instance
    for (const tag of currentTags) {
      tagDB.assignTagToTodo(nextTodo.id, tag.id);
    }
  }
  
  return NextResponse.json(updated);
}
```

## UI Components

### Recurrence Toggle Component

```typescript
// components/RecurrenceToggle.tsx
'use client';

import { useState } from 'react';
import { RecurrencePattern } from '@/lib/db';

export function RecurrenceToggle({ 
  isRecurring, 
  pattern, 
  onRecurrenceChange 
}: {
  isRecurring: boolean;
  pattern: RecurrencePattern | null;
  onRecurrenceChange: (isRecurring: boolean, pattern: RecurrencePattern | null) => void;
}) {
  const handleToggle = (checked: boolean) => {
    if (!checked) {
      onRecurrenceChange(false, null);
    } else {
      onRecurrenceChange(true, pattern || 'daily');
    }
  };
  
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => handleToggle(e.target.checked)}
          className="w-4 h-4"
          data-testid="recurring-checkbox"
        />
        <span className="font-medium">Repeat</span>
      </label>
      
      {isRecurring && (
        <select
          value={pattern || 'daily'}
          onChange={(e) => onRecurrenceChange(true, e.target.value as RecurrencePattern)}
          className="ml-6 px-4 py-2 border rounded"
          data-testid="recurrence-pattern-select"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      )}
    </div>
  );
}
```

### Recurrence Badge Component

```typescript
// components/RecurrenceBadge.tsx
'use client';

import { RecurrencePattern } from '@/lib/db';

const PATTERN_LABELS: Record<RecurrencePattern, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export function RecurrenceBadge({ pattern }: { pattern: RecurrencePattern }) {
  return (
    <span 
      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded"
      data-testid="recurrence-badge"
    >
      <span>🔄</span>
      <span>{PATTERN_LABELS[pattern]}</span>
    </span>
  );
}
```

## Edge Cases

### 1. No Due Date for Recurring Todo
- **Scenario**: User tries to create recurring todo without due date
- **Handling**: Return 400 error
- **Error Message**: "Recurring todos must have a due date"

### 2. Monthly Recurrence on 31st
- **Scenario**: Todo due Jan 31, monthly recurrence
- **Handling**: Feb 28/29, Mar 31, Apr 30, May 31, etc.
- **Logic**: If target day doesn't exist, use last day of month

### 3. Yearly Recurrence on Feb 29 (Leap Year)
- **Scenario**: Todo due Feb 29, 2024, yearly recurrence
- **Handling**: Next instance is Feb 28, 2025 (non-leap year)
- **Logic**: If Feb 29 doesn't exist, use Feb 28

### 4. Complete Recurring Todo Multiple Times Rapidly
- **Scenario**: User clicks complete, incomplete, complete quickly
- **Handling**: Each completion creates new instance
- **Mitigation**: Disable checkbox during API call (optimistic updates)

### 5. Edit Recurrence Pattern Mid-Cycle
- **Scenario**: User changes daily → weekly on existing recurring todo
- **Handling**: Next completion uses new pattern
- **Result**: No retroactive changes to already-created instances

### 6. Disable Recurrence After Multiple Instances
- **Scenario**: User unchecks "Repeat" on 5th instance of daily todo
- **Handling**: That specific todo becomes non-recurring
- **Result**: Completing it won't create instance #6

### 7. Delete Recurring Todo
- **Scenario**: User deletes one instance of recurring series
- **Handling**: Only that instance is deleted, others remain
- **Note**: No "series delete" functionality (each instance independent)

### 8. Tag Inheritance
- **Scenario**: Original todo has tags "work" and "urgent"
- **Handling**: Copy tag associations to new instance
- **Implementation**: Query todo_tags, insert new rows for new todo

## Acceptance Criteria

### Must Have
- ✅ Four recurrence patterns available: daily, weekly, monthly, yearly
- ✅ "Repeat" checkbox enables/disables recurrence
- ✅ Recurrence pattern dropdown only enabled when "Repeat" checked
- ✅ Recurring todos must have due date (validation enforced)
- ✅ Completing recurring todo creates next instance automatically
- ✅ Next instance has correct due date based on pattern:
  - Daily: due_date + 1 day
  - Weekly: due_date + 7 days
  - Monthly: due_date + 1 month (handle 31st, 30th, 28/29th)
  - Yearly: due_date + 1 year (handle leap year)
- ✅ Next instance inherits:
  - Title
  - Priority
  - Is_recurring: true
  - Recurrence_pattern
  - Reminder_minutes
  - Tags (copied associations)
- ✅ Recurrence badge (🔄 + pattern name) displays on recurring todos
- ✅ Can disable recurrence by unchecking "Repeat"
- ✅ API validation prevents invalid recurrence configurations
- ✅ All date calculations use Singapore timezone

### Should Have
- ⚠️ Show "Next due: [date]" on recurring todos
- ⚠️ Recurring todo history (show previous instances)
- ⚠️ Edit all future instances option
- ⚠️ Custom recurrence intervals (every 2 weeks, every 3 months)

### Nice to Have
- ❌ Skip next instance (one-time postponement)
- ❌ End date for recurrence (stop after N instances or date)
- ❌ Days-of-week selection for weekly (Mon, Wed, Fri only)
- ❌ Nth weekday of month (2nd Tuesday, last Friday)

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/03-recurring-todos.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Recurring Todos', () => {
  test('should create daily recurring todo', async ({ page }) => {
    await page.goto('/');
    
    await page.fill('[data-testid="todo-title-input"]', 'Daily task');
    await page.fill('[data-testid="todo-due-date-input"]', '2026-02-07T09:00');
    await page.check('[data-testid="recurring-checkbox"]');
    await page.selectOption('[data-testid="recurrence-pattern-select"]', 'daily');
    await page.click('[data-testid="add-todo-button"]');
    
    await expect(page.locator('text=Daily task')).toBeVisible();
    await expect(page.locator('[data-testid="recurrence-badge"]')).toContainText('Daily');
  });
  
  test('should reject recurring todo without due date', async ({ page }) => {
    await page.goto('/');
    
    await page.fill('[data-testid="todo-title-input"]', 'No date recurring');
    await page.check('[data-testid="recurring-checkbox"]');
    await page.click('[data-testid="add-todo-button"]');
    
    await expect(page.locator('text=Recurring todos must have a due date')).toBeVisible();
  });
  
  test('should create next instance on completion - daily', async ({ page }) => {
    await page.goto('/');
    
    // Create daily recurring todo for tomorrow
    await page.fill('[data-testid="todo-title-input"]', 'Daily standup');
    await page.fill('[data-testid="todo-due-date-input"]', '2026-02-07T09:00');
    await page.check('[data-testid="recurring-checkbox"]');
    await page.selectOption('[data-testid="recurrence-pattern-select"]', 'daily');
    await page.click('[data-testid="add-todo-button"]');
    
    // Complete the todo
    await page.click('[data-testid^="todo-checkbox-"]').first();
    
    // Wait for new instance
    await page.waitForTimeout(500);
    
    // Should see original in Completed and new instance in Active
    const dailyTasks = page.locator('text=Daily standup');
    await expect(dailyTasks).toHaveCount(2);
  });
  
  test('should calculate weekly recurrence correctly', async ({ page, request }) => {
    const response = await request.post('/api/todos', {
      data: {
        title: 'Weekly meeting',
        due_date: '2026-02-10T14:00:00.000Z',
        is_recurring: true,
        recurrence_pattern: 'weekly',
      },
    });
    
    const todo = await response.json();
    
    // Complete the todo
    await request.put(`/api/todos/${todo.id}`, {
      data: { completed: true },
    });
    
    // Fetch todos to get next instance
    const todosResponse = await request.get('/api/todos');
    const { todos } = await todosResponse.json();
    
    const nextInstance = todos.find(
      (t: any) => t.title === 'Weekly meeting' && !t.completed
    );
    
    expect(nextInstance).toBeDefined();
    expect(nextInstance.due_date).toBe('2026-02-17T14:00:00.000Z'); // +7 days
  });
  
  test('should inherit metadata in next instance', async ({ page }) => {
    await page.goto('/');
    
    // Create high-priority daily recurring todo with tags
    await page.fill('[data-testid="todo-title-input"]', 'Important daily');
    await page.selectOption('[data-testid="todo-priority-select"]', 'high');
    await page.fill('[data-testid="todo-due-date-input"]', '2026-02-07T09:00');
    await page.check('[data-testid="recurring-checkbox"]');
    await page.selectOption('[data-testid="recurrence-pattern-select"]', 'daily');
    await page.click('[data-testid="add-todo-button"]');
    
    // Complete it
    await page.click('[data-testid^="todo-checkbox-"]').first();
    await page.waitForTimeout(500);
    
    // Verify next instance has high priority
    const activeTodos = page.locator('[data-testid="todo-item"]').filter({ hasText: 'Important daily' }).filter({ has: page.locator(':not(.line-through)') });
    await expect(activeTodos.locator('[data-testid="priority-badge-high"]')).toBeVisible();
    await expect(activeTodos.locator('[data-testid="recurrence-badge"]')).toBeVisible();
  });
  
  test('should disable recurrence when unchecking repeat', async ({ page }) => {
    await page.goto('/');
    
    // Create recurring todo
    await page.fill('[data-testid="todo-title-input"]', 'Make recurring');
    await page.fill('[data-testid="todo-due-date-input"]', '2026-02-07T09:00');
    await page.check('[data-testid="recurring-checkbox"]');
    await page.click('[data-testid="add-todo-button"]');
    
    // Edit to disable recurrence
    await page.click('[data-testid^="edit-todo-"]').first();
    await page.uncheck('[data-testid="edit-recurring-checkbox"]');
    await page.click('[data-testid="save-edit-button"]');
    
    // Verify no recurrence badge
    await expect(page.locator('[data-testid="recurrence-badge"]')).not.toBeVisible();
  });
});
```

### Unit Tests

```typescript
// tests/recurrence.test.ts
import { calculateNextDueDate } from '@/lib/recurrence';

describe('Recurrence Calculations', () => {
  describe('Daily recurrence', () => {
    it('should add 1 day', () => {
      const current = '2026-02-10T09:00:00.000Z';
      const next = calculateNextDueDate(current, 'daily');
      expect(next).toBe('2026-02-11T09:00:00.000Z');
    });
  });
  
  describe('Weekly recurrence', () => {
    it('should add 7 days', () => {
      const current = '2026-02-10T09:00:00.000Z';
      const next = calculateNextDueDate(current, 'weekly');
      expect(next).toBe('2026-02-17T09:00:00.000Z');
    });
  });
  
  describe('Monthly recurrence', () => {
    it('should add 1 month for regular dates', () => {
      const current = '2026-02-10T09:00:00.000Z';
      const next = calculateNextDueDate(current, 'monthly');
      expect(next).toBe('2026-03-10T09:00:00.000Z');
    });
    
    it('should handle month-end overflow (Jan 31 → Feb 28)', () => {
      const current = '2026-01-31T09:00:00.000Z';
      const next = calculateNextDueDate(current, 'monthly');
      expect(next).toBe('2026-02-28T09:00:00.000Z');
    });
    
    it('should handle leap year (Jan 31 → Feb 29)', () => {
      const current = '2024-01-31T09:00:00.000Z';
      const next = calculateNextDueDate(current, 'monthly');
      expect(next).toBe('2024-02-29T09:00:00.000Z');
    });
  });
  
  describe('Yearly recurrence', () => {
    it('should add 1 year for regular dates', () => {
      const current = '2026-02-10T09:00:00.000Z';
      const next = calculateNextDueDate(current, 'yearly');
      expect(next).toBe('2027-02-10T09:00:00.000Z');
    });
    
    it('should handle leap year → non-leap year (Feb 29 → Feb 28)', () => {
      const current = '2024-02-29T09:00:00.000Z';
      const next = calculateNextDueDate(current, 'yearly');
      expect(next).toBe('2025-02-28T09:00:00.000Z');
    });
  });
});
```

## Out of Scope

- Custom intervals (every 2 days, every 3 weeks)
- Multiple days-of-week for weekly (e.g., Mon-Wed-Fri only)
- Nth weekday of month patterns (2nd Tuesday, last Friday)
- End date for recurrence series
- Recurring subtasks independently
- Modify all future instances at once
- Exception dates (skip specific dates)

## Success Metrics

### Functional Metrics
- ✅ 100% of next instances have correct due dates
- ✅ 100% metadata inheritance (priority, tags, reminder, pattern)
- ✅ Zero orphaned instances (all next instances created successfully)
- ✅ Date calculations handle all edge cases (month-end, leap year)

### Technical Metrics
- ✅ Next instance creation completes within 500ms
- ✅ Singapore timezone used for all date calculations
- ✅ All E2E tests passing (6 recurrence tests)
- ✅ 17 unit tests for date calculation edge cases

### User Experience Metrics
- ✅ Recurrence badge clearly identifies recurring todos
- ✅ Pattern labels intuitive ("Daily", not "day")
- ✅ Validation messages clear and actionable
- ✅ Next instance appears immediately after completion

## Implementation Checklist

- [ ] Recurrence validation function
- [ ] calculateNextDueDate function with all patterns
- [ ] Handle month-end edge cases
- [ ] Handle leap year edge cases
- [ ] Update PUT /api/todos/[id] to create next instance
- [ ] Tag inheritance logic
- [ ] RecurrenceToggle component
- [ ] RecurrenceBadge component
- [ ] Add recurrence fields to TodoForm
- [ ] E2E tests for all patterns
- [ ] Unit tests for date calculations (17 tests)
- [ ] Test metadata inheritance
- [ ] Test disable recurrence functionality

---

**Last Updated**: February 6, 2026
**Feature Status**: Phase 2 - Core Feature
**Dependencies**: Feature 01 (Todo CRUD), Feature 02 (Priority), Feature 06 (Tags for inheritance)
