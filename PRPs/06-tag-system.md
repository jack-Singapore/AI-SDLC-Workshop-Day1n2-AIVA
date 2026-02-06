# Feature 06: Tag System

## Feature Overview

Implement a flexible tagging system that allows users to categorize and organize todos with custom color-coded labels. Tags provide a many-to-many relationship between todos and categories, enabling advanced filtering and organization. Users can create, edit, and delete tags with custom names and colors, assign multiple tags to each todo, and filter their todo list by clicking on tag badges.

## User Stories

**As a user**, I want to:
- Create custom tags with unique names and colors to categorize my todos
- Assign multiple tags to each todo for flexible organization
- See tags as colored badges on todos for quick visual identification
- Edit tag names and colors with changes automatically reflected on all todos
- Delete tags I no longer need with automatic removal from all todos
- Filter todos by clicking a tag badge to see only items with that tag
- Prevent duplicate tag names to avoid confusion
- Have tag colors persist and display correctly in both light and dark modes
- Manage all my tags in a centralized modal interface
- See which tags are assigned to each todo at a glance

## User Flow

### Create Tag Flow
1. User clicks "Manage Tags" button (top of page or in filter section)
2. Tag management modal opens showing:
   - Tag creation form at top
   - List of existing tags below
3. User enters tag name in text input field
4. User selects color using color picker or enters hex code
5. User clicks "Create Tag" button
6. System validates:
   - Tag name is not empty (after trimming)
   - Tag name is unique for this user (case-insensitive)
   - Color is valid hex format
7. Tag appears immediately in tags list
8. Success message displays
9. Form clears for next tag creation

### Edit Tag Flow
1. User opens "Manage Tags" modal
2. User locates tag in list
3. User clicks "Edit" button next to tag
4. Edit form appears inline or in modal with:
   - Tag name pre-filled
   - Current color selected in picker
5. User modifies name and/or color
6. User clicks "Update" or "Save" button
7. System validates (same as create)
8. Tag updates immediately
9. All todos with this tag reflect new name/color instantly
10. Success message displays

### Delete Tag Flow
1. User opens "Manage Tags" modal
2. User locates tag to delete
3. User clicks "Delete" button next to tag
4. Confirmation dialog appears: "Delete tag '[name]'? This will remove it from all todos."
5. User confirms deletion
6. Tag is removed from database
7. Tag-todo associations are deleted (CASCADE)
8. Tag disappears from modal list
9. Tag badges removed from all todos in UI
10. Success message displays

### Assign Tags to Todo Flow
1. User creates new todo or edits existing todo
2. Tag selection section visible in form (if tags exist)
3. Tags displayed as clickable pills/badges with:
   - Tag name
   - Tag color as background or border
   - Checkbox or checkmark indicator
4. User clicks tag pills to toggle selection
5. Selected tags highlighted with:
   - Solid color background
   - White text
   - Checkmark (✓) icon
6. Unselected tags shown with:
   - Light background or border only
   - Dark text
   - No checkmark
7. User can select multiple tags
8. User saves todo
9. Selected tags associated with todo in database
10. Tag badges appear on todo in list view

### Filter by Tag Flow
1. User sees todos with tag badges displayed
2. User clicks on a tag badge (anywhere in UI)
3. Todo list filters to show only todos with that tag
4. Active filter indicator appears:
   - "Filtered by tag: [tag name]" message
   - Clear filter (✕) button
5. Filtered todos remain organized in sections (Overdue, Active, Completed)
6. User can:
   - Click clear filter button to see all todos
   - Click different tag to change filter
   - Use other filters simultaneously (priority, search)
7. Filter persists during session (until cleared or changed)

### View Tag Badges Flow
1. User views todo list
2. Tags appear on each todo as colored badges:
   - After priority badge
   - Before or after recurrence badge
   - Multiple tags shown in row (wrapping on mobile)
3. Each badge shows:
   - Tag name in white text
   - Tag color as background
   - Rounded pill shape
   - Small padding for readability
4. Clicking badge triggers filter (see Filter by Tag Flow)
5. Badges adapt colors for dark mode readability

## Technical Requirements

### Database Schema

```sql
-- Tags table
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, name)
);

-- Many-to-many relationship table
CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_todo_tags_todo_id ON todo_tags(todo_id);
CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_id ON todo_tags(tag_id);
```

**Key Schema Decisions:**
- `UNIQUE(user_id, name)`: Prevents duplicate tag names per user
- `CASCADE DELETE`: Deleting tag removes all todo_tags associations
- `CASCADE DELETE`: Deleting todo removes all todo_tags associations
- `color` default: Blue (#3B82F6) for consistency
- Composite PRIMARY KEY on todo_tags for efficient lookups

### TypeScript Types

```typescript
// lib/db.ts
export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string; // Hex color code (e.g., "#3B82F6")
  created_at: string;
}

export interface TodoTag {
  todo_id: number;
  tag_id: number;
}

export interface TodoWithTags extends Todo {
  tags?: Tag[];
}

export interface TagWithCount extends Tag {
  todo_count: number; // Number of todos with this tag
}
```

### Validation Rules

```typescript
// lib/validation.ts
export function validateTagName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Tag name cannot be empty' };
  }
  
  if (trimmed.length > 50) {
    return { valid: false, error: 'Tag name cannot exceed 50 characters' };
  }
  
  // Allow letters, numbers, spaces, hyphens, underscores
  const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: 'Tag name can only contain letters, numbers, spaces, hyphens, and underscores' };
  }
  
  return { valid: true };
}

export function validateTagColor(color: string): { valid: boolean; error?: string } {
  // Hex color pattern: #RRGGBB
  const hexPattern = /^#[0-9A-Fa-f]{6}$/;
  
  if (!hexPattern.test(color)) {
    return { valid: false, error: 'Color must be a valid hex code (e.g., #3B82F6)' };
  }
  
  return { valid: true };
}
```

### API Endpoints

#### GET /api/tags - List All Tags

**Request:**
```typescript
// app/api/tags/route.ts
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const tags = tagDB.getAllByUser(session.userId);
  
  return NextResponse.json({ tags });
}
```

**Response (200):**
```json
{
  "tags": [
    {
      "id": 1,
      "user_id": 1,
      "name": "Work",
      "color": "#3B82F6",
      "created_at": "2025-11-02T10:00:00+08:00"
    },
    {
      "id": 2,
      "user_id": 1,
      "name": "Personal",
      "color": "#10B981",
      "created_at": "2025-11-02T10:05:00+08:00"
    }
  ]
}
```

#### POST /api/tags - Create Tag

**Request:**
```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { name, color = '#3B82F6' } = body;

  // Validate name
  const nameValidation = validateTagName(name);
  if (!nameValidation.valid) {
    return NextResponse.json({ error: nameValidation.error }, { status: 400 });
  }

  // Validate color
  const colorValidation = validateTagColor(color);
  if (!colorValidation.valid) {
    return NextResponse.json({ error: colorValidation.error }, { status: 400 });
  }

  // Check for duplicate name (case-insensitive)
  const existing = tagDB.getByName(session.userId, name.trim());
  if (existing) {
    return NextResponse.json(
      { error: 'Tag with this name already exists' },
      { status: 400 }
    );
  }

  // Create tag
  const tag = tagDB.create({
    user_id: session.userId,
    name: name.trim(),
    color: color.toUpperCase(),
  });

  return NextResponse.json(tag, { status: 201 });
}
```

**Request Body:**
```json
{
  "name": "Urgent",
  "color": "#EF4444"
}
```

**Response (201):**
```json
{
  "id": 3,
  "user_id": 1,
  "name": "Urgent",
  "color": "#EF4444",
  "created_at": "2025-11-02T11:00:00+08:00"
}
```

**Error Responses:**
- 400: Invalid name format, invalid color, duplicate name
- 401: Not authenticated

#### PUT /api/tags/[id] - Update Tag

**Request:**
```typescript
// app/api/tags/[id]/route.ts
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const tagId = parseInt(id);
  const body = await request.json();

  // Verify tag ownership
  const tag = tagDB.get(tagId);
  if (!tag || tag.user_id !== session.userId) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  const updates: Partial<Tag> = {};

  // Validate and update name
  if (body.name !== undefined) {
    const nameValidation = validateTagName(body.name);
    if (!nameValidation.valid) {
      return NextResponse.json({ error: nameValidation.error }, { status: 400 });
    }

    // Check for duplicate (excluding current tag)
    const existing = tagDB.getByName(session.userId, body.name.trim());
    if (existing && existing.id !== tagId) {
      return NextResponse.json(
        { error: 'Tag with this name already exists' },
        { status: 400 }
      );
    }

    updates.name = body.name.trim();
  }

  // Validate and update color
  if (body.color !== undefined) {
    const colorValidation = validateTagColor(body.color);
    if (!colorValidation.valid) {
      return NextResponse.json({ error: colorValidation.error }, { status: 400 });
    }

    updates.color = body.color.toUpperCase();
  }

  // Update tag
  const updated = tagDB.update(tagId, updates);

  return NextResponse.json(updated);
}
```

**Request Body:**
```json
{
  "name": "High Priority",
  "color": "#F59E0B"
}
```

**Response (200):**
```json
{
  "id": 3,
  "user_id": 1,
  "name": "High Priority",
  "color": "#F59E0B",
  "created_at": "2025-11-02T11:00:00+08:00"
}
```

#### DELETE /api/tags/[id] - Delete Tag

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
  const tagId = parseInt(id);

  // Verify tag ownership
  const tag = tagDB.get(tagId);
  if (!tag || tag.user_id !== session.userId) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  // Delete tag (CASCADE deletes todo_tags associations)
  tagDB.delete(tagId);

  return NextResponse.json({ message: 'Tag deleted' });
}
```

**Response (200):**
```json
{
  "message": "Tag deleted"
}
```

#### POST /api/todos/[id]/tags - Assign Tag to Todo

**Request:**
```typescript
// app/api/todos/[id]/tags/route.ts
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
  const { tag_id } = body;

  // Verify todo ownership
  const todo = todoDB.get(todoId, session.userId);
  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Verify tag ownership
  const tag = tagDB.get(tag_id);
  if (!tag || tag.user_id !== session.userId) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  // Check if already assigned
  const existing = todoTagDB.get(todoId, tag_id);
  if (existing) {
    return NextResponse.json(
      { error: 'Tag already assigned to todo' },
      { status: 400 }
    );
  }

  // Create association
  todoTagDB.create(todoId, tag_id);

  return NextResponse.json({ message: 'Tag assigned' }, { status: 201 });
}
```

**Request Body:**
```json
{
  "tag_id": 2
}
```

**Response (201):**
```json
{
  "message": "Tag assigned"
}
```

#### DELETE /api/todos/[id]/tags/[tagId] - Remove Tag from Todo

**Request:**
```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id, tagId } = await params;
  const todoId = parseInt(id);
  const tagIdNum = parseInt(tagId);

  // Verify todo ownership
  const todo = todoDB.get(todoId, session.userId);
  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Delete association
  todoTagDB.delete(todoId, tagIdNum);

  return NextResponse.json({ message: 'Tag removed' });
}
```

**Response (200):**
```json
{
  "message": "Tag removed"
}
```

### Database Operations (lib/db.ts)

```typescript
// lib/db.ts
export const tagDB = {
  create(data: Omit<Tag, 'id' | 'created_at'>): Tag {
    const stmt = db.prepare(`
      INSERT INTO tags (user_id, name, color)
      VALUES (?, ?, ?)
    `);
    
    const info = stmt.run(data.user_id, data.name, data.color);
    
    return this.get(Number(info.lastInsertRowid))!;
  },

  get(id: number): Tag | null {
    const stmt = db.prepare('SELECT * FROM tags WHERE id = ?');
    return stmt.get(id) as Tag | null;
  },

  getByName(userId: number, name: string): Tag | null {
    const stmt = db.prepare(`
      SELECT * FROM tags 
      WHERE user_id = ? AND LOWER(name) = LOWER(?)
    `);
    return stmt.get(userId, name) as Tag | null;
  },

  getAllByUser(userId: number): Tag[] {
    const stmt = db.prepare(`
      SELECT * FROM tags 
      WHERE user_id = ? 
      ORDER BY name ASC
    `);
    return stmt.all(userId) as Tag[];
  },

  update(id: number, data: Partial<Tag>): Tag | null {
    const fields = [];
    const values = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.color !== undefined) {
      fields.push('color = ?');
      values.push(data.color);
    }

    if (fields.length === 0) return this.get(id);

    values.push(id);

    const stmt = db.prepare(`
      UPDATE tags 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `);
    
    stmt.run(...values);
    
    return this.get(id);
  },

  delete(id: number): void {
    const stmt = db.prepare('DELETE FROM tags WHERE id = ?');
    stmt.run(id);
  },
};

export const todoTagDB = {
  create(todoId: number, tagId: number): void {
    const stmt = db.prepare(`
      INSERT INTO todo_tags (todo_id, tag_id)
      VALUES (?, ?)
    `);
    stmt.run(todoId, tagId);
  },

  get(todoId: number, tagId: number): TodoTag | null {
    const stmt = db.prepare(`
      SELECT * FROM todo_tags 
      WHERE todo_id = ? AND tag_id = ?
    `);
    return stmt.get(todoId, tagId) as TodoTag | null;
  },

  getTagsByTodoId(todoId: number): Tag[] {
    const stmt = db.prepare(`
      SELECT t.* FROM tags t
      INNER JOIN todo_tags tt ON t.id = tt.tag_id
      WHERE tt.todo_id = ?
      ORDER BY t.name ASC
    `);
    return stmt.all(todoId) as Tag[];
  },

  getTodosByTagId(tagId: number): number[] {
    const stmt = db.prepare(`
      SELECT todo_id FROM todo_tags 
      WHERE tag_id = ?
    `);
    const rows = stmt.all(tagId) as { todo_id: number }[];
    return rows.map(row => row.todo_id);
  },

  delete(todoId: number, tagId: number): void {
    const stmt = db.prepare(`
      DELETE FROM todo_tags 
      WHERE todo_id = ? AND tag_id = ?
    `);
    stmt.run(todoId, tagId);
  },

  deleteByTodoId(todoId: number): void {
    const stmt = db.prepare('DELETE FROM todo_tags WHERE todo_id = ?');
    stmt.run(todoId);
  },

  deleteByTagId(tagId: number): void {
    const stmt = db.prepare('DELETE FROM todo_tags WHERE tag_id = ?');
    stmt.run(tagId);
  },

  setTagsForTodo(todoId: number, tagIds: number[]): void {
    // Delete existing associations
    this.deleteByTodoId(todoId);

    // Create new associations
    if (tagIds.length > 0) {
      const stmt = db.prepare(`
        INSERT INTO todo_tags (todo_id, tag_id)
        VALUES (?, ?)
      `);

      for (const tagId of tagIds) {
        stmt.run(todoId, tagId);
      }
    }
  },
};
```

## UI Components

### TagBadge Component

```typescript
// components/TagBadge.tsx
'use client';

import { Tag } from '@/lib/db';

interface TagBadgeProps {
  tag: Tag;
  onClick?: () => void;
  removable?: boolean;
  onRemove?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export default function TagBadge({ 
  tag, 
  onClick, 
  removable = false,
  onRemove,
  size = 'md'
}: TagBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove();
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses[size]} ${
        onClick ? 'cursor-pointer hover:opacity-80' : ''
      }`}
      style={{ 
        backgroundColor: tag.color,
        color: '#FFFFFF'
      }}
      onClick={handleClick}
      data-testid={`tag-badge-${tag.id}`}
    >
      <span>{tag.name}</span>
      {removable && (
        <button
          onClick={handleRemove}
          className="ml-1 hover:bg-white/20 rounded-full w-4 h-4 flex items-center justify-center"
          data-testid={`remove-tag-${tag.id}`}
        >
          ✕
        </button>
      )}
    </span>
  );
}
```

### TagManager Component

```typescript
// components/TagManager.tsx
'use client';

import { useState, useEffect } from 'react';
import { Tag } from '@/lib/db';
import { validateTagName, validateTagColor } from '@/lib/validation';
import TagBadge from './TagBadge';

interface TagManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onTagsUpdated: () => void;
}

export default function TagManager({ isOpen, onClose, onTagsUpdated }: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTags();
    }
  }, [isOpen]);

  const fetchTags = async () => {
    try {
      const response = await fetch('/api/tags');
      const data = await response.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const handleCreateTag = async () => {
    setError('');

    const nameValidation = validateTagName(newTagName);
    if (!nameValidation.valid) {
      setError(nameValidation.error!);
      return;
    }

    const colorValidation = validateTagColor(newTagColor);
    if (!colorValidation.valid) {
      setError(colorValidation.error!);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      });

      if (response.ok) {
        setNewTagName('');
        setNewTagColor('#3B82F6');
        await fetchTags();
        onTagsUpdated();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create tag');
      }
    } catch (error) {
      setError('Failed to create tag');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTag = async (tagId: number, updates: Partial<Tag>) => {
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        setEditingTag(null);
        await fetchTags();
        onTagsUpdated();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update tag');
      }
    } catch (error) {
      setError('Failed to update tag');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (tagId: number, tagName: string) => {
    if (!confirm(`Delete tag "${tagName}"? This will remove it from all todos.`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/tags/${tagId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchTags();
        onTagsUpdated();
      } else {
        setError('Failed to delete tag');
      }
    } catch (error) {
      setError('Failed to delete tag');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
      data-testid="tag-manager-modal"
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Manage Tags
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            data-testid="close-tag-manager"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-md">
            {error}
          </div>
        )}

        {/* Create Tag Form */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
            Create New Tag
          </h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              data-testid="new-tag-name-input"
              disabled={loading}
            />
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="w-16 h-10 rounded-md cursor-pointer"
              data-testid="new-tag-color-input"
              disabled={loading}
            />
            <button
              onClick={handleCreateTag}
              disabled={loading || !newTagName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              data-testid="create-tag-button"
            >
              Create
            </button>
          </div>
        </div>

        {/* Tags List */}
        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
            Your Tags ({tags.length})
          </h3>
          {tags.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No tags yet. Create your first tag above!
            </p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md"
                  data-testid={`tag-item-${tag.id}`}
                >
                  {editingTag?.id === tag.id ? (
                    <>
                      <input
                        type="text"
                        defaultValue={tag.name}
                        className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        data-testid={`edit-tag-name-${tag.id}`}
                        id={`edit-name-${tag.id}`}
                      />
                      <input
                        type="color"
                        defaultValue={tag.color}
                        className="w-12 h-8 rounded cursor-pointer"
                        data-testid={`edit-tag-color-${tag.id}`}
                        id={`edit-color-${tag.id}`}
                      />
                      <button
                        onClick={() => {
                          const nameInput = document.getElementById(`edit-name-${tag.id}`) as HTMLInputElement;
                          const colorInput = document.getElementById(`edit-color-${tag.id}`) as HTMLInputElement;
                          handleUpdateTag(tag.id, {
                            name: nameInput.value,
                            color: colorInput.value,
                          });
                        }}
                        className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                        data-testid={`save-tag-${tag.id}`}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingTag(null)}
                        className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                        data-testid={`cancel-edit-tag-${tag.id}`}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <TagBadge tag={tag} size="md" />
                      <div className="flex-1" />
                      <button
                        onClick={() => setEditingTag(tag)}
                        className="px-3 py-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                        data-testid={`edit-tag-${tag.id}`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.id, tag.name)}
                        className="px-3 py-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                        data-testid={`delete-tag-${tag.id}`}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### TagSelector Component (for Todo Form)

```typescript
// components/TagSelector.tsx
'use client';

import { useState, useEffect } from 'react';
import { Tag } from '@/lib/db';

interface TagSelectorProps {
  selectedTagIds: number[];
  onChange: (tagIds: number[]) => void;
}

export default function TagSelector({ selectedTagIds, onChange }: TagSelectorProps) {
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const response = await fetch('/api/tags');
      const data = await response.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const toggleTag = (tagId: number) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter(id => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  if (tags.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="tag-selector">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Tags
      </label>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                isSelected
                  ? 'text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
              }`}
              style={isSelected ? { backgroundColor: tag.color } : {}}
              data-testid={`tag-option-${tag.id}`}
            >
              {isSelected && <span>✓</span>}
              <span>{tag.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

## Edge Cases

### Database Edge Cases

1. **Duplicate tag names (case-insensitive)**
   - "Work" vs "work" vs "WORK" should be treated as duplicates
   - UNIQUE constraint with LOWER() in query

2. **Tag deletion with many todos**
   - CASCADE DELETE should handle efficiently
   - Test with tag assigned to 100+ todos
   - Verify UI updates correctly

3. **Concurrent tag edits**
   - Two users editing same tag (if shared workspace)
   - Last write wins approach
   - Optimistic UI updates

4. **Invalid hex colors**
   - Reject malformed hex codes
   - Default to blue if invalid
   - Validate on both client and server

### UI Edge Cases

1. **Long tag names**
   - Truncate with ellipsis in badges
   - Full name in tooltip on hover
   - Wrap properly in tag manager

2. **Many tags on one todo**
   - Wrap badges to multiple lines
   - Limit display count (e.g., "Work +3 more")
   - Show all in expanded view

3. **Special characters in tag names**
   - Allow spaces, hyphens, underscores
   - Reject special symbols
   - Handle emoji gracefully

4. **Color accessibility**
   - Ensure sufficient contrast with white text
   - Consider dark mode color adjustments
   - Test with colorblind simulations

5. **Empty tags list**
   - Show helpful message
   - Hide tag selector if no tags
   - Prompt to create first tag

### Filtering Edge Cases

1. **Filter by deleted tag**
   - Clear filter if tag deleted
   - Show error message
   - Redirect to all todos

2. **Multiple filters active**
   - Tag + priority + search
   - Clear all vs clear individual
   - Filter combination logic (AND)

3. **No results from filter**
   - Show empty state
   - Suggest creating new todo
   - Option to clear filter

## Acceptance Criteria

### Must Have
- ✅ Tags table with UNIQUE constraint on user_id + name
- ✅ Many-to-many todo_tags junction table
- ✅ GET /api/tags returns all user's tags
- ✅ POST /api/tags creates tag with validation
- ✅ PUT /api/tags/[id] updates name and/or color
- ✅ DELETE /api/tags/[id] removes tag and associations
- ✅ POST /api/todos/[id]/tags assigns tag to todo
- ✅ DELETE /api/todos/[id]/tags/[tagId] removes tag
- ✅ Tag Manager modal for CRUD operations
- ✅ Color picker for tag creation/editing
- ✅ Duplicate tag name prevention (case-insensitive)
- ✅ Tag badges display on todos with correct colors
- ✅ Click tag badge to filter todos
- ✅ TagSelector component for assigning tags
- ✅ CASCADE DELETE on both tag and todo deletion
- ✅ Hex color validation

### Should Have
- ✅ Tag usage count in manager
- ✅ Alphabetical tag sorting
- ✅ Confirmation dialog on tag deletion
- ✅ Error messages for validation failures
- ✅ Loading states during API calls
- ⚠️ Tag search/filter in manager
- ⚠️ Bulk tag operations
- ⚠️ Tag color presets (common colors)

### Nice to Have
- ❌ Tag categories/groups
- ❌ Tag templates
- ❌ Tag analytics (most used, etc.)
- ❌ Tag import/export
- ❌ Tag sharing between users
- ❌ Tag history/audit log
- ❌ Custom tag icons

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/06-tag-system.spec.ts
import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers';

test.describe('Tag System', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.registerAndLogin('tag_user');
  });

  test('should create new tag', async ({ page }) => {
    await page.click('[data-testid="manage-tags-button"]');
    await expect(page.locator('[data-testid="tag-manager-modal"]')).toBeVisible();

    await page.fill('[data-testid="new-tag-name-input"]', 'Work');
    await page.fill('[data-testid="new-tag-color-input"]', '#3B82F6');
    await page.click('[data-testid="create-tag-button"]');

    await expect(page.locator('text=Work')).toBeVisible();
  });

  test('should reject duplicate tag names', async ({ page }) => {
    await helpers.createTag('Personal', '#10B981');

    await page.click('[data-testid="manage-tags-button"]');
    await page.fill('[data-testid="new-tag-name-input"]', 'personal'); // Different case
    await page.click('[data-testid="create-tag-button"]');

    await expect(page.locator('text=Tag with this name already exists')).toBeVisible();
  });

  test('should edit tag name', async ({ page }) => {
    const tagId = await helpers.createTag('OldName', '#EF4444');

    await page.click('[data-testid="manage-tags-button"]');
    await page.click(`[data-testid="edit-tag-${tagId}"]`);
    
    await page.fill(`[data-testid="edit-tag-name-${tagId}"]`, 'NewName');
    await page.click(`[data-testid="save-tag-${tagId}"]`);

    await expect(page.locator('text=NewName')).toBeVisible();
    await expect(page.locator('text=OldName')).not.toBeVisible();
  });

  test('should edit tag color', async ({ page }) => {
    const tagId = await helpers.createTag('Colorful', '#3B82F6');

    await page.click('[data-testid="manage-tags-button"]');
    await page.click(`[data-testid="edit-tag-${tagId}"]`);
    
    await page.fill(`[data-testid="edit-tag-color-${tagId}"]`, '#F59E0B');
    await page.click(`[data-testid="save-tag-${tagId}"]`);

    const badge = page.locator(`[data-testid="tag-badge-${tagId}"]`);
    await expect(badge).toHaveCSS('background-color', 'rgb(245, 158, 11)');
  });

  test('should delete tag', async ({ page }) => {
    const tagId = await helpers.createTag('DeleteMe', '#EF4444');

    await page.click('[data-testid="manage-tags-button"]');
    
    page.on('dialog', dialog => dialog.accept());
    await page.click(`[data-testid="delete-tag-${tagId}"]`);

    await expect(page.locator('text=DeleteMe')).not.toBeVisible();
  });

  test('should assign multiple tags to todo', async ({ page }) => {
    const workId = await helpers.createTag('Work', '#3B82F6');
    const urgentId = await helpers.createTag('Urgent', '#EF4444');

    await page.fill('[data-testid="todo-title-input"]', 'Tagged task');
    
    // Select tags
    await page.click(`[data-testid="tag-option-${workId}"]`);
    await page.click(`[data-testid="tag-option-${urgentId}"]`);
    
    await page.click('[data-testid="add-todo-button"]');

    // Verify badges appear
    await expect(page.locator('[data-testid^="tag-badge-"]')).toHaveCount(2);
    await expect(page.locator('text=Work')).toBeVisible();
    await expect(page.locator('text=Urgent')).toBeVisible();
  });

  test('should filter todos by tag', async ({ page }) => {
    const workId = await helpers.createTag('Work', '#3B82F6');
    const personalId = await helpers.createTag('Personal', '#10B981');

    await helpers.createTodo('Work task', { tagIds: [workId] });
    await helpers.createTodo('Personal task', { tagIds: [personalId] });
    await helpers.createTodo('Untagged task', {});

    // Click Work tag badge to filter
    await page.click(`[data-testid="tag-badge-${workId}"]`);

    // Should see only work task
    await expect(page.locator('text=Work task')).toBeVisible();
    await expect(page.locator('text=Personal task')).not.toBeVisible();
    await expect(page.locator('text=Untagged task')).not.toBeVisible();

    // Filter indicator should show
    await expect(page.locator('text=Filtered by tag: Work')).toBeVisible();
  });

  test('should clear tag filter', async ({ page }) => {
    const workId = await helpers.createTag('Work', '#3B82F6');
    await helpers.createTodo('Work task', { tagIds: [workId] });
    await helpers.createTodo('Other task', {});

    // Apply filter
    await page.click(`[data-testid="tag-badge-${workId}"]`);
    await expect(page.locator('text=Other task')).not.toBeVisible();

    // Clear filter
    await page.click('[data-testid="clear-tag-filter"]');
    
    // All todos visible again
    await expect(page.locator('text=Work task')).toBeVisible();
    await expect(page.locator('text=Other task')).toBeVisible();
  });

  test('should update todos when tag color changes', async ({ page }) => {
    const tagId = await helpers.createTag('ColorChange', '#3B82F6');
    await helpers.createTodo('Tagged todo', { tagIds: [tagId] });

    // Get initial color
    let badge = page.locator(`[data-testid="tag-badge-${tagId}"]`).first();
    await expect(badge).toHaveCSS('background-color', 'rgb(59, 130, 246)');

    // Change color
    await page.click('[data-testid="manage-tags-button"]');
    await page.click(`[data-testid="edit-tag-${tagId}"]`);
    await page.fill(`[data-testid="edit-tag-color-${tagId}"]`, '#10B981');
    await page.click(`[data-testid="save-tag-${tagId}"]`);
    await page.click('[data-testid="close-tag-manager"]');

    // Verify new color on todo
    badge = page.locator(`[data-testid="tag-badge-${tagId}"]`).first();
    await expect(badge).toHaveCSS('background-color', 'rgb(16, 185, 129)');
  });
});
```

### Unit Tests

```typescript
// lib/validation.test.ts
import { validateTagName, validateTagColor } from '@/lib/validation';

describe('Tag Validation', () => {
  describe('validateTagName', () => {
    it('should accept valid tag names', () => {
      expect(validateTagName('Work').valid).toBe(true);
      expect(validateTagName('Personal Tasks').valid).toBe(true);
      expect(validateTagName('Project-Alpha').valid).toBe(true);
      expect(validateTagName('2023_Review').valid).toBe(true);
    });

    it('should reject empty names', () => {
      const result = validateTagName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject whitespace-only names', () => {
      const result = validateTagName('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject names over 50 characters', () => {
      const result = validateTagName('a'.repeat(51));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot exceed 50 characters');
    });

    it('should reject special characters', () => {
      expect(validateTagName('Work@Home').valid).toBe(false);
      expect(validateTagName('Project#1').valid).toBe(false);
      expect(validateTagName('Task/Todo').valid).toBe(false);
    });

    it('should trim whitespace', () => {
      const result = validateTagName('  Work  ');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateTagColor', () => {
    it('should accept valid hex colors', () => {
      expect(validateTagColor('#3B82F6').valid).toBe(true);
      expect(validateTagColor('#000000').valid).toBe(true);
      expect(validateTagColor('#FFFFFF').valid).toBe(true);
      expect(validateTagColor('#abc123').valid).toBe(true);
    });

    it('should reject colors without hash', () => {
      const result = validateTagColor('3B82F6');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid hex code');
    });

    it('should reject short hex codes', () => {
      const result = validateTagColor('#3B8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid hex code');
    });

    it('should reject invalid characters', () => {
      expect(validateTagColor('#GGGGGG').valid).toBe(false);
      expect(validateTagColor('#3B82FZ').valid).toBe(false);
    });
  });
});
```

## Out of Scope

The following features are **not** included in this implementation:

1. **Tag hierarchies**: Parent/child tag relationships
2. **Tag sharing**: Shared tags across multiple users
3. **Tag permissions**: Read-only vs editable tags
4. **Tag suggestions**: Auto-suggest based on todo title
5. **Tag analytics**: Usage statistics, trends
6. **Tag templates**: Predefined tag sets for projects
7. **Tag import**: Bulk tag creation from file
8. **Tag merging**: Combine two tags into one
9. **Tag aliases**: Alternative names for same tag
10. **Tag icons**: Custom icons for tags

## Success Metrics

### Quantitative Metrics

1. **API Performance**
   - Tag creation: < 50ms
   - Tag update: < 50ms
   - Tag deletion: < 100ms (includes cascade)
   - Tag filtering: < 100ms for 1000 todos

2. **Database Performance**
   - UNIQUE constraint prevents duplicates
   - CASCADE DELETE completes < 500ms for 100 todos
   - Tag queries use indexes efficiently

3. **Test Coverage**
   - E2E tests: 35+ scenarios passing (100%)
   - Unit tests: 100% coverage on validation
   - Database tests: Full CRUD coverage

4. **User Adoption**
   - 80%+ users create at least 1 tag
   - Average 5-8 tags per user
   - 60%+ todos have at least 1 tag
   - Tag filtering used 50%+ of sessions

### Qualitative Metrics

1. **User Experience**
   - Intuitive tag creation flow
   - Clear visual distinction with colors
   - Fast and responsive filtering
   - No confusion about tag assignment

2. **Code Quality**
   - Clean component architecture
   - Reusable badge component
   - Well-typed database operations
   - Comprehensive validation

3. **Data Integrity**
   - No duplicate tags in database
   - CASCADE deletes work correctly
   - Color consistency maintained
   - Many-to-many relationships preserved

## Implementation Checklist

- [ ] **Database Setup**
  - [ ] Create `tags` table with UNIQUE constraint
  - [ ] Create `todo_tags` junction table
  - [ ] Add CASCADE DELETE constraints
  - [ ] Create indexes for performance
  - [ ] Test UNIQUE constraint manually

- [ ] **Backend Implementation**
  - [ ] Implement `tagDB` operations in `lib/db.ts`
  - [ ] Implement `todoTagDB` operations in `lib/db.ts`
  - [ ] Create GET `/api/tags` endpoint
  - [ ] Create POST `/api/tags` endpoint with validation
  - [ ] Create PUT `/api/tags/[id]` endpoint
  - [ ] Create DELETE `/api/tags/[id]` endpoint
  - [ ] Create POST `/api/todos/[id]/tags` endpoint
  - [ ] Create DELETE `/api/todos/[id]/tags/[tagId]` endpoint
  - [ ] Add validation functions in `lib/validation.ts`

- [ ] **Frontend Components**
  - [ ] Create `TagBadge` component with color support
  - [ ] Create `TagManager` modal component
  - [ ] Create `TagSelector` component for forms
  - [ ] Add "Manage Tags" button to main page
  - [ ] Integrate tag selection in todo create/edit forms
  - [ ] Display tag badges on todos
  - [ ] Implement tag filter functionality
  - [ ] Add filter indicator UI
  - [ ] Add data-testid attributes

- [ ] **Testing**
  - [ ] Write 35+ E2E tests for all flows
  - [ ] Write unit tests for tag name validation (13 tests)
  - [ ] Write unit tests for color validation
  - [ ] Write database tests for CRUD operations
  - [ ] Test CASCADE delete behavior
  - [ ] Test duplicate prevention
  - [ ] Test filtering with multiple criteria

- [ ] **Edge Cases & Error Handling**
  - [ ] Handle empty tag name
  - [ ] Handle duplicate names (case-insensitive)
  - [ ] Handle invalid hex colors
  - [ ] Handle long tag names (truncation)
  - [ ] Handle many tags on one todo
  - [ ] Handle tag deletion with many associations
  - [ ] Handle network failures gracefully

- [ ] **Documentation**
  - [ ] Update USER_GUIDE.md with tags section
  - [ ] Add API documentation
  - [ ] Add component documentation
  - [ ] Create tag best practices guide

- [ ] **Final Verification**
  - [ ] All E2E tests passing (35/35)
  - [ ] All unit tests passing
  - [ ] Manual testing complete
  - [ ] Code review passed
  - [ ] Performance benchmarks met
  - [ ] Security review passed (CodeQL)
