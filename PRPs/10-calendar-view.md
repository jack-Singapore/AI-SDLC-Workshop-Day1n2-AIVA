# Feature 10: Calendar View

## Feature Overview

Implement a monthly calendar view that displays todos on their due dates, highlights Singapore public holidays, and allows navigation between months. Users can click on any day to see all todos due on that date in a modal. The calendar uses Singapore timezone for all date calculations and displays the current day with special highlighting.

## User Stories

**As a user**, I want to:
- View my todos in a monthly calendar format
- See todos on the dates they're due
- Navigate to previous and next months
- Return to current month with "Today" button
- Click on a day to see all todos due that day
- See Singapore public holidays marked on the calendar
- Know which day is today with visual highlighting
- See weekend days styled differently
- Use URL parameters to share specific month views

## User Flow

### View Current Month
1. User navigates to `/calendar` route
2. Calendar displays current month (e.g., February 2026)
3. Current day (today) is highlighted with border
4. Weekend days (Sat/Sun) have light gray background
5. Days with todos show colored indicators
6. Public holidays show holiday name below date

### Navigate Between Months
1. User clicks "Previous" button
2. Calendar transitions to January 2026
3. URL updates to `?month=2026-01`
4. User clicks "Next" button
5. Calendar shows February 2026
6. URL updates to `?month=2026-02`
7. User clicks "Today" button
8. Calendar jumps back to current month

### View Todos for a Day
1. User clicks on "Feb 15" (a day with todos)
2. Modal opens showing "Todos for February 15, 2026"
3. List shows all todos due on that date:
   - "Team meeting (High priority)"
   - "Submit report (Medium priority)"
4. User can mark todos complete from modal
5. User clicks "Close" or outside modal
6. Modal closes, calendar still visible

### View Holiday Information
1. User sees "Feb 10" marked as holiday
2. Holiday name "Chinese New Year" displayed below date
3. Day has red background color to indicate holiday
4. User can still click to see todos (if any) due on holiday

## Technical Requirements

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,  -- YYYY-MM-DD format
  name TEXT NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT 0,  -- For yearly holidays
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);

-- Seed with Singapore holidays
INSERT OR IGNORE INTO holidays (date, name, is_recurring) VALUES
('2026-01-01', 'New Year''s Day', 1),
('2026-02-10', 'Chinese New Year', 0),
('2026-02-11', 'Chinese New Year', 0),
('2026-04-10', 'Good Friday', 0),
('2026-05-01', 'Labour Day', 1),
('2026-05-24', 'Vesak Day', 0),
('2026-06-30', 'Hari Raya Haji', 0),
('2026-08-09', 'National Day', 1),
('2026-10-17', 'Deepavali', 0),
('2026-12-25', 'Christmas Day', 1);
```

### TypeScript Types

```typescript
// lib/db.ts
export interface Holiday {
  id: number;
  date: string;  // YYYY-MM-DD
  name: string;
  is_recurring: boolean;
  created_at: string;
}

export interface CalendarDay {
  date: Date;
  dateString: string;  // YYYY-MM-DD
  dayNumber: number;   // 1-31
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  todos: Todo[];
  holiday: Holiday | null;
}

export interface CalendarMonth {
  year: number;
  month: number;  // 0-11 (JavaScript Date convention)
  monthName: string;
  days: CalendarDay[];
  weeks: CalendarDay[][];  // Grouped by weeks
}
```

### Calendar Generation Logic

```typescript
// lib/calendar.ts
import { getSingaporeNow, formatSingaporeDateShort } from './timezone';

export function generateCalendar(
  year: number,
  month: number,  // 0-11
  todos: Todo[],
  holidays: Holiday[]
): CalendarMonth {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  
  // Get first day of week (0 = Sunday)
  const firstDayOfWeek = firstDay.getDay();
  
  // Generate days
  const days: CalendarDay[] = [];
  const today = getSingaporeNow();
  const todayString = formatSingaporeDateShort(today); // YYYY-MM-DD
  
  // Add padding days from previous month
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const dayNumber = prevMonthLastDay - i;
    const date = new Date(year, month - 1, dayNumber);
    days.push(createCalendarDay(date, false, todayString, todos, holidays));
  }
  
  // Add current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    days.push(createCalendarDay(date, true, todayString, todos, holidays));
  }
  
  // Add padding days from next month
  const remainingDays = 42 - days.length; // 6 weeks * 7 days
  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(year, month + 1, day);
    days.push(createCalendarDay(date, false, todayString, todos, holidays));
  }
  
  // Group into weeks
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  
  return {
    year,
    month,
    monthName: firstDay.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    days,
    weeks,
  };
}

function createCalendarDay(
  date: Date,
  isCurrentMonth: boolean,
  todayString: string,
  todos: Todo[],
  holidays: Holiday[]
): CalendarDay {
  const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const dayOfWeek = date.getDay();
  
  return {
    date,
    dateString,
    dayNumber: date.getDate(),
    isCurrentMonth,
    isToday: dateString === todayString,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    todos: todos.filter(t => t.due_date?.startsWith(dateString)),
    holiday: holidays.find(h => h.date === dateString) || null,
  };
}
```

### API Endpoints

#### GET /api/holidays - List Holidays

```typescript
// app/api/holidays/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { holidayDB } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get('year');
  
  let holidays;
  if (year) {
    holidays = holidayDB.findByYear(parseInt(year));
  } else {
    holidays = holidayDB.findAll();
  }
  
  return NextResponse.json({ holidays });
}
```

## UI Components

### Calendar Page Component

```typescript
// app/calendar/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Todo, Holiday } from '@/lib/db';
import { generateCalendar } from '@/lib/calendar';
import { CalendarGrid } from '@/components/CalendarGrid';
import { CalendarNav } from '@/components/CalendarNav';
import { DayModal } from '@/components/DayModal';

export default function CalendarPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  
  // Parse month from URL or use current
  const monthParam = searchParams.get('month');
  const [year, month] = monthParam 
    ? monthParam.split('-').map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1];
  
  useEffect(() => {
    // Fetch todos and holidays
    Promise.all([
      fetch('/api/todos').then(r => r.json()),
      fetch('/api/holidays').then(r => r.json()),
    ]).then(([todosData, holidaysData]) => {
      setTodos(todosData.todos);
      setHolidays(holidaysData.holidays);
    });
  }, []);
  
  const calendar = generateCalendar(year, month - 1, todos, holidays);
  
  const navigateMonth = (offset: number) => {
    const newDate = new Date(year, month - 1 + offset, 1);
    const newYear = newDate.getFullYear();
    const newMonth = newDate.getMonth() + 1;
    router.push(`/calendar?month=${newYear}-${String(newMonth).padStart(2, '0')}`);
  };
  
  const goToToday = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    router.push(`/calendar?month=${year}-${String(month).padStart(2, '0')}`);
  };
  
  return (
    <div className="container mx-auto p-4">
      <CalendarNav
        monthName={calendar.monthName}
        onPrevMonth={() => navigateMonth(-1)}
        onNextMonth={() => navigateMonth(1)}
        onToday={goToToday}
      />
      
      <CalendarGrid
        calendar={calendar}
        onDayClick={setSelectedDay}
      />
      
      {selectedDay && (
        <DayModal
          day={selectedDay}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
```

### Calendar Navigation Component

```typescript
// components/CalendarNav.tsx
'use client';

export function CalendarNav({
  monthName,
  onPrevMonth,
  onNextMonth,
  onToday,
}: {
  monthName: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold" data-testid="calendar-month-title">
        {monthName}
      </h1>
      
      <div className="flex gap-2">
        <button
          onClick={onPrevMonth}
          className="px-4 py-2 border rounded hover:bg-gray-50"
          data-testid="prev-month-button"
        >
          ← Previous
        </button>
        
        <button
          onClick={onToday}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          data-testid="today-button"
        >
          Today
        </button>
        
        <button
          onClick={onNextMonth}
          className="px-4 py-2 border rounded hover:bg-gray-50"
          data-testid="next-month-button"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
```

### Calendar Grid Component

```typescript
// components/CalendarGrid.tsx
'use client';

import { CalendarMonth, CalendarDay } from '@/lib/db';

export function CalendarGrid({
  calendar,
  onDayClick,
}: {
  calendar: CalendarMonth;
  onDayClick: (day: CalendarDay) => void;
}) {
  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 bg-gray-100">
        {dayHeaders.map(day => (
          <div key={day} className="p-2 text-center font-semibold text-sm">
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar weeks */}
      {calendar.weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="grid grid-cols-7">
          {week.map((day, dayIndex) => (
            <CalendarDayCell
              key={`${weekIndex}-${dayIndex}`}
              day={day}
              onClick={() => onDayClick(day)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
```

### Calendar Day Cell Component

```typescript
// components/CalendarDayCell.tsx
'use client';

import { CalendarDay } from '@/lib/db';

export function CalendarDayCell({
  day,
  onClick,
}: {
  day: CalendarDay;
  onClick: () => void;
}) {
  const bgColor = day.holiday
    ? 'bg-red-50'
    : day.isToday
    ? 'bg-blue-50'
    : day.isWeekend
    ? 'bg-gray-50'
    : 'bg-white';
  
  const textColor = day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400';
  
  const borderClass = day.isToday ? 'border-2 border-blue-500' : 'border border-gray-200';
  
  return (
    <div
      className={`${bgColor} ${borderClass} p-2 min-h-[100px] cursor-pointer hover:bg-gray-100 transition-colors`}
      onClick={onClick}
      data-testid={`calendar-day-${day.dateString}`}
    >
      <div className={`text-sm font-semibold ${textColor}`}>
        {day.dayNumber}
      </div>
      
      {day.holiday && (
        <div className="text-xs text-red-600 mt-1">
          {day.holiday.name}
        </div>
      )}
      
      {day.todos.length > 0 && (
        <div className="mt-2 space-y-1">
          {day.todos.slice(0, 3).map(todo => (
            <div
              key={todo.id}
              className="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded truncate"
            >
              {todo.title}
            </div>
          ))}
          {day.todos.length > 3 && (
            <div className="text-xs text-gray-500">
              +{day.todos.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

### Day Modal Component

```typescript
// components/DayModal.tsx
'use client';

import { CalendarDay } from '@/lib/db';
import { formatSingaporeDateLong } from '@/lib/timezone';

export function DayModal({
  day,
  onClose,
}: {
  day: CalendarDay;
  onClose: () => void;
}) {
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
      data-testid="day-modal"
    >
      <div 
        className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">
          Todos for {formatSingaporeDateLong(day.dateString)}
        </h2>
        
        {day.holiday && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
            <span className="text-red-700 font-semibold">🎉 {day.holiday.name}</span>
          </div>
        )}
        
        {day.todos.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No todos due on this day</p>
        ) : (
          <div className="space-y-2">
            {day.todos.map(todo => (
              <div key={todo.id} className="p-3 border rounded hover:bg-gray-50">
                <h3 className="font-medium">{todo.title}</h3>
                <div className="flex gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    todo.priority === 'high' ? 'bg-red-100 text-red-700' :
                    todo.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {todo.priority.toUpperCase()}
                  </span>
                  {todo.completed && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                      COMPLETED
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        <button
          onClick={onClose}
          className="mt-6 w-full px-4 py-2 border rounded hover:bg-gray-50"
          data-testid="close-day-modal"
        >
          Close
        </button>
      </div>
    </div>
  );
}
```

## Edge Cases

### 1. Month with 5 vs 6 Weeks
- **Scenario**: Some months need 5 weeks, others 6
- **Handling**: Always show 6 weeks (42 days) for consistent grid
- **Result**: Extra days from next month shown in gray

### 2. Year Boundary Navigation
- **Scenario**: User navigates from January to previous month (December)
- **Handling**: Correctly handle year change: 2026-01 → 2025-12
- **Result**: Calendar shows December 2025

### 3. Leap Year February
- **Scenario**: February 2024 (leap year) vs February 2025
- **Handling**: JavaScript Date handles this automatically
- **Result**: Correct number of days shown

### 4. Multiple Todos on Same Day
- **Scenario**: 10 todos due on same date
- **Handling**: Show first 3, then "+7 more"
- **Modal**: Shows all 10 when day is clicked

### 5. Todo Due at Midnight
- **Scenario**: Todo due at 2026-02-15T00:00:00
- **Handling**: Date comparison uses startsWith(dateString)
- **Result**: Shows on Feb 15

### 6. Timezone Edge Cases
- **Scenario**: User in different timezone views calendar
- **Handling**: All dates use Singapore timezone
- **Result**: Consistent view regardless of user location

### 7. Holiday on Weekend
- **Scenario**: Christmas falls on Saturday
- **Handling**: Show both weekend styling and holiday styling
- **Result**: Red holiday background overrides weekend gray

### 8. No Holidays for Year
- **Scenario**: Viewing year 2030 with no seeded holidays
- **Handling**: Calendar still works, just no holiday indicators
- **Result**: Normal calendar without holiday labels

## Acceptance Criteria

### Must Have
- ✅ Calendar displays current month on load
- ✅ Navigate to previous month
- ✅ Navigate to next month
- ✅ "Today" button returns to current month
- ✅ Current day highlighted with border
- ✅ Weekend days have different background
- ✅ Days from other months shown in gray
- ✅ Todos appear on their due dates
- ✅ Holiday names displayed below dates
- ✅ Holiday days have red background
- ✅ Click on day opens modal
- ✅ Modal shows all todos for that day
- ✅ Modal shows holiday name if applicable
- ✅ Close modal by clicking outside or close button
- ✅ URL param updates when navigating months
- ✅ Can share specific month URL
- ✅ All dates use Singapore timezone

### Should Have
- ⚠️ Todo count badge on days with many todos
- ⚠️ Color-coded todo indicators by priority
- ⚠️ Create todo from calendar day (click + add)
- ⚠️ Week numbers displayed

### Nice to Have
- ❌ Drag-and-drop todos between dates
- ❌ Multi-day events spanning dates
- ❌ Custom views (week, day, agenda)
- ❌ Print calendar view
- ❌ Export calendar to iCal format

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/10-calendar-view.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Calendar View', () => {
  test('should display current month', async ({ page }) => {
    await page.goto('/calendar');
    
    const now = new Date();
    const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    
    await expect(page.locator('[data-testid="calendar-month-title"]')).toContainText(monthName);
  });
  
  test('should navigate to previous month', async ({ page }) => {
    await page.goto('/calendar?month=2026-02');
    
    await page.click('[data-testid="prev-month-button"]');
    
    await expect(page).toHaveURL(/month=2026-01/);
    await expect(page.locator('[data-testid="calendar-month-title"]')).toContainText('January 2026');
  });
  
  test('should navigate to next month', async ({ page }) => {
    await page.goto('/calendar?month=2026-02');
    
    await page.click('[data-testid="next-month-button"]');
    
    await expect(page).toHaveURL(/month=2026-03/);
    await expect(page.locator('[data-testid="calendar-month-title"]')).toContainText('March 2026');
  });
  
  test('should return to today', async ({ page }) => {
    await page.goto('/calendar?month=2025-01');
    
    await page.click('[data-testid="today-button"]');
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    await expect(page).toHaveURL(new RegExp(`month=${year}-${month}`));
  });
  
  test('should display todo on correct date', async ({ page }) => {
    // Create todo with specific due date
    await page.goto('/');
    await page.fill('[data-testid="todo-title-input"]', 'Calendar test todo');
    await page.fill('[data-testid="todo-due-date-input"]', '2026-02-15T14:00');
    await page.click('[data-testid="add-todo-button"]');
    
    // Navigate to calendar
    await page.goto('/calendar?month=2026-02');
    
    // Find Feb 15 and verify todo appears
    const feb15 = page.locator('[data-testid="calendar-day-2026-02-15"]');
    await expect(feb15.locator('text=Calendar test todo')).toBeVisible();
  });
  
  test('should open day modal on click', async ({ page }) => {
    await page.goto('/calendar?month=2026-02');
    
    await page.click('[data-testid="calendar-day-2026-02-15"]');
    
    await expect(page.locator('[data-testid="day-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="day-modal"]')).toContainText('February 15');
  });
  
  test('should close modal', async ({ page }) => {
    await page.goto('/calendar?month=2026-02');
    
    await page.click('[data-testid="calendar-day-2026-02-15"]');
    await page.click('[data-testid="close-day-modal"]');
    
    await expect(page.locator('[data-testid="day-modal"]')).not.toBeVisible();
  });
});
```

### Unit Tests

```typescript
// tests/calendar.test.ts
import { generateCalendar } from '@/lib/calendar';

describe('Calendar Generation', () => {
  it('should generate calendar for current month', () => {
    const calendar = generateCalendar(2026, 1, [], []); // February 2026
    
    expect(calendar.year).toBe(2026);
    expect(calendar.month).toBe(1);
    expect(calendar.monthName).toBe('February 2026');
    expect(calendar.weeks).toHaveLength(6);
  });
  
  it('should mark today correctly', () => {
    const today = new Date();
    const calendar = generateCalendar(today.getFullYear(), today.getMonth(), [], []);
    
    const todayCell = calendar.days.find(d => d.isToday);
    expect(todayCell).toBeDefined();
    expect(todayCell?.dayNumber).toBe(today.getDate());
  });
  
  it('should mark weekends', () => {
    const calendar = generateCalendar(2026, 1, [], []);
    
    const weekends = calendar.days.filter(d => d.isWeekend && d.isCurrentMonth);
    expect(weekends.length).toBeGreaterThan(0);
    
    weekends.forEach(day => {
      const dayOfWeek = day.date.getDay();
      expect([0, 6]).toContain(dayOfWeek);
    });
  });
  
  it('should assign todos to correct days', () => {
    const todos = [
      { id: 1, due_date: '2026-02-15T14:00:00Z', title: 'Test' },
    ];
    
    const calendar = generateCalendar(2026, 1, todos as any, []);
    
    const feb15 = calendar.days.find(d => d.dateString === '2026-02-15');
    expect(feb15?.todos).toHaveLength(1);
    expect(feb15?.todos[0].title).toBe('Test');
  });
});
```

## Out of Scope

- Week view or day view
- Drag-and-drop rescheduling
- Multi-day events
- Recurring event display (show all instances)
- Calendar printing
- iCal/ICS export
- Calendar sharing
- Event reminders from calendar
- Custom calendar colors/themes
- Time slots within days

## Success Metrics

### Functional Metrics
- ✅ All todos appear on correct dates
- ✅ Navigation works smoothly
- ✅ Holidays display correctly
- ✅ Modal shows complete todo information

### Technical Metrics
- ✅ Calendar generation completes in < 50ms
- ✅ Navigation updates URL correctly
- ✅ All dates use Singapore timezone
- ✅ Responsive layout works on mobile

### User Experience Metrics
- ✅ Calendar loads instantly (< 500ms)
- ✅ Current day easily identifiable
- ✅ Holidays clearly marked
- ✅ Todo indicators not cluttered

## Implementation Checklist

- [ ] holidays table in database
- [ ] Seed script for Singapore holidays
- [ ] GET /api/holidays endpoint
- [ ] generateCalendar utility function
- [ ] createCalendarDay helper function
- [ ] Calendar page component (/calendar route)
- [ ] CalendarNav component
- [ ] CalendarGrid component
- [ ] CalendarDayCell component
- [ ] DayModal component
- [ ] URL state management with searchParams
- [ ] Singapore timezone for all date operations
- [ ] E2E tests for navigation and modal
- [ ] Unit tests for calendar generation
- [ ] Weekend and today styling
- [ ] Holiday styling and labels

---

**Last Updated**: February 6, 2026
**Feature Status**: Phase 4 - Productivity Feature
**Dependencies**: Feature 01 (CRUD), Singapore timezone utilities
