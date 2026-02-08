import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB, todoDB, subtaskDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

// POST /api/templates/[id]/use - Create todo from template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const templateId = parseInt(id);

  if (isNaN(templateId)) {
    return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
  }

  // Get template
  const template = templateDB.getById(templateId, session.userId);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Calculate due date if offset is set
  let dueDate: string | null = null;
  if (template.due_date_offset_days !== null && template.due_date_offset_days !== undefined) {
    const now = getSingaporeNow();
    const futureDate = now.plus({ days: template.due_date_offset_days });
    dueDate = futureDate.toISO()?.slice(0, 16) || null; // Format: YYYY-MM-DDTHH:MM
  }

  // Create todo from template
  const todo = todoDB.create({
    user_id: session.userId,
    list_id: null,
    title: template.title_template,
    description: null,
    completed: false,
    due_date: dueDate,
    priority: template.priority,
    is_recurring: template.is_recurring,
    recurrence_pattern: template.recurrence_pattern,
    reminder_minutes: template.reminder_minutes,
    last_notification_sent: null,
    updated_at: new Date().toISOString(),
  });

  // Create subtasks if defined in template
  if (template.subtasks_json) {
    try {
      const subtasks = JSON.parse(template.subtasks_json);
      if (Array.isArray(subtasks)) {
        for (const subtask of subtasks) {
          if (subtask.title) {
            subtaskDB.create({
              todo_id: todo.id,
              title: subtask.title,
              completed: false,
              position: subtask.position || 0,
            });
          }
        }
      }
    } catch (e) {
      // Log error but don't fail the todo creation
      console.error('Failed to parse template subtasks:', e);
    }
  }

  return NextResponse.json(todo, { status: 201 });
}
