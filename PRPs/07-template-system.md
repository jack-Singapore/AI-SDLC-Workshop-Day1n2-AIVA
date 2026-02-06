# Feature 07: Template System

## Feature Overview

Implement a template system that allows users to save common todo patterns (with title, priority, recurrence, reminder, and subtasks) and quickly create new todos from these templates. Templates include a due date offset to calculate when the new todo should be due relative to the current time. This feature streamlines repetitive todo creation and ensures consistency.

## User Stories

**As a user**, I want to:
- Save a todo as a template with a descriptive name
- Include all todo settings in the template (priority, recurrence, reminder, subtasks)
- Organize templates by category (Work, Personal, Health, etc.)
- Add a description to templates explaining when to use them
- See a list of all my templates
- Create a new todo from a template with one click
- Have the due date automatically calculated based on template offset
- Edit template details without affecting existing todos
- Delete templates I no longer need
- Have subtasks automatically created when using a template

## User Flow

### Save Todo as Template
1. User creates a well-configured todo:
   - Title: "Weekly Team Meeting"
   - Priority: High
   - Due date: Tomorrow at 2 PM (offset: +1 day from now)
   - Recurring: Weekly
   - Reminder: 1 hour before
   - Subtasks: "Prepare agenda", "Send calendar invite", "Book meeting room"
2. User clicks "Save as Template" button
3. Modal opens with fields:
   - Template Name: "Weekly Team Meeting Template"
   - Description: "Use for scheduling recurring team meetings"
   - Category: "Work"
   - Due date offset: 1 day (auto-calculated from due date)
4. User clicks "Save Template"
5. Template is saved and appears in templates list

### Create Todo from Template
1. User clicks "Use Template" button
2. Template selection modal opens showing all templates organized by category
3. User selects "Weekly Team Meeting Template"
4. System creates new todo with:
   - Title from template
   - Priority from template
   - Due date = current time + offset (1 day)
   - Recurring settings from template
   - Reminder from template
   - Subtasks created automatically from template
5. New todo appears in Active section
6. User can edit the new todo if needed

### Edit Template
1. User opens templates list
2. User clicks edit on "Weekly Team Meeting Template"
3. Modal opens with current template values
4. User changes category from "Work" to "Meetings"
5. User saves
6. Template updated, but previously created todos are unchanged

### Delete Template
1. User opens templates list
2. User clicks delete on unused template
3. Confirmation: "Delete template 'Old Template'? This won't affect existing todos."
4. User confirms
5. Template removed from list

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  title_template TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date_offset_minutes INTEGER,  -- Offset from now in minutes
  is_recurring BOOLEAN NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  subtasks_json TEXT,  -- JSON array of {title, position}
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
```

### TypeScript Types

```typescript
// lib/db.ts
export interface Template {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  due_date_offset_minutes: number | null;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
  subtasks_json: string | null;  // JSON.stringify([{title, position}])
  created_at: string;
  updated_at: string;
}

export interface SubtaskTemplate {
  title: string;
  position: number;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  category?: string;
  title_template: string;
  priority: Priority;
  due_date_offset_minutes?: number;
  is_recurring: boolean;
  recurrence_pattern?: RecurrencePattern;
  reminder_minutes?: number;
  subtasks?: SubtaskTemplate[];
}
```

### Subtasks JSON Serialization

```typescript
// lib/utils.ts
export function serializeSubtasks(subtasks: { title: string; position: number }[]): string {
  return JSON.stringify(subtasks.map(st => ({
    title: st.title,
    position: st.position,
  })));
}

export function deserializeSubtasks(json: string | null): SubtaskTemplate[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch (error) {
    console.error('Failed to parse subtasks JSON:', error);
    return [];
  }
}
```

### API Endpoints

#### GET /api/templates - List All Templates

```typescript
// app/api/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const templates = templateDB.findAllByUser(session.userId);
  
  return NextResponse.json({ templates });
}
```

#### POST /api/templates - Create Template

```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const body = await request.json();
  const { name, description, category, title_template, priority, due_date_offset_minutes,
    is_recurring, recurrence_pattern, reminder_minutes, subtasks } = body;
  
  // Validate template name
  if (!name || name.trim().length === 0) {
    return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
  }
  
  // Serialize subtasks
  const subtasks_json = subtasks ? serializeSubtasks(subtasks) : null;
  
  const template = templateDB.create({
    user_id: session.userId,
    name: name.trim(),
    description: description?.trim() || null,
    category: category?.trim() || null,
    title_template: title_template.trim(),
    priority: priority || 'medium',
    due_date_offset_minutes: due_date_offset_minutes || null,
    is_recurring: is_recurring || false,
    recurrence_pattern: recurrence_pattern || null,
    reminder_minutes: reminder_minutes || null,
    subtasks_json,
  });
  
  return NextResponse.json(template, { status: 201 });
}
```

#### PUT /api/templates/[id] - Update Template

```typescript
// app/api/templates/[id]/route.ts
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const { id } = await params;
  const body = await request.json();
  
  // Serialize subtasks if provided
  if (body.subtasks !== undefined) {
    body.subtasks_json = body.subtasks ? serializeSubtasks(body.subtasks) : null;
    delete body.subtasks;
  }
  
  const updated = templateDB.update(parseInt(id), session.userId, {
    ...body,
    updated_at: new Date().toISOString(),
  });
  
  if (!updated) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  
  return NextResponse.json(updated);
}
```

#### DELETE /api/templates/[id] - Delete Template

```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const { id } = await params;
  const deleted = templateDB.delete(parseInt(id), session.userId);
  
  if (!deleted) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  
  return NextResponse.json({ message: 'Template deleted successfully' });
}
```

#### POST /api/templates/[id]/use - Create Todo from Template

```typescript
// app/api/templates/[id]/use/route.ts
import { getSingaporeNow } from '@/lib/timezone';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const { id } = await params;
  const template = templateDB.findById(parseInt(id), session.userId);
  
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  
  // Calculate due date from offset
  let due_date = null;
  if (template.due_date_offset_minutes) {
    const now = getSingaporeNow();
    const dueDateTime = new Date(now.getTime() + template.due_date_offset_minutes * 60 * 1000);
    due_date = dueDateTime.toISOString();
  }
  
  // Create todo from template
  const todo = todoDB.create({
    user_id: session.userId,
    title: template.title_template,
    priority: template.priority,
    due_date,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern,
    reminder_minutes: template.reminder_minutes,
    completed: false,
  });
  
  // Create subtasks from template
  if (template.subtasks_json) {
    const subtasks = deserializeSubtasks(template.subtasks_json);
    for (const subtask of subtasks) {
      subtaskDB.create({
        todo_id: todo.id,
        title: subtask.title,
        position: subtask.position,
        completed: false,
      });
    }
  }
  
  return NextResponse.json({ todo, message: 'Todo created from template' }, { status: 201 });
}
```

## UI Components

### Save as Template Button

```typescript
// components/SaveTemplateButton.tsx
'use client';

import { useState } from 'react';
import { Todo } from '@/lib/db';

export function SaveTemplateButton({ todo }: { todo: Todo }) {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
        data-testid="save-as-template-button"
      >
        💾 Save as Template
      </button>
      
      {showModal && (
        <SaveTemplateModal 
          todo={todo} 
          onClose={() => setShowModal(false)} 
        />
      )}
    </>
  );
}
```

### Save Template Modal

```typescript
// components/SaveTemplateModal.tsx
'use client';

import { useState } from 'react';
import { Todo, Priority } from '@/lib/db';

export function SaveTemplateModal({ 
  todo, 
  onClose 
}: { 
  todo: Todo; 
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  
  const handleSave = async () => {
    // Calculate offset if todo has due date
    let due_date_offset_minutes = null;
    if (todo.due_date) {
      const now = new Date();
      const dueDate = new Date(todo.due_date);
      due_date_offset_minutes = Math.round((dueDate.getTime() - now.getTime()) / (60 * 1000));
    }
    
    // Fetch subtasks
    const subtasksResponse = await fetch(`/api/todos/${todo.id}/subtasks`);
    const subtasksData = await subtasksResponse.json();
    const subtasks = subtasksData.subtasks || [];
    
    const response = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        category,
        title_template: todo.title,
        priority: todo.priority,
        due_date_offset_minutes,
        is_recurring: todo.is_recurring,
        recurrence_pattern: todo.recurrence_pattern,
        reminder_minutes: todo.reminder_minutes,
        subtasks: subtasks.map((st: any) => ({
          title: st.title,
          position: st.position,
        })),
      }),
    });
    
    if (response.ok) {
      onClose();
      // Optionally refresh templates list
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full" data-testid="save-template-modal">
        <h2 className="text-xl font-bold mb-4">Save as Template</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Template Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="e.g., Weekly Team Meeting"
              data-testid="template-name-input"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="When to use this template..."
              rows={3}
              data-testid="template-description-input"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="e.g., Work, Personal, Health"
              data-testid="template-category-input"
            />
          </div>
          
          <div className="text-sm text-gray-600">
            <p>Will save:</p>
            <ul className="list-disc list-inside mt-1">
              <li>Priority: {todo.priority}</li>
              {todo.due_date && <li>Due date offset: {Math.round((new Date(todo.due_date).getTime() - Date.now()) / (60 * 60 * 1000))} hours</li>}
              {todo.is_recurring && <li>Recurring: {todo.recurrence_pattern}</li>}
              {todo.reminder_minutes && <li>Reminder: {todo.reminder_minutes} min before</li>}
            </ul>
          </div>
        </div>
        
        <div className="flex gap-2 mt-6">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            data-testid="confirm-save-template"
          >
            Save Template
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-50"
            data-testid="cancel-save-template"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Use Template Button & Modal

```typescript
// components/UseTemplateButton.tsx
'use client';

import { useState } from 'react';

export function UseTemplateButton() {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        data-testid="use-template-button"
      >
        📋 Use Template
      </button>
      
      {showModal && <UseTemplateModal onClose={() => setShowModal(false)} />}
    </>
  );
}
```

### Template Selection Modal

```typescript
// components/UseTemplateModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { Template } from '@/lib/db';

export function UseTemplateModal({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  useEffect(() => {
    fetch('/api/templates')
      .then(res => res.json())
      .then(data => setTemplates(data.templates));
  }, []);
  
  const categories = [...new Set(templates.map(t => t.category).filter(Boolean))];
  const filteredTemplates = selectedCategory
    ? templates.filter(t => t.category === selectedCategory)
    : templates;
  
  const handleUseTemplate = async (templateId: number) => {
    const response = await fetch(`/api/templates/${templateId}/use`, {
      method: 'POST',
    });
    
    if (response.ok) {
      onClose();
      // Optionally refresh todos list
      window.location.reload();
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" data-testid="use-template-modal">
        <h2 className="text-xl font-bold mb-4">Use Template</h2>
        
        {categories.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Filter by Category:</label>
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="px-3 py-2 border rounded"
              data-testid="template-category-filter"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        )}
        
        <div className="space-y-3">
          {filteredTemplates.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No templates found. Create one first!</p>
          ) : (
            filteredTemplates.map(template => (
              <div
                key={template.id}
                className="border rounded p-4 hover:bg-gray-50"
                data-testid={`template-item-${template.id}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold">{template.name}</h3>
                    {template.description && (
                      <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    )}
                    {template.category && (
                      <span className="inline-block mt-2 px-2 py-1 text-xs bg-gray-200 rounded">
                        {template.category}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleUseTemplate(template.id)}
                    className="ml-4 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    data-testid={`use-template-${template.id}`}
                  >
                    Use
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded hover:bg-gray-50"
            data-testid="close-template-modal"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

## Edge Cases

### 1. Template Without Due Date Offset
- **Scenario**: User saves template from todo without due date
- **Handling**: `due_date_offset_minutes` is null
- **Result**: When using template, new todo has no due date

### 2. Negative Offset (Past Due Date)
- **Scenario**: Template saved from overdue todo
- **Handling**: Offset can be negative, but validation on use prevents past due dates
- **Result**: Show error or adjust to minimum future time (+1 minute)

### 3. Empty Subtasks Array
- **Scenario**: Template from todo with no subtasks
- **Handling**: `subtasks_json` is null or "[]"
- **Result**: No subtasks created when using template

### 4. Subtasks JSON Parsing Error
- **Scenario**: Corrupted JSON in database
- **Handling**: `deserializeSubtasks` catches error, returns empty array
- **Result**: Template still usable, just no subtasks

### 5. Duplicate Template Names
- **Scenario**: User creates multiple templates with same name
- **Handling**: Allow duplicates (name is not unique constraint)
- **Result**: All templates shown in list, user chooses by description/category

### 6. Template with Invalid Recurrence
- **Scenario**: Template has is_recurring=true but no pattern
- **Handling**: Validation on template creation
- **Result**: Return 400 error if invalid

### 7. Very Large Offset (Years)
- **Scenario**: Template with offset = 525600 minutes (1 year)
- **Handling**: No validation limit
- **Result**: Due date calculated correctly far in future

### 8. Category Filtering Performance
- **Scenario**: User has 100+ templates
- **Handling**: Client-side filtering is fast enough
- **Future**: Add backend pagination if needed

## Acceptance Criteria

### Must Have
- ✅ Can save any todo as a template
- ✅ Template includes: name, description, category, title, priority, recurrence, reminder
- ✅ Subtasks serialized to JSON and stored in template
- ✅ Due date offset calculated from current time to due date
- ✅ Can create todo from template with one click
- ✅ Due date automatically calculated: current time + offset
- ✅ Subtasks automatically created from template JSON
- ✅ Can edit template details
- ✅ Can delete template (doesn't affect existing todos)
- ✅ Templates list shows all user's templates
- ✅ Category filter works in template selection modal
- ✅ Template name is required
- ✅ Saving template doesn't modify original todo

### Should Have
- ⚠️ Template preview showing all settings before using
- ⚠️ Recently used templates section
- ⚠️ Template usage count tracking
- ⚠️ Duplicate template functionality

### Nice to Have
- ❌ Share templates with other users
- ❌ Public template marketplace
- ❌ Template versioning
- ❌ Undo "use template" action

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/07-template-system.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Template System', () => {
  test('should save todo as template', async ({ page }) => {
    await page.goto('/');
    
    // Create a todo
    await page.fill('[data-testid="todo-title-input"]', 'Template Todo');
    await page.selectOption('[data-testid="todo-priority-select"]', 'high');
    await page.fill('[data-testid="todo-due-date-input"]', '2026-02-10T14:00');
    await page.click('[data-testid="add-todo-button"]');
    
    // Save as template
    await page.click('[data-testid="save-as-template-button"]').first();
    await page.fill('[data-testid="template-name-input"]', 'My Template');
    await page.fill('[data-testid="template-category-input"]', 'Work');
    await page.click('[data-testid="confirm-save-template"]');
    
    // Verify template saved
    await expect(page.locator('[data-testid="save-template-modal"]')).not.toBeVisible();
  });
  
  test('should create todo from template', async ({ page }) => {
    await page.goto('/');
    
    // First create and save a template (setup)
    await page.fill('[data-testid="todo-title-input"]', 'Template Task');
    await page.click('[data-testid="add-todo-button"]');
    await page.click('[data-testid="save-as-template-button"]').first();
    await page.fill('[data-testid="template-name-input"]', 'Quick Template');
    await page.click('[data-testid="confirm-save-template"]');
    
    // Use the template
    await page.click('[data-testid="use-template-button"]');
    await page.click('[data-testid^="use-template-"]').first();
    
    // Verify new todo created
    await expect(page.locator('text=Template Task').nth(1)).toBeVisible();
  });
  
  test('should preserve subtasks in template', async ({ page }) => {
    await page.goto('/');
    
    // Create todo with subtasks
    await page.fill('[data-testid="todo-title-input"]', 'Task with subtasks');
    await page.click('[data-testid="add-todo-button"]');
    
    // Add subtasks
    await page.click('[data-testid^="expand-subtasks-"]').first();
    await page.fill('[data-testid^="add-subtask-input-"]', 'Subtask 1');
    await page.click('[data-testid^="add-subtask-button-"]');
    
    // Save as template
    await page.click('[data-testid="save-as-template-button"]').first();
    await page.fill('[data-testid="template-name-input"]', 'Template with Subtasks');
    await page.click('[data-testid="confirm-save-template"]');
    
    // Use template
    await page.click('[data-testid="use-template-button"]');
    await page.click('[data-testid^="use-template-"]').first();
    
    // Verify subtasks created
    const newTodo = page.locator('[data-testid="todo-item"]').filter({ hasText: 'Task with subtasks' }).nth(1);
    await newTodo.locator('[data-testid^="expand-subtasks-"]').click();
    await expect(newTodo.locator('text=Subtask 1')).toBeVisible();
  });
  
  test('should filter templates by category', async ({ page }) => {
    await page.goto('/');
    
    // Create templates in different categories (setup)
    // ... create template with category "Work"
    // ... create template with category "Personal"
    
    await page.click('[data-testid="use-template-button"]');
    await page.selectOption('[data-testid="template-category-filter"]', 'Work');
    
    // Verify only Work templates shown
    // Implementation depends on template names
  });
  
  test('should calculate due date offset correctly', async ({ page, request }) => {
    // Create template via API with known offset
    const templateResponse = await request.post('/api/templates', {
      data: {
        name: 'Offset Test',
        title_template: 'Task title',
        priority: 'medium',
        due_date_offset_minutes: 1440, // 1 day
      },
    });
    const template = await templateResponse.json();
    
    // Use template
    const useResponse = await request.post(`/api/templates/${template.id}/use`);
    const { todo } = await useResponse.json();
    
    // Verify due date is approximately 1 day from now
    const dueDate = new Date(todo.due_date);
    const now = new Date();
    const diffMinutes = Math.round((dueDate.getTime() - now.getTime()) / (60 * 1000));
    
    expect(diffMinutes).toBeGreaterThanOrEqual(1439);
    expect(diffMinutes).toBeLessThanOrEqual(1441);
  });
});
```

### Unit Tests

```typescript
// tests/template.test.ts
import { serializeSubtasks, deserializeSubtasks } from '@/lib/utils';

describe('Template Utilities', () => {
  describe('serializeSubtasks', () => {
    it('should serialize subtasks to JSON', () => {
      const subtasks = [
        { title: 'Task 1', position: 0 },
        { title: 'Task 2', position: 1 },
      ];
      
      const json = serializeSubtasks(subtasks);
      expect(json).toBe('[{"title":"Task 1","position":0},{"title":"Task 2","position":1}]');
    });
    
    it('should handle empty array', () => {
      const json = serializeSubtasks([]);
      expect(json).toBe('[]');
    });
  });
  
  describe('deserializeSubtasks', () => {
    it('should deserialize JSON to subtasks', () => {
      const json = '[{"title":"Task 1","position":0}]';
      const subtasks = deserializeSubtasks(json);
      
      expect(subtasks).toHaveLength(1);
      expect(subtasks[0].title).toBe('Task 1');
      expect(subtasks[0].position).toBe(0);
    });
    
    it('should return empty array for null', () => {
      const subtasks = deserializeSubtasks(null);
      expect(subtasks).toEqual([]);
    });
    
    it('should return empty array for invalid JSON', () => {
      const subtasks = deserializeSubtasks('invalid json');
      expect(subtasks).toEqual([]);
    });
  });
});
```

## Out of Scope

- Shared/public templates
- Template marketplace
- Template versioning/history
- Template inheritance (templates based on templates)
- Template permissions/roles
- Template analytics
- Template recommendations based on usage
- Bulk template operations

## Success Metrics

### Functional Metrics
- ✅ 100% of template settings preserved when using template
- ✅ Due date offset calculated accurately
- ✅ Subtasks created successfully from JSON
- ✅ Templates categorized and filterable

### Technical Metrics
- ✅ JSON serialization/deserialization error-free
- ✅ Template creation completes in < 500ms
- ✅ Using template creates todo in < 1s
- ✅ All E2E tests passing

### User Experience Metrics
- ✅ Save template takes < 3 clicks
- ✅ Use template takes < 2 clicks
- ✅ Template preview shows all settings
- ✅ Category filter intuitive

## Implementation Checklist

- [ ] Database schema for templates table
- [ ] API endpoints (GET, POST, PUT, DELETE templates)
- [ ] POST /api/templates/[id]/use endpoint
- [ ] serializeSubtasks and deserializeSubtasks utilities
- [ ] SaveTemplateButton component
- [ ] SaveTemplateModal component
- [ ] UseTemplateButton component
- [ ] UseTemplateModal component with category filter
- [ ] Template list UI
- [ ] Due date offset calculation logic
- [ ] Subtasks JSON handling
- [ ] E2E tests for save, use, edit, delete
- [ ] Unit tests for serialization
- [ ] Template validation

---

**Last Updated**: February 6, 2026
**Feature Status**: Phase 4 - Productivity Feature
**Dependencies**: Feature 01 (CRUD), Feature 05 (Subtasks for JSON serialization)
