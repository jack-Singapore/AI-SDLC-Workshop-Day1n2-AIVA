import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB, todoTagDB, Priority, RecurrencePattern } from '@/lib/db';
import { getSingaporeNow, parseToSingapore, calculateNextRecurrence, toSingaporeISO } from '@/lib/timezone';

/**
 * GET /api/todos
 * Get all todos for the authenticated user with subtasks and tags
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const todos = todoDB.getAll(session.userId);

  // Attach subtasks and tags to each todo
  const todosWithDetails = todos.map((todo) => {
    const subtasks = subtaskDB.getByTodoId(todo.id);
    const tags = todoTagDB.getTagsForTodo(todo.id);
    return { ...todo, subtasks, tags };
  });

  return NextResponse.json(todosWithDetails);
}

/**
 * POST /api/todos
 * Create a new todo
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes } = body;

    // Validation
    if (!title || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }

    // Validate due date (must be at least 1 minute in the future, Singapore time)
    // Only validate if due_date includes a time component (has 'T' in the ISO string)
    if (due_date && due_date.includes('T')) {
      const dueDateTime = parseToSingapore(due_date);
      const now = getSingaporeNow();
      const diff = dueDateTime.diff(now, 'minutes').minutes;

      if (diff < 1) {
        return NextResponse.json(
          { error: 'Due date must be at least 1 minute in the future' },
          { status: 400 }
        );
      }
    }

    // Recurring todos require a due date
    if (is_recurring && !due_date) {
      return NextResponse.json(
        { error: 'Recurring todos require a due date' },
        { status: 400 }
      );
    }

    const todo = todoDB.create({
      user_id: session.userId,
      list_id: null,
      title: title.trim(),
      description: null,
      completed: false,
      due_date: due_date || null,
      priority: (priority as Priority) || 'medium',
      is_recurring: is_recurring || false,
      recurrence_pattern: (recurrence_pattern as RecurrencePattern) || null,
      reminder_minutes: reminder_minutes || null,
      last_notification_sent: null,
      updated_at: new Date().toISOString(),
    });

    // Attach subtasks and tags
    const subtasks = subtaskDB.getByTodoId(todo.id);
    const tags = todoTagDB.getTagsForTodo(todo.id);

    return NextResponse.json({ ...todo, subtasks, tags }, { status: 201 });
  } catch (error) {
    console.error('Error creating todo:', error);
    return NextResponse.json({ error: 'Failed to create todo' }, { status: 500 });
  }
}
