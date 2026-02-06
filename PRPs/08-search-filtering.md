# Feature 08: Search & Filtering

## Feature Overview

Implement a comprehensive search and filtering system that allows users to quickly find specific todos using real-time text search, priority filters, tag filters, and status filters. The system uses client-side filtering for instant results with debounced search input to optimize performance.

## User Stories

**As a user**, I want to:
- Search todos by title using a search box
- See search results update in real-time as I type
- Filter todos by priority (High, Medium, Low)
- Filter todos by tag (click on tag badge to filter)
- Filter by completion status (Active, Completed, All)
- Combine multiple filters (AND logic)
- See a clear indication of active filters
- Clear all filters with one click
- See an empty state message when no todos match my filters
- Have search be case-insensitive

## User Flow

### Basic Text Search
1. User types "meeting" in search box
2. Search debounces for 300ms
3. Todo list updates to show only todos with "meeting" in title
4. User sees "Showing 3 todos matching 'meeting'"
5. User clears search box
6. All todos appear again

### Filter by Priority
1. User selects "High" from priority filter dropdown
2. List updates to show only high-priority todos
3. Filter indicator shows "Priority: High"
4. User clicks "Clear Filters"
5. All todos appear again

### Filter by Tag
1. User clicks on "work" tag badge on a todo
2. List updates to show only todos with "work" tag
3. Filter indicator shows "Tag: work"
4. Badge is highlighted to show active filter

### Combined Filters
1. User enters "report" in search box
2. User selects "High" priority
3. User clicks "urgent" tag
4. List shows only todos that:
   - Contain "report" in title AND
   - Have high priority AND
   - Have "urgent" tag
5. Filter summary shows: "Search: 'report' • Priority: High • Tag: urgent"

### Clear All Filters
1. User has multiple filters active
2. User clicks "Clear All Filters" button
3. All filters reset
4. Full todo list appears
5. Search box clears
6. Dropdowns reset to "All"

## Technical Requirements

### State Management

```typescript
// app/page.tsx or lib/hooks/useFilters.ts
interface FilterState {
  searchText: string;
  priority: Priority | null;
  tagId: number | null;
  status: 'all' | 'active' | 'completed';
}

const defaultFilters: FilterState = {
  searchText: '',
  priority: null,
  tagId: null,
  status: 'all',
};
```

### Filtering Logic

```typescript
// lib/utils.ts
export function applyFilters(
  todos: Todo[],
  filters: FilterState,
  tags: Tag[]
): Todo[] {
  let filtered = [...todos];
  
  // Filter by search text (case-insensitive, matches title)
  if (filters.searchText.trim()) {
    const searchLower = filters.searchText.toLowerCase();
    filtered = filtered.filter(todo =>
      todo.title.toLowerCase().includes(searchLower)
    );
  }
  
  // Filter by priority
  if (filters.priority) {
    filtered = filtered.filter(todo => todo.priority === filters.priority);
  }
  
  // Filter by tag
  if (filters.tagId) {
    filtered = filtered.filter(todo => {
      const todoTags = tags.filter(tag => tag.todo_id === todo.id);
      return todoTags.some(tag => tag.id === filters.tagId);
    });
  }
  
  // Filter by status
  if (filters.status !== 'all') {
    if (filters.status === 'active') {
      filtered = filtered.filter(todo => !todo.completed);
    } else if (filters.status === 'completed') {
      filtered = filtered.filter(todo => todo.completed);
    }
  }
  
  return filtered;
}
```

### Debounced Search

```typescript
// lib/hooks/useDebounce.ts
'use client';

import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  
  return debouncedValue;
}
```

## UI Components

### Search Bar Component

```typescript
// components/SearchBar.tsx
'use client';

import { useState } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';

export function SearchBar({ 
  onSearch 
}: { 
  onSearch: (text: string) => void;
}) {
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 300);
  
  // Effect to call onSearch when debounced value changes
  useEffect(() => {
    onSearch(debouncedSearch);
  }, [debouncedSearch, onSearch]);
  
  return (
    <div className="relative">
      <input
        type="text"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Search todos..."
        className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        data-testid="search-input"
      />
      <svg
        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      {searchText && (
        <button
          onClick={() => setSearchText('')}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          data-testid="clear-search"
        >
          ✕
        </button>
      )}
    </div>
  );
}
```

### Filter Bar Component

```typescript
// components/FilterBar.tsx
'use client';

import { Priority, Tag } from '@/lib/db';

export function FilterBar({
  filters,
  tags,
  onFilterChange,
  onClearAll,
}: {
  filters: FilterState;
  tags: Tag[];
  onFilterChange: (filters: Partial<FilterState>) => void;
  onClearAll: () => void;
}) {
  const hasActiveFilters = 
    filters.searchText || 
    filters.priority || 
    filters.tagId || 
    filters.status !== 'all';
  
  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center flex-wrap">
        {/* Priority Filter */}
        <div>
          <label className="text-sm font-medium text-gray-700 mr-2">Priority:</label>
          <select
            value={filters.priority || ''}
            onChange={(e) => onFilterChange({ 
              priority: e.target.value ? e.target.value as Priority : null 
            })}
            className="px-3 py-2 border rounded"
            data-testid="filter-priority"
          >
            <option value="">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        
        {/* Status Filter */}
        <div>
          <label className="text-sm font-medium text-gray-700 mr-2">Status:</label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange({ 
              status: e.target.value as 'all' | 'active' | 'completed'
            })}
            className="px-3 py-2 border rounded"
            data-testid="filter-status"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        
        {/* Tag Filter */}
        {tags.length > 0 && (
          <div>
            <label className="text-sm font-medium text-gray-700 mr-2">Tag:</label>
            <select
              value={filters.tagId || ''}
              onChange={(e) => onFilterChange({ 
                tagId: e.target.value ? parseInt(e.target.value) : null 
              })}
              className="px-3 py-2 border rounded"
              data-testid="filter-tag"
            >
              <option value="">All</option>
              {tags.map(tag => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </div>
        )}
        
        {/* Clear All Button */}
        {hasActiveFilters && (
          <button
            onClick={onClearAll}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border rounded hover:bg-gray-50"
            data-testid="clear-filters"
          >
            Clear All Filters
          </button>
        )}
      </div>
      
      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="flex gap-2 flex-wrap" data-testid="active-filters-summary">
          {filters.searchText && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
              Search: "{filters.searchText}"
            </span>
          )}
          {filters.priority && (
            <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">
              Priority: {filters.priority}
            </span>
          )}
          {filters.tagId && (
            <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded">
              Tag: {tags.find(t => t.id === filters.tagId)?.name}
            </span>
          )}
          {filters.status !== 'all' && (
            <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
              Status: {filters.status}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

### Results Counter Component

```typescript
// components/ResultsCounter.tsx
'use client';

export function ResultsCounter({ 
  total, 
  filtered, 
  hasFilters 
}: { 
  total: number;
  filtered: number;
  hasFilters: boolean;
}) {
  if (!hasFilters) {
    return (
      <div className="text-sm text-gray-600">
        Showing {total} {total === 1 ? 'todo' : 'todos'}
      </div>
    );
  }
  
  return (
    <div className="text-sm text-gray-600">
      Showing {filtered} of {total} {total === 1 ? 'todo' : 'todos'}
    </div>
  );
}
```

### Empty State Component

```typescript
// components/EmptyState.tsx
'use client';

export function EmptyState({ 
  hasFilters 
}: { 
  hasFilters: boolean;
}) {
  if (hasFilters) {
    return (
      <div className="text-center py-12" data-testid="no-results">
        <p className="text-gray-500 text-lg mb-2">No todos match your filters</p>
        <p className="text-gray-400 text-sm">Try adjusting your search or filters</p>
      </div>
    );
  }
  
  return (
    <div className="text-center py-12" data-testid="no-todos">
      <p className="text-gray-500 text-lg mb-2">No todos yet</p>
      <p className="text-gray-400 text-sm">Create your first todo above</p>
    </div>
  );
}
```

### Main Page Integration

```typescript
// app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Todo, Tag, Priority } from '@/lib/db';
import { SearchBar } from '@/components/SearchBar';
import { FilterBar } from '@/components/FilterBar';
import { ResultsCounter } from '@/components/ResultsCounter';
import { EmptyState } from '@/components/EmptyState';
import { applyFilters } from '@/lib/utils';

export default function HomePage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  
  // Fetch todos and tags
  useEffect(() => {
    // Fetch logic...
  }, []);
  
  // Apply filters
  const filteredTodos = applyFilters(todos, filters, tags);
  
  const hasActiveFilters = 
    filters.searchText || 
    filters.priority || 
    filters.tagId || 
    filters.status !== 'all';
  
  const handleFilterChange = (updates: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  };
  
  const handleClearAll = () => {
    setFilters(defaultFilters);
  };
  
  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Search Bar */}
      <SearchBar onSearch={(text) => handleFilterChange({ searchText: text })} />
      
      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        tags={tags}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAll}
      />
      
      {/* Results Counter */}
      <ResultsCounter
        total={todos.length}
        filtered={filteredTodos.length}
        hasFilters={hasActiveFilters}
      />
      
      {/* Todo List or Empty State */}
      {filteredTodos.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} />
      ) : (
        <TodoList todos={filteredTodos} />
      )}
    </div>
  );
}
```

## Edge Cases

### 1. Search with Special Characters
- **Scenario**: User searches for "meeting@work"
- **Handling**: Treat as literal string, no regex escaping needed
- **Result**: Matches todos with that exact text

### 2. Empty Search Results
- **Scenario**: Search returns 0 todos
- **Handling**: Show EmptyState with "No todos match your filters"
- **Action**: User can clear filters or modify search

### 3. Simultaneous Filter Changes
- **Scenario**: User rapidly changes priority and tag filters
- **Handling**: Each change triggers re-render, React batches updates
- **Result**: Smooth performance, no lag

### 4. Case-Insensitive Search
- **Scenario**: User searches "MEETING"
- **Handling**: Convert both search text and todo titles to lowercase
- **Result**: Matches "meeting", "Meeting", "MEETING"

### 5. Tag Filter with Deleted Tag
- **Scenario**: User has tag filter active, tag gets deleted
- **Handling**: tagId won't match any tag, filter shows no results
- **Fix**: Clear tagId filter when tag is deleted

### 6. Filter Persistence Across Page Reload
- **Scenario**: User refreshes page with filters active
- **Handling**: Filters reset to defaults (no persistence)
- **Future**: Store in localStorage or URL params

### 7. Very Large Dataset (1000+ Todos)
- **Scenario**: Client-side filtering becomes slow
- **Handling**: Debounced search already helps
- **Optimization**: Memoize filter function with useMemo

### 8. Whitespace-Only Search
- **Scenario**: User enters "   " in search box
- **Handling**: Trim search text, treat as empty
- **Result**: No filtering applied

## Acceptance Criteria

### Must Have
- ✅ Search box at top of page
- ✅ Search updates in real-time with 300ms debounce
- ✅ Search is case-insensitive
- ✅ Search matches todo titles
- ✅ Priority filter dropdown (All, High, Medium, Low)
- ✅ Status filter dropdown (All, Active, Completed)
- ✅ Tag filter dropdown (if tags exist)
- ✅ Clicking tag badge sets tag filter
- ✅ Multiple filters combine with AND logic
- ✅ Active filters summary shows current filters
- ✅ "Clear All Filters" button visible when filters active
- ✅ Results counter shows "X of Y todos"
- ✅ Empty state shows different messages for no todos vs no matches
- ✅ Filter updates don't lag (< 100ms)

### Should Have
- ⚠️ Search also matches tag names (advanced search)
- ⚠️ Filter persistence in URL params
- ⚠️ Keyboard shortcut for search (Ctrl+K / Cmd+K)
- ⚠️ Search history dropdown

### Nice to Have
- ❌ Fuzzy search (typo tolerance)
- ❌ Search suggestions/autocomplete
- ❌ Saved filter presets
- ❌ Advanced search syntax (title:meeting priority:high)

## Testing Requirements

### E2E Tests (Playwright)

```typescript
// tests/08-search-filtering.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Search & Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Create test todos
    await page.fill('[data-testid="todo-title-input"]', 'Meeting with team');
    await page.selectOption('[data-testid="todo-priority-select"]', 'high');
    await page.click('[data-testid="add-todo-button"]');
    
    await page.fill('[data-testid="todo-title-input"]', 'Write report');
    await page.selectOption('[data-testid="todo-priority-select"]', 'medium');
    await page.click('[data-testid="add-todo-button"]');
    
    await page.fill('[data-testid="todo-title-input"]', 'Meeting notes');
    await page.selectOption('[data-testid="todo-priority-select"]', 'low');
    await page.click('[data-testid="add-todo-button"]');
  });
  
  test('should search todos by title', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'meeting');
    
    // Wait for debounce
    await page.waitForTimeout(350);
    
    await expect(page.locator('text=Meeting with team')).toBeVisible();
    await expect(page.locator('text=Meeting notes')).toBeVisible();
    await expect(page.locator('text=Write report')).not.toBeVisible();
  });
  
  test('should be case-insensitive', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'MEETING');
    await page.waitForTimeout(350);
    
    await expect(page.locator('text=Meeting with team')).toBeVisible();
  });
  
  test('should filter by priority', async ({ page }) => {
    await page.selectOption('[data-testid="filter-priority"]', 'high');
    
    await expect(page.locator('text=Meeting with team')).toBeVisible();
    await expect(page.locator('text=Write report')).not.toBeVisible();
  });
  
  test('should filter by status', async ({ page }) => {
    // Complete one todo
    await page.click('[data-testid^="todo-checkbox-"]').first();
    
    // Filter by completed
    await page.selectOption('[data-testid="filter-status"]', 'completed');
    
    // Should see only completed todos
    const visibleTodos = page.locator('[data-testid="todo-item"]:visible');
    await expect(visibleTodos).toHaveCount(1);
  });
  
  test('should combine multiple filters', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'meeting');
    await page.selectOption('[data-testid="filter-priority"]', 'high');
    await page.waitForTimeout(350);
    
    // Should only show high-priority meetings
    await expect(page.locator('text=Meeting with team')).toBeVisible();
    await expect(page.locator('text=Meeting notes')).not.toBeVisible();
  });
  
  test('should show active filters summary', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'meeting');
    await page.selectOption('[data-testid="filter-priority"]', 'high');
    await page.waitForTimeout(350);
    
    const summary = page.locator('[data-testid="active-filters-summary"]');
    await expect(summary).toContainText('Search: "meeting"');
    await expect(summary).toContainText('Priority: high');
  });
  
  test('should clear all filters', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'meeting');
    await page.selectOption('[data-testid="filter-priority"]', 'high');
    await page.waitForTimeout(350);
    
    await page.click('[data-testid="clear-filters"]');
    
    // All todos should be visible again
    await expect(page.locator('text=Meeting with team')).toBeVisible();
    await expect(page.locator('text=Write report')).toBeVisible();
    await expect(page.locator('text=Meeting notes')).toBeVisible();
  });
  
  test('should show empty state for no matches', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'nonexistent');
    await page.waitForTimeout(350);
    
    await expect(page.locator('[data-testid="no-results"]')).toBeVisible();
    await expect(page.locator('text=No todos match your filters')).toBeVisible();
  });
  
  test('should clear search with X button', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'meeting');
    await page.click('[data-testid="clear-search"]');
    
    const searchInput = page.locator('[data-testid="search-input"]');
    await expect(searchInput).toHaveValue('');
  });
});
```

### Unit Tests

```typescript
// tests/filtering.test.ts
import { applyFilters } from '@/lib/utils';
import { Todo, Tag } from '@/lib/db';

describe('Filtering Logic', () => {
  const todos: Todo[] = [
    { id: 1, title: 'Meeting with team', priority: 'high', completed: false } as Todo,
    { id: 2, title: 'Write report', priority: 'medium', completed: false } as Todo,
    { id: 3, title: 'Team building', priority: 'low', completed: true } as Todo,
  ];
  
  const tags: Tag[] = [];
  
  describe('Search filter', () => {
    it('should filter by search text', () => {
      const filtered = applyFilters(todos, { searchText: 'meeting', priority: null, tagId: null, status: 'all' }, tags);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Meeting with team');
    });
    
    it('should be case-insensitive', () => {
      const filtered = applyFilters(todos, { searchText: 'MEETING', priority: null, tagId: null, status: 'all' }, tags);
      expect(filtered).toHaveLength(1);
    });
    
    it('should match partial strings', () => {
      const filtered = applyFilters(todos, { searchText: 'team', priority: null, tagId: null, status: 'all' }, tags);
      expect(filtered).toHaveLength(2); // "Meeting with team" and "Team building"
    });
  });
  
  describe('Priority filter', () => {
    it('should filter by priority', () => {
      const filtered = applyFilters(todos, { searchText: '', priority: 'high', tagId: null, status: 'all' }, tags);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].priority).toBe('high');
    });
  });
  
  describe('Status filter', () => {
    it('should filter active todos', () => {
      const filtered = applyFilters(todos, { searchText: '', priority: null, tagId: null, status: 'active' }, tags);
      expect(filtered).toHaveLength(2);
      expect(filtered.every(t => !t.completed)).toBe(true);
    });
    
    it('should filter completed todos', () => {
      const filtered = applyFilters(todos, { searchText: '', priority: null, tagId: null, status: 'completed' }, tags);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].completed).toBe(true);
    });
  });
  
  describe('Combined filters', () => {
    it('should combine search and priority', () => {
      const filtered = applyFilters(todos, { 
        searchText: 'team', 
        priority: 'high', 
        tagId: null, 
        status: 'all' 
      }, tags);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Meeting with team');
    });
    
    it('should combine all filters', () => {
      const filtered = applyFilters(todos, { 
        searchText: 'team', 
        priority: 'low', 
        tagId: null, 
        status: 'completed' 
      }, tags);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Team building');
    });
  });
});
```

## Out of Scope

- Server-side search/filtering (all client-side for now)
- Full-text search across todo descriptions
- Advanced query syntax
- Search history/autocomplete
- Fuzzy search (typo tolerance)
- Search by date ranges
- Saved filter presets
- Filter by subtask content
- Export filtered results

## Success Metrics

### Functional Metrics
- ✅ Search finds all matching todos
- ✅ Filters combine correctly with AND logic
- ✅ Clear filters restores full list
- ✅ No false positives in search results

### Technical Metrics
- ✅ Search debounce prevents excessive re-renders
- ✅ Filter operations complete in < 50ms for 1000 todos
- ✅ No memory leaks from debounce timers
- ✅ All E2E tests passing

### User Experience Metrics
- ✅ Search feels instant (< 300ms response)
- ✅ Clear visual feedback for active filters
- ✅ Empty state is informative
- ✅ Results counter helps orientation

## Implementation Checklist

- [ ] useDebounce hook for search input
- [ ] applyFilters utility function
- [ ] SearchBar component with clear button
- [ ] FilterBar component with all filter dropdowns
- [ ] Active filters summary display
- [ ] Clear All Filters button
- [ ] ResultsCounter component
- [ ] EmptyState component with context-aware messages
- [ ] Integration in main page
- [ ] Click tag badge to set filter
- [ ] E2E tests for all filter types
- [ ] E2E tests for combined filters
- [ ] Unit tests for filter logic
- [ ] Performance optimization with useMemo

---

**Last Updated**: February 6, 2026
**Feature Status**: Phase 3 - Organization Feature
**Dependencies**: Feature 01 (CRUD), Feature 02 (Priority), Feature 06 (Tags)
