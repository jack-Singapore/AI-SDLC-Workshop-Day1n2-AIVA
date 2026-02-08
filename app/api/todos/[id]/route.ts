import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB, todoTagDB, Priority, RecurrencePattern } from '@/lib/db';
import { parseToSingapore, calculateNextRecurrence, toSingaporeISO, getSingaporeNow } from '@/lib/timezone';

/**
 * GET /api/todos/[id]
 * Get a specific todo by ID
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await context.params;
  const todoId = parseInt(id, 10);

  const todo = todoDB.getById(todoId, session.userId);
  if (!todo) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const subtasks = subtaskDB.getByTodoId(todo.id);
  const tags = todoTagDB.getTagsForTodo(todo.id);

  return NextResponse.json({ ...todo, subtasks, tags });
}

/**
 * PUT /api/todos/[id]
 * Update a todo (including completing recurring todos)
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await context.params;
  const todoId = parseInt(id, 10);

  try {
    const body = await request.json();
    const existingTodo = todoDB.getById(todoId, session.userId);

    if (!existingTodo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    // Validate title if provided
    if (body.title !== undefined && body.title.trim().length === 0) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }

    // Validate due date if provided
    if (body.due_date !== undefined && body.due_date !== null) {
      const dueDateTime = parseToSingapore(body.due_date);
      const now = getSingaporeNow();
      const diff = dueDateTime.diff(now, 'minutes').minutes;

      if (diff < 1) {
        return NextResponse.json(
          { error: 'Due date must be at least 1 minute in the future' },
          { status: 400 }
        );
      }
    }

    // If completing a recurring todo, create next instance
    if (
      body.completed === true &&
      existingTodo.is_recurring &&
      existingTodo.recurrence_pattern &&
      existingTodo.due_date
    ) {
      const currentDueDate = parseToSingapore(existingTodo.due_date);
      const nextDueDate = calculateNextRecurrence(currentDueDate, existingTodo.recurrence_pattern);

      // Create next instance with same properties
      const nextTodo = todoDB.create({
        user_id: session.userId,
        title: existingTodo.title,
        completed: false,
        due_date: toSingaporeISO(nextDueDate),
        priority: existingTodo.priority,
        is_recurring: true,
        recurrence_pattern: existingTodo.recurrence_pattern,
        reminder_minutes: existingTodo.reminder_minutes,
        last_notification_sent: null,
      });

      // Copy subtasks to new instance
      const existingSubtasks = subtaskDB.getByTodoId(existingTodo.id);
      existingSubtasks.forEach((subtask) => {
        subtaskDB.create({
          todo_id: nextTodo.id,
          title: subtask.title,
          completed: false,
          position: subtask.position,
        });
      });

      // Copy tags to new instance
      const existingTags = todoTagDB.getTagsForTodo(existingTodo.id);
      existingTags.forEach((tag) => {
        todoTagDB.add(nextTodo.id, tag.id);
      });
    }

    // Update the current todo
    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.completed !== undefined) updates.completed = body.completed;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.priority !== undefined) updates.priority = body.priority as Priority;
    if (body.is_recurring !== undefined) updates.is_recurring = body.is_recurring;
    if (body.recurrence_pattern !== undefined) updates.recurrence_pattern = body.recurrence_pattern as RecurrencePattern;
    if (body.reminder_minutes !== undefined) updates.reminder_minutes = body.reminder_minutes;
    if (body.last_notification_sent !== undefined) updates.last_notification_sent = body.last_notification_sent;

    const updatedTodo = todoDB.update(todoId, session.userId, updates);

    const subtasks = subtaskDB.getByTodoId(updatedTodo.id);
    const tags = todoTagDB.getTagsForTodo(updatedTodo.id);

    return NextResponse.json({ ...updatedTodo, subtasks, tags });
  } catch (error) {
    console.error('Error updating todo:', error);
    return NextResponse.json({ error: 'Failed to update todo' }, { status: 500 });
  }
}

/**
 * DELETE /api/todos/[id]
 * Delete a todo (CASCADE deletes subtasks and tag associations)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await context.params;
  const todoId = parseInt(id, 10);

  try {
    const todo = todoDB.getById(todoId, session.userId);
    if (!todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    todoDB.delete(todoId, session.userId);

    return NextResponse.json({ message: 'Todo deleted' });
  } catch (error) {
    console.error('Error deleting todo:', error);
    return NextResponse.json({ error: 'Failed to delete todo' }, { status: 500 });
  }
}
