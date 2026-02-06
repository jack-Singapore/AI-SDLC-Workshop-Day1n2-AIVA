# Feature 09: Export & Import

## Feature Overview

Implement a robust export/import system that allows users to backup and restore their todos, including all metadata (priority, recurrence, reminders), subtasks, tags, and tag associations. The system uses JSON format, handles ID remapping on import, prevents duplicate tags, and validates data integrity.

## User Stories

**As a user**, I want to:
- Export all my todos to a JSON file for backup
- Export includes todos, subtasks, tags, and all associations
- Import a previously exported JSON file to restore my data
- Have IDs automatically remapped on import to avoid conflicts
- See a success message showing what was imported (X todos, Y tags, Z subtasks)
- Have duplicate tag names reused instead of creating duplicates
- Get clear error messages if import file is invalid
- Be able to import multiple times without issues
- Preserve all todo metadata in export/import (priority, recurrence, reminders)

## User Flow

### Export Todos
1. User clicks "Export Todos" button
2. System gathers all todos, subtasks, tags, and associations for current user
3. JSON file is generated with structure:
   ```json
   {
     "version": "1.0",
     "exported_at": "2026-02-06T10:00:00Z",
     "todos": [...],
     "subtasks": [...],
     "tags": [...],
     "todo_tags": [...]
   }
   ```
4. Browser downloads file: `todos-export-2026-02-06.json`
5. User sees success message: "Exported 15 todos successfully"

### Import Todos
1. User clicks "Import Todos" button
2. File picker dialog opens
3. User selects previously exported JSON file
4. System validates JSON format and structure
5. System processes import:
   - Creates ID mapping for todos (old ID → new ID)
   - Creates ID mapping for tags (reuses existing if name matches)
   - Creates todos with new IDs
   - Creates subtasks with remapped todo_ids
   - Creates tag associations with remapped IDs
6. Success message: "Imported 15 todos, 8 tags, 23 subtasks"
7. Todos appear in list immediately

### Import with Existing Tags
1. User has tag "work" (id: 1)
2. User imports file containing tag "work" (old id: 5)
3. System detects duplicate tag name
4. System reuses existing tag id: 1
5. Tag associations use existing tag instead of creating duplicate
6. Result: No duplicate "work" tags

### Invalid Import File
1. User selects a text file instead of JSON
2. System attempts to parse, fails
3. Error message: "Invalid JSON file. Please select a valid export file."
4. No changes made to database
5. User can try again with correct file

## Technical Requirements

### Export JSON Structure

```typescript
// lib/types.ts
export interface ExportData {
  version: string;
  exported_at: string;
  todos: {
    id: number;
    title: string;
    completed: boolean;
    priority: Priority;
    due_date: string | null;
    is_recurring: boolean;
    recurrence_pattern: RecurrencePattern;
    reminder_minutes: number | null;
    created_at: string;
    completed_at: string | null;
  }[];
  subtasks: {
    id: number;
    todo_id: number;  // References old todo ID
    title: string;
    completed: boolean;
    position: number;
  }[];
  tags: {
    id: number;
    name: string;
    color: string;
  }[];
  todo_tags: {
    todo_id: number;  // References old todo ID
    tag_id: number;   // References old tag ID
  }[];
}
```

### ID Remapping Logic

```typescript
// lib/import.ts
export function remapIds(exportData: ExportData, userId: number): {
  todoIdMap: Map<number, number>;
  tagIdMap: Map<number, number>;
} {
  const todoIdMap = new Map<number, number>();
  const tagIdMap = new Map<number, number>();
  
  // Process tags first (to reuse existing ones)
  for (const tag of exportData.tags) {
    // Check if tag with same name already exists
    const existing = tagDB.findByName(userId, tag.name);
    
    if (existing) {
      // Reuse existing tag
      tagIdMap.set(tag.id, existing.id);
    } else {
      // Create new tag
      const newTag = tagDB.create({
        user_id: userId,
        name: tag.name,
        color: tag.color,
      });
      tagIdMap.set(tag.id, newTag.id);
    }
  }
  
  // Process todos
  for (const todo of exportData.todos) {
    const newTodo = todoDB.create({
      user_id: userId,
      title: todo.title,
      completed: todo.completed,
      priority: todo.priority,
      due_date: todo.due_date,
      is_recurring: todo.is_recurring,
      recurrence_pattern: todo.recurrence_pattern,
      reminder_minutes: todo.reminder_minutes,
      // Note: created_at and completed_at from import, not current time
    });
    todoIdMap.set(todo.id, newTodo.id);
  }
  
  return { todoIdMap, tagIdMap };
}
```

### Validation

```typescript
// lib/validation.ts
export function validateImportData(data: any): { valid: boolean; error?: string } {
  // Check version field
  if (!data.version || typeof data.version !== 'string') {
    return { valid: false, error: 'Missing or invalid version field' };
  }
  
  // Check required arrays
  if (!Array.isArray(data.todos)) {
    return { valid: false, error: 'Missing or invalid todos array' };
  }
  
  if (!Array.isArray(data.subtasks)) {
    return { valid: false, error: 'Missing or invalid subtasks array' };
  }
  
  if (!Array.isArray(data.tags)) {
    return { valid: false, error: 'Missing or invalid tags array' };
  }
  
  if (!Array.isArray(data.todo_tags)) {
    return { valid: false, error: 'Missing or invalid todo_tags array' };
  }
  
  // Validate each todo has required fields
  for (const todo of data.todos) {
    if (!todo.title || typeof todo.title !== 'string') {
      return { valid: false, error: 'Todo missing required field: title' };
    }
    if (todo.priority && !['high', 'medium', 'low'].includes(todo.priority)) {
      return { valid: false, error: `Invalid priority: ${todo.priority}` };
    }
  }
  
  return { valid: true };
}
```

### API Endpoints

#### GET /api/todos/export - Export All Todos

```typescript
// app/api/todos/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB, tagDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  // Fetch all data for user
  const todos = todoDB.findAllByUser(session.userId);
  const allSubtasks = [];
  const todoTagAssociations = [];
  
  // Fetch subtasks and tag associations for each todo
  for (const todo of todos) {
    const subtasks = subtaskDB.findByTodoId(todo.id);
    allSubtasks.push(...subtasks);
    
    const todoTags = tagDB.getTagsForTodo(todo.id);
    todoTagAssociations.push(...todoTags.map(tag => ({
      todo_id: todo.id,
      tag_id: tag.id,
    })));
  }
  
  const tags = tagDB.findAllByUser(session.userId);
  
  const exportData: ExportData = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    todos: todos.map(t => ({
      id: t.id,
      title: t.title,
      completed: t.completed,
      priority: t.priority,
      due_date: t.due_date,
      is_recurring: t.is_recurring,
      recurrence_pattern: t.recurrence_pattern,
      reminder_minutes: t.reminder_minutes,
      created_at: t.created_at,
      completed_at: t.completed_at,
    })),
    subtasks: allSubtasks.map(s => ({
      id: s.id,
      todo_id: s.todo_id,
      title: s.title,
      completed: s.completed,
      position: s.position,
    })),
    tags: tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })),
    todo_tags: todoTagAssociations,
  };
  
  return NextResponse.json(exportData);
}
```

#### POST /api/todos/import - Import Todos from JSON

```typescript
// app/api/todos/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { validateImportData, remapIds } from '@/lib/import';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  try {
    const importData = await request.json();
    
    // Validate structure
    const validation = validateImportData(importData);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    
    // Remap IDs and create entities
    const { todoIdMap, tagIdMap } = remapIds(importData, session.userId);
    
    // Create subtasks with remapped todo_ids
    for (const subtask of importData.subtasks) {
      const newTodoId = todoIdMap.get(subtask.todo_id);
      if (!newTodoId) continue; // Skip if todo wasn't created
      
      subtaskDB.create({
        todo_id: newTodoId,
        title: subtask.title,
        completed: subtask.completed,
        position: subtask.position,
      });
    }
    
    // Create tag associations with remapped IDs
    for (const association of importData.todo_tags) {
      const newTodoId = todoIdMap.get(association.todo_id);
      const newTagId = tagIdMap.get(association.tag_id);
      
      if (newTodoId && newTagId) {
        tagDB.assignTagToTodo(newTodoId, newTagId);
      }
    }
    
    return NextResponse.json({
      message: 'Import successful',
      stats: {
        todos: importData.todos.length,
        subtasks: importData.subtasks.length,
        tags: importData.tags.length,
      },
    }, { status: 201 });
    
  } catch (error) {
    return NextResponse.json({ 
      error: 'Invalid JSON format. Please check your file.' 
    }, { status: 400 });
  }
}
```

## UI Components

### Export Button Component

```typescript
// components/ExportButton.tsx
'use client';

import { useState } from 'react';

export function ExportButton() {
  const [loading, setLoading] = useState(false);
  
  const handleExport = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/todos/export');
      const data = await response.json();
      
      // Create downloadable file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todos-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert(`Exported ${data.todos.length} todos successfully!`);
    } catch (error) {
      alert('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      data-testid="export-button"
    >
      {loading ? 'Exporting...' : '📥 Export Todos'}
    </button>
  );
}
```

### Import Button Component

```typescript
// components/ImportButton.tsx
'use client';

import { useState, useRef } from 'react';

export function ImportButton({ onImportSuccess }: { onImportSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const response = await fetch('/api/todos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }
      
      const result = await response.json();
      alert(
        `Import successful!\n` +
        `Todos: ${result.stats.todos}\n` +
        `Tags: ${result.stats.tags}\n` +
        `Subtasks: ${result.stats.subtasks}`
      );
      
      onImportSuccess?.();
      
    } catch (error) {
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImport}
        className="hidden"
        data-testid="import-file-input"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        data-testid="import-button"
      >
        {loading ? 'Importing...' : '📤 Import Todos'}
      </button>
    </>
  );
}
```

## Edge Cases

### 1. Empty Export
- **Scenario**: User has no todos and clicks Export
- **Handling**: Export empty arrays: `{todos: [], subtasks: [], tags: [], todo_tags: []}`
- **Result**: Valid JSON file that can be imported (does nothing)

### 2. Duplicate Tag Names
- **Scenario**: Import file has tag "work", user already has tag "work"
- **Handling**: Reuse existing tag, don't create duplicate
- **Implementation**: Check `tagDB.findByName()` before creating

### 3. Invalid JSON Syntax
- **Scenario**: User selects corrupted/invalid JSON file
- **Handling**: Try-catch around JSON.parse(), return 400 error
- **Error**: "Invalid JSON format. Please check your file."

### 4. Missing Required Fields
- **Scenario**: Import JSON missing `title` field on a todo
- **Handling**: Validation catches this, returns 400 error
- **Error**: "Todo missing required field: title"

### 5. Very Large Import (1000+ Todos)
- **Scenario**: User imports huge backup file
- **Handling**: Process sequentially, may take 5-10 seconds
- **Future**: Add progress indicator or batch processing

### 6. Import Same File Twice
- **Scenario**: User imports same file twice by mistake
- **Handling**: Creates duplicates (expected behavior)
- **Note**: Each import creates new todos with new IDs

### 7. Tag Color Format Mismatch
- **Scenario**: Old export has color "#ff0000", new system expects hex
- **Handling**: Validate color format, use default if invalid
- **Default**: "#6B7280" (gray)

### 8. Orphaned Subtasks in Import
- **Scenario**: Import has subtask with `todo_id: 999` but no todo with that ID
- **Handling**: Skip subtask if todo_id not in todoIdMap
- **Result**: Partial import, subtask not created

### 9. Unicode Characters in Titles
- **Scenario**: Todo title contains emoji or special characters
- **Handling**: JSON.stringify handles Unicode properly
- **Result**: Characters preserved correctly

## Acceptance Criteria

### Must Have
- ✅ Export button creates JSON file with all data
- ✅ Export includes: todos, subtasks, tags, todo_tags
- ✅ Export file has version field for future compatibility
- ✅ Import button opens file picker
- ✅ Import accepts only .json files
- ✅ Import validates JSON structure
- ✅ Import validates required fields
- ✅ ID remapping works correctly for todos and tags
- ✅ Duplicate tag names reused, not duplicated
- ✅ Subtasks created with correct remapped todo_ids
- ✅ Tag associations created with remapped IDs
- ✅ Success message shows import statistics
- ✅ Error message for invalid files
- ✅ All metadata preserved (priority, recurrence, reminders)
- ✅ Todos appear in list immediately after import

### Should Have
- ⚠️ Progress indicator for large imports
- ⚠️ Preview import before confirming
- ⚠️ Undo import functionality
- ⚠️ Merge conflict resolution (if importing duplicate data)

### Nice to Have
- ❌ CSV export format
- ❌ Selective import (choose which todos to import)
- ❌ Import from other todo apps (Todoist, Microsoft To Do)
- ❌ Automatic periodic backups
- ❌ Cloud storage integration (Google Drive, Dropbox)

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/09-export-import.spec.ts
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Export & Import', () => {
  test('should export todos to JSON', async ({ page }) => {
    await page.goto('/');
    
    // Create a todo
    await page.fill('[data-testid="todo-title-input"]', 'Export test todo');
    await page.click('[data-testid="add-todo-button"]');
    
    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-button"]');
    const download = await downloadPromise;
    
    // Verify file downloaded
    expect(download.suggestedFilename()).toMatch(/todos-export-\d{4}-\d{2}-\d{2}\.json/);
    
    // Verify content
    const filePath = await download.path();
    const content = fs.readFileSync(filePath!, 'utf-8');
    const data = JSON.parse(content);
    
    expect(data.version).toBe('1.0');
    expect(data.todos).toBeDefined();
    expect(data.todos.length).toBeGreaterThan(0);
  });
  
  test('should import todos from JSON', async ({ page }) => {
    // Create test import file
    const testData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      todos: [
        {
          id: 1,
          title: 'Imported todo',
          completed: false,
          priority: 'high',
          due_date: null,
          is_recurring: false,
          recurrence_pattern: null,
          reminder_minutes: null,
          created_at: new Date().toISOString(),
          completed_at: null,
        },
      ],
      subtasks: [],
      tags: [],
      todo_tags: [],
    };
    
    const tempFile = path.join(__dirname, 'temp-import.json');
    fs.writeFileSync(tempFile, JSON.stringify(testData));
    
    await page.goto('/');
    
    // Import
    await page.setInputFiles('[data-testid="import-file-input"]', tempFile);
    
    // Wait for import to complete
    await page.waitForTimeout(500);
    
    // Verify todo imported
    await expect(page.locator('text=Imported todo')).toBeVisible();
    
    // Cleanup
    fs.unlinkSync(tempFile);
  });
  
  test('should preserve all metadata on export/import', async ({ page }) => {
    await page.goto('/');
    
    // Create todo with all metadata
    await page.fill('[data-testid="todo-title-input"]', 'Full metadata todo');
    await page.selectOption('[data-testid="todo-priority-select"]', 'high');
    await page.fill('[data-testid="todo-due-date-input"]', '2026-02-10T14:00');
    await page.check('[data-testid="recurring-checkbox"]');
    await page.selectOption('[data-testid="recurrence-pattern-select"]', 'weekly');
    await page.selectOption('[data-testid="reminder-select"]', '60');
    await page.click('[data-testid="add-todo-button"]');
    
    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-button"]');
    const download = await downloadPromise;
    
    const filePath = await download.path();
    const content = fs.readFileSync(filePath!, 'utf-8');
    const data = JSON.parse(content);
    
    const todo = data.todos[0];
    expect(todo.priority).toBe('high');
    expect(todo.is_recurring).toBe(true);
    expect(todo.recurrence_pattern).toBe('weekly');
    expect(todo.reminder_minutes).toBe(60);
  });
  
  test('should handle invalid JSON gracefully', async ({ page }) => {
    const tempFile = path.join(__dirname, 'invalid.json');
    fs.writeFileSync(tempFile, 'not valid json{');
    
    await page.goto('/');
    
    // Attempt import
    await page.setInputFiles('[data-testid="import-file-input"]', tempFile);
    
    // Should show error
    await expect(page.locator('text=Invalid JSON')).toBeVisible();
    
    fs.unlinkSync(tempFile);
  });
  
  test('should reuse existing tags on import', async ({ page }) => {
    await page.goto('/');
    
    // Create tag
    await page.click('[data-testid="manage-tags-button"]');
    await page.fill('[data-testid="tag-name-input"]', 'work');
    await page.fill('[data-testid="tag-color-input"]', '#3B82F6');
    await page.click('[data-testid="create-tag-button"]');
    await page.click('[data-testid="close-tags-modal"]');
    
    // Import file with same tag name
    const testData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      todos: [{ id: 1, title: 'Test', /* ... */ }],
      subtasks: [],
      tags: [{ id: 5, name: 'work', color: '#FF0000' }],
      todo_tags: [{ todo_id: 1, tag_id: 5 }],
    };
    
    const tempFile = path.join(__dirname, 'tag-test.json');
    fs.writeFileSync(tempFile, JSON.stringify(testData));
    
    await page.setInputFiles('[data-testid="import-file-input"]', tempFile);
    await page.waitForTimeout(500);
    
    // Verify only one "work" tag exists
    await page.click('[data-testid="manage-tags-button"]');
    const workTags = page.locator('[data-testid="tag-item"]').filter({ hasText: 'work' });
    await expect(workTags).toHaveCount(1);
    
    fs.unlinkSync(tempFile);
  });
});
```

### Unit Tests

```typescript
// tests/import.test.ts
import { validateImportData, remapIds } from '@/lib/import';

describe('Import Validation', () => {
  it('should validate correct structure', () => {
    const data = {
      version: '1.0',
      todos: [],
      subtasks: [],
      tags: [],
      todo_tags: [],
    };
    
    const result = validateImportData(data);
    expect(result.valid).toBe(true);
  });
  
  it('should reject missing version', () => {
    const data = {
      todos: [],
      subtasks: [],
      tags: [],
      todo_tags: [],
    };
    
    const result = validateImportData(data);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('version');
  });
  
  it('should reject invalid priority', () => {
    const data = {
      version: '1.0',
      todos: [{ title: 'Test', priority: 'urgent' }],
      subtasks: [],
      tags: [],
      todo_tags: [],
    };
    
    const result = validateImportData(data);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid priority');
  });
});

describe('ID Remapping', () => {
  it('should create todo ID mappings', () => {
    const exportData = {
      todos: [{ id: 1, title: 'Todo 1' }, { id: 2, title: 'Todo 2' }],
      tags: [],
      subtasks: [],
      todo_tags: [],
    };
    
    const { todoIdMap } = remapIds(exportData, 1);
    
    expect(todoIdMap.has(1)).toBe(true);
    expect(todoIdMap.has(2)).toBe(true);
    expect(todoIdMap.get(1)).not.toBe(1); // New ID is different
  });
  
  it('should reuse existing tag IDs', () => {
    // Mock existing tag
    const existingTag = { id: 10, name: 'work', color: '#000' };
    
    const exportData = {
      todos: [],
      tags: [{ id: 5, name: 'work', color: '#FFF' }],
      subtasks: [],
      todo_tags: [],
    };
    
    const { tagIdMap } = remapIds(exportData, 1);
    
    expect(tagIdMap.get(5)).toBe(existingTag.id); // Reused existing
  });
});
```

## Out of Scope

- CSV export format
- Partial/selective import
- Import preview before confirmation
- Undo import
- Version migration (handling old export formats)
- Import from other apps (Todoist, Trello, etc.)
- Automatic periodic backups
- Cloud sync integration
- Conflict resolution UI

## Success Metrics

### Functional Metrics
- ✅ 100% of todos exported successfully
- ✅ 100% of metadata preserved in export/import
- ✅ Zero duplicate tags created on import
- ✅ ID remapping works for all entities

### Technical Metrics
- ✅ Export completes in < 1s for 1000 todos
- ✅ Import completes in < 5s for 1000 todos
- ✅ JSON validation catches all invalid formats
- ✅ All E2E tests passing

### User Experience Metrics
- ✅ Export is one-click operation
- ✅ Import provides clear success/error feedback
- ✅ Statistics message is informative
- ✅ File naming is intuitive

## Implementation Checklist

- [ ] GET /api/todos/export endpoint
- [ ] POST /api/todos/import endpoint
- [ ] validateImportData function
- [ ] remapIds function with tag reuse logic
- [ ] ExportButton component with file download
- [ ] ImportButton component with file picker
- [ ] JSON serialization for export
- [ ] JSON parsing and validation for import
- [ ] ID mapping for todos, tags, subtasks
- [ ] Tag duplication prevention
- [ ] Success/error messages
- [ ] E2E tests for export and import
- [ ] Unit tests for validation and ID remapping
- [ ] Handle edge cases (empty export, invalid JSON)

---

**Last Updated**: February 6, 2026
**Feature Status**: Phase 4 - Productivity Feature
**Dependencies**: Feature 01 (CRUD), Feature 05 (Subtasks), Feature 06 (Tags)
