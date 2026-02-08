import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB, tagDB, todoTagDB } from '@/lib/db';

interface ImportTodo {
  title: string;
  completed?: boolean;
  due_date?: string | null;
  priority?: string;
  is_recurring?: boolean;
  recurrence_pattern?: string | null;
  reminder_minutes?: number | null;
  subtasks?: Array<{ title: string; completed?: boolean; position?: number }>;
  tags?: Array<{ name: string; color: string }>;
}

// POST /api/todos/import - Import todos from JSON
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let todos: ImportTodo[];
  try {
    todos = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
  }

  if (!Array.isArray(todos)) {
    return NextResponse.json({ error: 'Expected an array of todos' }, { status: 400 });
  }

  let importedCount = 0;

  for (const importTodo of todos) {
    // Skip invalid entries
    if (!importTodo.title || typeof importTodo.title !== 'string') {
      continue;
    }

    // Create todo with new ID
    const newTodo = todoDB.create({
      user_id: session.userId,
      list_id: (importTodo as any).list_id || null,
      title: importTodo.title,
      description: (importTodo as any).description || null,
      completed: importTodo.completed || false,
      due_date: importTodo.due_date || null,
      priority: (importTodo.priority as any) || 'medium',
      is_recurring: importTodo.is_recurring || false,
      recurrence_pattern: (importTodo.recurrence_pattern as any) || null,
      reminder_minutes: importTodo.reminder_minutes ?? null,
      last_notification_sent: null, // Reset notification state
      updated_at: new Date().toISOString(),
    });

    // Import subtasks if present
    if (importTodo.subtasks && Array.isArray(importTodo.subtasks)) {
      for (const subtask of importTodo.subtasks) {
        if (subtask.title) {
          subtaskDB.create({
            todo_id: newTodo.id,
            title: subtask.title,
            completed: subtask.completed || false,
            position: subtask.position ?? 0,
          });
        }
      }
    }

    // Import tags if present
    if (importTodo.tags && Array.isArray(importTodo.tags)) {
      for (const tagData of importTodo.tags) {
        if (tagData.name) {
          // Find or create tag
          const existingTags = tagDB.getAll(session.userId);
          let tag = existingTags.find((t) => t.name === tagData.name);
          
          if (!tag) {
            tag = tagDB.create({
              user_id: session.userId,
              name: tagData.name,
              color: tagData.color || '#808080',
            });
          }

          // Associate tag with todo
          todoTagDB.add(newTodo.id, tag.id);
        }
      }
    }

    importedCount++;
  }

  return NextResponse.json({
    message: `Successfully imported ${importedCount} todo${importedCount === 1 ? '' : 's'}`,
    count: importedCount,
  });
}
