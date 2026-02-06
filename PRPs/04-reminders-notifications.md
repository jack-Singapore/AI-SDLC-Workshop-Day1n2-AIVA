# Feature 04: Reminders & Notifications

## Feature Overview

Implement a browser-based notification system that alerts users before their todo due dates. Users can set reminder timing (15 minutes to 1 week before due date), grant browser notification permissions, and receive timely alerts. The system uses polling to check for upcoming todos and prevents duplicate notifications.

## User Stories

**As a user**, I want to:
- Enable browser notifications for todo reminders
- Choose how far in advance to be reminded (15m, 30m, 1h, 2h, 1 day, 2 days, 1 week before due date)
- See a reminder badge (🔔) on todos that have reminders set
- Receive browser notification at the specified time before due date
- Only receive one notification per reminder (no duplicates)
- Have reminders automatically set for the next instance of recurring todos
- Dismiss or snooze notifications (browser native functionality)

## User Flow

### Enable Notifications
1. User visits app for first time
2. Banner or button shows: "Enable Notifications for Todo Reminders"
3. User clicks "Enable Notifications"
4. Browser prompts for notification permission
5. User grants permission
6. Button changes to "Notifications Enabled ✓"

### Set Reminder on New Todo
1. User creates todo with title and due date (tomorrow 2:00 PM)
2. Reminder dropdown is enabled (only if due date is set)
3. User selects "1 hour before" from dropdown
4. User clicks "Add"
5. Todo appears with 🔔 badge showing "1h before"

### Receive Notification
1. System polls `/api/notifications/check` every 30 seconds
2. API finds todo with:
   - due_date = tomorrow 2:00 PM
   - reminder_minutes = 60
   - last_notification_sent = null
3. Current time is tomorrow 1:00 PM (exactly 1 hour before)
4. API returns this todo in response
5. Frontend displays browser notification:
   - Title: "Todo Reminder"
   - Body: "[Todo title] is due in 1 hour"
   - Icon: App logo
6. Frontend calls API to mark notification sent
7. API sets `last_notification_sent = current_timestamp`
8. No duplicate notification sent on next poll

### Edit Reminder Timing
1. User edits existing todo
2. Changes reminder from "1 hour before" to "15 minutes before"
3. Saves
4. Badge updates to "15m before"
5. Next notification will be 15 minutes before due date

### Remove Reminder
1. User edits todo
2. Selects "No reminder" from dropdown
3. Saves
4. 🔔 badge disappears
5. No notification will be sent

## Technical Requirements

### Database Schema

Fields already exist in todos table from Feature 01:

```sql
-- No new tables needed
-- Using existing columns:
reminder_minutes INTEGER  -- NULL or one of: 15, 30, 60, 120, 1440, 2880, 10080
last_notification_sent TEXT  -- ISO 8601 timestamp or NULL
```

### TypeScript Types

```typescript
// lib/db.ts
export const REMINDER_OPTIONS = {
  15: '15 minutes before',
  30: '30 minutes before',
  60: '1 hour before',
  120: '2 hours before',
  1440: '1 day before',
  2880: '2 days before',
  10080: '1 week before',
} as const;

export type ReminderMinutes = keyof typeof REMINDER_OPTIONS | null;

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  priority: Priority;
  due_date: string | null;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface NotificationPayload {
  id: number;
  title: string;
  due_date: string;
  reminder_minutes: number;
  priority: Priority;
}
```

### API Endpoints

#### GET /api/notifications/check - Find Todos Needing Notification

```typescript
// app/api/notifications/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const now = getSingaporeNow();
  const todos = todoDB.findAllByUser(session.userId);
  
  const needingNotification = todos.filter(todo => {
    // Skip if no due date or no reminder set
    if (!todo.due_date || !todo.reminder_minutes) return false;
    
    // Skip if already completed
    if (todo.completed) return false;
    
    // Skip if notification already sent
    if (todo.last_notification_sent) return false;
    
    // Calculate reminder time
    const dueDate = new Date(todo.due_date);
    const reminderTime = new Date(dueDate.getTime() - todo.reminder_minutes * 60 * 1000);
    
    // Check if current time is at or past reminder time
    return now >= reminderTime;
  });
  
  return NextResponse.json({ 
    notifications: needingNotification.map(todo => ({
      id: todo.id,
      title: todo.title,
      due_date: todo.due_date,
      reminder_minutes: todo.reminder_minutes,
      priority: todo.priority,
    }))
  });
}
```

#### POST /api/notifications/[id]/mark-sent - Mark Notification as Sent

```typescript
// app/api/notifications/[id]/mark-sent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  const { id } = await params;
  const now = getSingaporeNow();
  
  const updated = todoDB.update(parseInt(id), session.userId, {
    last_notification_sent: now.toISOString(),
  });
  
  if (!updated) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }
  
  return NextResponse.json({ success: true });
}
```

### Notification Polling Hook

```typescript
// lib/hooks/useNotifications.ts
'use client';

import { useEffect, useState } from 'react';
import { NotificationPayload } from '@/lib/db';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isPolling, setIsPolling] = useState(false);
  
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);
  
  const requestPermission = async () => {
    if ('Notification' in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    }
    return false;
  };
  
  const showNotification = (payload: NotificationPayload) => {
    if (permission !== 'granted') return;
    
    const minutesUntilDue = payload.reminder_minutes;
    const timeText = minutesUntilDue < 60
      ? `${minutesUntilDue} minutes`
      : minutesUntilDue < 1440
      ? `${Math.floor(minutesUntilDue / 60)} hour${Math.floor(minutesUntilDue / 60) > 1 ? 's' : ''}`
      : `${Math.floor(minutesUntilDue / 1440)} day${Math.floor(minutesUntilDue / 1440) > 1 ? 's' : ''}`;
    
    new Notification('Todo Reminder', {
      body: `${payload.title} is due in ${timeText}`,
      icon: '/icon.png',
      tag: `todo-${payload.id}`, // Prevent duplicates
      requireInteraction: false,
    });
  };
  
  const checkNotifications = async () => {
    try {
      const response = await fetch('/api/notifications/check');
      const data = await response.json();
      
      for (const notification of data.notifications || []) {
        showNotification(notification);
        
        // Mark as sent
        await fetch(`/api/notifications/${notification.id}/mark-sent`, {
          method: 'POST',
        });
      }
    } catch (error) {
      console.error('Failed to check notifications:', error);
    }
  };
  
  const startPolling = () => {
    if (permission !== 'granted') return;
    
    setIsPolling(true);
    const interval = setInterval(checkNotifications, 30000); // Poll every 30 seconds
    
    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  };
  
  return {
    permission,
    isPolling,
    requestPermission,
    startPolling,
    showNotification,
  };
}
```

## UI Components

### Notification Permission Button

```typescript
// components/NotificationPermission.tsx
'use client';

import { useNotifications } from '@/lib/hooks/useNotifications';
import { useEffect } from 'react';

export function NotificationPermission() {
  const { permission, isPolling, requestPermission, startPolling } = useNotifications();
  
  useEffect(() => {
    if (permission === 'granted' && !isPolling) {
      const cleanup = startPolling();
      return cleanup;
    }
  }, [permission, isPolling, startPolling]);
  
  if (permission === 'granted') {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded">
        <span>✓</span>
        <span>Notifications Enabled</span>
      </div>
    );
  }
  
  if (permission === 'denied') {
    return (
      <div className="px-4 py-2 bg-red-100 text-red-700 rounded text-sm">
        Notifications blocked. Enable in browser settings.
      </div>
    );
  }
  
  return (
    <button
      onClick={requestPermission}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      data-testid="enable-notifications-button"
    >
      🔔 Enable Notifications
    </button>
  );
}
```

### Reminder Selector Component

```typescript
// components/ReminderSelector.tsx
'use client';

import { REMINDER_OPTIONS, ReminderMinutes } from '@/lib/db';

export function ReminderSelector({
  value,
  onChange,
  disabled,
}: {
  value: ReminderMinutes;
  onChange: (minutes: ReminderMinutes) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value || ''}
      onChange={(e) => {
        const val = e.target.value;
        onChange(val === '' ? null : parseInt(val) as ReminderMinutes);
      }}
      disabled={disabled}
      className="px-4 py-2 border rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
      data-testid="reminder-select"
    >
      <option value="">No reminder</option>
      {Object.entries(REMINDER_OPTIONS).map(([minutes, label]) => (
        <option key={minutes} value={minutes}>
          {label}
        </option>
      ))}
    </select>
  );
}
```

### Reminder Badge Component

```typescript
// components/ReminderBadge.tsx
'use client';

import { REMINDER_OPTIONS } from '@/lib/db';

export function ReminderBadge({ minutes }: { minutes: number }) {
  const label = REMINDER_OPTIONS[minutes as keyof typeof REMINDER_OPTIONS];
  
  return (
    <span 
      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded"
      data-testid="reminder-badge"
    >
      <span>🔔</span>
      <span>{label}</span>
    </span>
  );
}
```

## Edge Cases

### 1. No Browser Notification Support
- **Scenario**: User's browser doesn't support Notification API
- **Handling**: Hide "Enable Notifications" button, show message
- **Message**: "Browser notifications are not supported in your browser"

### 2. Permission Denied
- **Scenario**: User clicks "Block" on permission prompt
- **Handling**: Show message with instructions to enable in browser settings
- **Message**: "Notifications blocked. Please enable in your browser settings."

### 3. Reminder Without Due Date
- **Scenario**: User tries to set reminder on todo without due date
- **Handling**: Disable reminder dropdown until due date is set
- **UI**: Dropdown grayed out with tooltip: "Set due date first"

### 4. Due Date in Past
- **Scenario**: Todo's due date is in the past
- **Handling**: Don't send notification, show overdue indicator instead
- **Logic**: Skip in notification check if `due_date < now`

### 5. Notification Time Already Passed
- **Scenario**: Reminder set for "1 hour before" but current time is 30 minutes before due date
- **Handling**: Send notification immediately on next poll
- **Logic**: `now >= reminderTime` includes times that are past reminder time

### 6. Multiple Tabs Open
- **Scenario**: User has app open in 3 browser tabs
- **Handling**: Each tab polls independently, but `last_notification_sent` prevents duplicates
- **Result**: First tab to check marks as sent, others skip

### 7. Browser Closed During Reminder Time
- **Scenario**: Notification should trigger at 9:00 AM but browser is closed
- **Handling**: Next time app opens and polls, notification is sent if still before due date
- **Limitation**: No notification if app is never reopened

### 8. Timezone Mismatch
- **Scenario**: User travels to different timezone
- **Handling**: All dates stored and calculated in Singapore timezone
- **Result**: Consistent behavior regardless of user's location

### 9. Recurring Todo Reminders
- **Scenario**: User completes recurring todo with reminder
- **Handling**: Next instance inherits `reminder_minutes`, but `last_notification_sent` is null
- **Result**: Reminder works for new instance

## Acceptance Criteria

### Must Have
- ✅ "Enable Notifications" button requests browser permission
- ✅ Seven reminder timing options available: 15m, 30m, 1h, 2h, 1d, 2d, 1w
- ✅ Reminder dropdown only enabled when todo has due date
- ✅ Reminder badge (🔔) displays on todos with reminders
- ✅ Badge shows timing (e.g., "1h before", "1 day before")
- ✅ Polling system checks every 30 seconds
- ✅ Browser notification displays with:
  - Title: "Todo Reminder"
  - Body: "[Title] is due in [time]"
  - Icon (if available)
- ✅ `last_notification_sent` prevents duplicate notifications
- ✅ Notifications only sent if permission granted
- ✅ Notifications only sent if not completed
- ✅ Notifications only sent if not already sent
- ✅ API uses Singapore timezone for all calculations
- ✅ Reminder timing inherited by recurring todo instances

### Should Have
- ⚠️ Manual "Test Notification" button
- ⚠️ Notification history/log
- ⚠️ Snooze functionality
- ⚠️ Custom notification sound

### Nice to Have
- ❌ Email/SMS notifications
- ❌ Push notifications for mobile PWA
- ❌ Multiple reminders per todo
- ❌ Smart reminder timing (workday only)
- ❌ Notification grouping (if multiple due soon)

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/04-reminders.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Reminders & Notifications', () => {
  test('should show enable notifications button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="enable-notifications-button"]')).toBeVisible();
  });
  
  test('should request notification permission', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await page.goto('/');
    
    await page.click('[data-testid="enable-notifications-button"]');
    
    // After granting, button should change
    await expect(page.locator('text=Notifications Enabled')).toBeVisible();
  });
  
  test('should disable reminder dropdown without due date', async ({ page }) => {
    await page.goto('/');
    
    await page.fill('[data-testid="todo-title-input"]', 'No due date task');
    
    const reminderSelect = page.locator('[data-testid="reminder-select"]');
    await expect(reminderSelect).toBeDisabled();
  });
  
  test('should enable reminder dropdown with due date', async ({ page }) => {
    await page.goto('/');
    
    await page.fill('[data-testid="todo-title-input"]', 'Has due date');
    await page.fill('[data-testid="todo-due-date-input"]', '2026-02-10T14:00');
    
    const reminderSelect = page.locator('[data-testid="reminder-select"]');
    await expect(reminderSelect).not.toBeDisabled();
  });
  
  test('should create todo with reminder', async ({ page }) => {
    await page.goto('/');
    
    await page.fill('[data-testid="todo-title-input"]', 'Meeting tomorrow');
    await page.fill('[data-testid="todo-due-date-input"]', '2026-02-10T14:00');
    await page.selectOption('[data-testid="reminder-select"]', '60'); // 1 hour before
    await page.click('[data-testid="add-todo-button"]');
    
    await expect(page.locator('[data-testid="reminder-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="reminder-badge"]')).toContainText('1 hour before');
  });
  
  test('should check notifications API', async ({ request }) => {
    const response = await request.get('/api/notifications/check');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('notifications');
    expect(Array.isArray(data.notifications)).toBeTruthy();
  });
  
  test('should mark notification as sent', async ({ request }) => {
    // Create todo with reminder
    const createResponse = await request.post('/api/todos', {
      data: {
        title: 'Test notification',
        due_date: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        reminder_minutes: 60,
      },
    });
    const todo = await createResponse.json();
    
    // Mark as sent
    const markResponse = await request.post(`/api/notifications/${todo.id}/mark-sent`);
    expect(markResponse.ok()).toBeTruthy();
    
    // Verify last_notification_sent is set
    const getResponse = await request.get(`/api/todos/${todo.id}`);
    const updated = await getResponse.json();
    expect(updated.todo.last_notification_sent).not.toBeNull();
  });
});
```

### Unit Tests

```typescript
// tests/notifications.test.ts
describe('Notification Logic', () => {
  it('should calculate reminder time correctly', () => {
    const dueDate = new Date('2026-02-10T14:00:00Z');
    const reminderMinutes = 60;
    
    const reminderTime = new Date(dueDate.getTime() - reminderMinutes * 60 * 1000);
    expect(reminderTime.toISOString()).toBe('2026-02-10T13:00:00.000Z');
  });
  
  it('should not send notification if already sent', () => {
    const todo = {
      due_date: '2026-02-10T14:00:00Z',
      reminder_minutes: 60,
      last_notification_sent: '2026-02-10T13:00:00Z',
    };
    
    expect(todo.last_notification_sent).not.toBeNull();
  });
  
  it('should not send notification if completed', () => {
    const todo = {
      completed: true,
      due_date: '2026-02-10T14:00:00Z',
      reminder_minutes: 60,
    };
    
    expect(todo.completed).toBe(true);
  });
});
```

## Out of Scope

- Email notifications
- SMS notifications
- Mobile push notifications (PWA)
- Custom notification sounds
- Notification history/archive
- Snooze functionality
- Multiple reminders per todo
- Smart reminder suggestions
- Notification analytics

## Success Metrics

### Functional Metrics
- ✅ 100% of enabled users receive notifications on time
- ✅ Zero duplicate notifications (one per reminder)
- ✅ Notifications sent within 30 seconds of reminder time
- ✅ Permission request works in all supported browsers

### Technical Metrics
- ✅ Polling overhead < 50ms per request
- ✅ API response time < 200ms
- ✅ No memory leaks from polling interval
- ✅ Singapore timezone used for all calculations

### User Experience Metrics
- ✅ Clear permission request flow
- ✅ Visual feedback for enabled/disabled state
- ✅ Reminder badge clearly visible
- ✅ Notification text is informative

## Implementation Checklist

- [ ] GET /api/notifications/check endpoint
- [ ] POST /api/notifications/[id]/mark-sent endpoint
- [ ] useNotifications hook with polling
- [ ] Browser notification permission handling
- [ ] NotificationPermission component
- [ ] ReminderSelector component (with disabled state)
- [ ] ReminderBadge component
- [ ] Polling interval (30 seconds)
- [ ] Duplicate prevention via last_notification_sent
- [ ] Singapore timezone for all calculations
- [ ] E2E tests for permission flow
- [ ] E2E tests for reminder creation
- [ ] Unit tests for reminder time calculation
- [ ] Handle browser compatibility
- [ ] Handle permission denied state

---

**Last Updated**: February 6, 2026
**Feature Status**: Phase 2 - Core Feature
**Dependencies**: Feature 01 (Todo CRUD)
