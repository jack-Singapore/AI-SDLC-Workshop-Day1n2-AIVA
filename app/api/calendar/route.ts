import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, holidayDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

// GET /api/calendar - Get todos and holidays for a specific month
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let month = searchParams.get('month');

  // Default to current month if not provided
  if (!month) {
    const now = getSingaporeNow();
    month = `${now.year}-${String(now.month).padStart(2, '0')}`;
  }

  // Validate month format (YYYY-MM)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format. Expected YYYY-MM' }, { status: 400 });
  }

  const todos = todoDB.getByMonth(session.userId, month);
  const holidays = holidayDB.getByMonth(month);

  return NextResponse.json({
    todos,
    holidays,
  });
}
