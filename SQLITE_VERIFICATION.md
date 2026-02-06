# SQLite Database Verification Report

**Date:** 2026-02-06  
**Status:** ✅ VERIFIED - Application uses SQLite

---

## Executive Summary

This report confirms that the Todo App uses **SQLite** as its database system via the `better-sqlite3` npm package. The application is documented and configured correctly for SQLite usage.

---

## Evidence of SQLite Usage

### 1. Official Documentation Confirmation

#### `.github/copilot-instructions.md` (Lines 5, 10, 37)
```markdown
This is a **Next.js 16** todo application with WebAuthn authentication, 
using **better-sqlite3** for data persistence

- **Database**: SQLite via `better-sqlite3` (`todos.db` in project root)

**Technology:** `better-sqlite3` - synchronous SQLite library 
(no async/await needed for DB operations). Database file: `todos.db` in project root.
```

#### `MCP_SQLITE_GUIDE.md`
Dedicated 261-line guide for SQLite MCP (Model Context Protocol) server configuration:
- Explains how to interact with the SQLite database via Claude Code
- Documents database schema and query patterns
- Provides troubleshooting for SQLite-specific issues

#### `README.md` (Complete Setup Guide)
References SQLite in multiple sections:
- Database management commands: `sqlite3 todos.db`
- Database troubleshooting section
- Installation and setup instructions

---

## Database Technology Details

### Package: `better-sqlite3`

**Characteristics:**
- **Synchronous API** - No promises or async/await needed
- **High Performance** - Faster than asynchronous alternatives for many use cases
- **Simple Integration** - No external database server required
- **File-Based Storage** - Data stored in `todos.db` file in project root

### Database File Location
```
/path/to/project/todos.db
```

### Database Schema

**8 Main Tables:**
1. `users` - User accounts with WebAuthn credentials
2. `authenticators` - WebAuthn authenticator data  
3. `todos` - Todo items with priority, dates, and recurrence
4. `subtasks` - Subtasks belonging to todos (CASCADE delete)
5. `tags` - Custom tags for organizing todos
6. `todo_tags` - Many-to-many relationship between todos and tags
7. `templates` - Todo templates for quick creation
8. `holidays` - Singapore public holiday calendar

**Relationships:**
- `users` → `authenticators` (one-to-many)
- `users` → `todos` → `subtasks` (one-to-many with CASCADE delete)
- `todos` ↔ `tags` (many-to-many via `todo_tags`)
- `users` → `templates` (one-to-many)

---

## Key SQLite Features Used

### 1. Synchronous Operations
From `copilot-instructions.md`:
```typescript
// All DB operations are synchronous - no promises/async needed for queries
db.prepare('SELECT * FROM todos WHERE user_id = ?').all(userId);
```

### 2. Prepared Statements
- All queries use `db.prepare()` for security and performance
- Parameterized queries to prevent SQL injection

### 3. Database Management Commands

**Seed Singapore holidays:**
```bash
npx tsx scripts/seed-holidays.ts
```

**Inspect database:**
```bash
sqlite3 todos.db
```

**Database CLI operations:**
```sql
.tables              -- List all tables
.schema todos        -- View table schema
SELECT * FROM todos; -- Query data
```

---

## Architecture Integration

### Database Layer: `lib/db.ts`
- **Single source of truth** for all database operations (~700 lines)
- Exports all database interfaces and CRUD operations
- Handles migrations with try-catch `ALTER TABLE` blocks
- Provides DB objects: `todoDB`, `tagDB`, `userDB`, etc.

### API Route Pattern
```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  
  // Use synchronous SQLite operations
  const todos = db.prepare('SELECT * FROM todos WHERE user_id = ?').all(session.userId);
  
  return NextResponse.json(todos);
}
```

### Client-Server Separation
- ✅ Client components never import `lib/db.ts` directly
- ✅ All database operations happen server-side in API routes
- ✅ Clean separation of concerns

---

## Development Workflow

### Local Development
```bash
npm run dev           # Start dev server on :3000
# SQLite database file created automatically if not exists
```

### Database Inspection
```bash
sqlite3 todos.db
.tables               # List all tables
.schema todos         # View schema
SELECT * FROM todos;  # Query data
.exit                 # Exit CLI
```

### Database Reset (if needed)
```bash
# Stop dev server (Ctrl+C)
rm todos.db           # Delete database file
npm run dev           # Restart server (recreates database)
```

---

## Production Considerations (from Documentation)

### Vercel Deployment Limitation
⚠️ **SQLite files reset on each deployment** in Vercel's serverless environment

**Recommended Solutions (from EVALUATION.md):**
1. Use Vercel Postgres for persistent storage
2. Switch to Railway for SQLite persistence (with volumes)
3. Use external database (Supabase, PlanetScale)

### Railway Deployment with SQLite
Railway supports persistent SQLite with volumes:

```bash
# Create volume for database
railway volume create todo-db

# Mount volume at /app/data
# Update database path in lib/db.ts to: /app/data/todos.db
```

---

## Testing with SQLite

### Playwright E2E Tests
- Tests use the same SQLite database
- Database operations are synchronous (simplifies test setup)
- Test files verify database integrity:
  - `tests/01-authentication.spec.ts` - User and authenticator tables
  - `tests/02-todo-crud.spec.ts` - Todo CRUD operations
  - `tests/03-recurring-todos.spec.ts` - Recurrence logic
  - etc.

### Timezone Handling
All database date/time operations use Singapore timezone (`Asia/Singapore`):
```typescript
import { getSingaporeNow } from '@/lib/timezone';
const now = getSingaporeNow(); // NOT new Date()
```

---

## MCP Server Integration

### SQLite MCP Server
The repository includes comprehensive documentation for using Claude Code with SQLite:

**Configuration File:** `~/.claude/mcp.json`
```json
{
  "mcpServers": {
    "todo-app-sqlite": {
      "command": "node",
      "args": [
        "/path/to/mcp-sqlite-server.js",
        "/path/to/todos.db"
      ]
    }
  }
}
```

**Capabilities:**
- Direct database queries from Claude Code
- Schema exploration
- Data analysis
- Debugging assistance

**Example Queries:**
```
Show me all todos for user ID 1
What's the schema of the authenticators table?
Count how many recurring todos we have
```

---

## Security Considerations

### SQL Injection Prevention
✅ All queries use prepared statements:
```typescript
// GOOD - Parameterized query
db.prepare('SELECT * FROM todos WHERE id = ?').get(todoId);

// BAD - String concatenation (NOT USED)
// db.prepare(`SELECT * FROM todos WHERE id = ${todoId}`);
```

### Access Control
✅ Session-based authentication enforced at API layer:
```typescript
const session = await getSession();
// All queries filtered by session.userId
```

### Database File Permissions
- Readable/writable only by application process
- Not exposed to client-side code
- Located in project root (not in public directory)

---

## Documentation References

### Primary Sources
1. **`.github/copilot-instructions.md`** - Complete architecture documentation
2. **`MCP_SQLITE_GUIDE.md`** - SQLite MCP server setup and usage
3. **`README.md`** - Complete setup guide with SQLite commands
4. **`EVALUATION.md`** - Database schema requirements and checklists
5. **`RAILWAY_DEPLOYMENT.md`** - Production deployment with SQLite

### Code References
- `lib/db.ts` - Database layer (~700 lines)
- `app/api/**/*.ts` - API routes using SQLite
- `tests/*.spec.ts` - E2E tests with SQLite

---

## Conclusion

**✅ VERIFIED:** The Todo App definitively uses **SQLite** via the `better-sqlite3` package.

### Key Confirmations:
1. ✅ Official documentation explicitly states SQLite usage
2. ✅ Database architecture designed for `better-sqlite3` (synchronous API)
3. ✅ Database file: `todos.db` in project root
4. ✅ Dedicated SQLite MCP guide for developer interaction
5. ✅ Production deployment docs address SQLite persistence
6. ✅ All references in codebase point to SQLite patterns

### Database Technology Summary:
- **Database:** SQLite
- **Library:** `better-sqlite3` (synchronous Node.js binding)
- **File:** `todos.db`
- **Location:** Project root directory
- **Schema:** 8 tables with relational structure
- **API:** Synchronous (no async/await needed)

---

**Report Generated:** 2026-02-06  
**Repository:** jack-Singapore/AI-SDLC-Workshop-Day1n2-AIVA  
**Purpose:** Verify SQLite database usage in Todo App
