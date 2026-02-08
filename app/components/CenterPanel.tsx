'use client';

import { useState, useEffect } from 'react';
import { getSingaporeNow, formatSingaporeDate, parseToSingapore } from '@/lib/timezone';

interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface Todo {
  id: number;
  list_id: number | null;
  title: string;
  description?: string | null;
  completed: boolean;
  due_date: string | null;
  priority: 'high' | 'medium' | 'low';
  is_recurring: boolean;
  recurrence_pattern: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  reminder_minutes: number | null;
  subtasks: Subtask[];
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

interface TaskGroup {
  title: string;
  date: string | null;
  todos: Todo[];
  expanded: boolean;
}

interface CenterPanelProps {
  activeView: string;
  onTaskSelect: (todo: Todo | null) => void;
  selectedTaskId: number | null;
}

export function CenterPanel({ activeView, onTaskSelect, selectedTaskId }: CenterPanelProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [viewTitle, setViewTitle] = useState('Today');
  const [hideCompleted, setHideCompleted] = useState(false);

  useEffect(() => {
    fetchTodos();
    updateViewTitle();
  }, [activeView]);

  useEffect(() => {
    groupTodos();
  }, [todos, activeView]);

  const updateViewTitle = () => {
    const viewTitles: Record<string, string> = {
      today: 'Today',
      next7days: 'Next 7 Days',
      inbox: 'Inbox',
      thisweek: 'This Week',
      unscheduled: 'Unscheduled',
      completed: 'Completed',
    };
    setViewTitle(viewTitles[activeView] || 'Tasks');
  };

  const fetchTodos = async () => {
    try {
      const response = await fetch('/api/todos');
      if (response.ok) {
        const data = await response.json();
        setTodos(filterTodosByView(data));
      }
    } catch (error) {
      console.error('Error fetching todos:', error);
    }
  };

  const filterTodosByView = (allTodos: Todo[]): Todo[] => {
    const now = getSingaporeNow();
    const today = now.toISODate()!;
    const next7Days = now.plus({ days: 7 });
    const next7DaysStr = next7Days.toISODate()!;

    switch (activeView) {
      case 'today':
        return allTodos.filter((t) => t.due_date === today);
      case 'next7days':
        return allTodos.filter(
          (t) => t.due_date && t.due_date >= today && t.due_date <= next7DaysStr
        );
      case 'inbox':
        return allTodos.filter((t) => !t.list_id);
      case 'thisweek':
        const weekStart = now.startOf('week');
        const weekEnd = now.endOf('week');
        return allTodos.filter(
          (t) =>
            t.due_date &&
            t.due_date >= weekStart.toISODate()! &&
            t.due_date <= weekEnd.toISODate()!
        );
      case 'unscheduled':
        return allTodos.filter((t) => !t.due_date);
      case 'completed':
        return allTodos.filter((t) => t.completed);
      default:
        if (activeView.startsWith('list-')) {
          const listId = parseInt(activeView.replace('list-', ''));
          return allTodos.filter((t) => t.list_id === listId);
        }
        return allTodos;
    }
  };

  const groupTodos = () => {
    const now = getSingaporeNow();
    const today = now.toISODate()!;
    const tomorrow = now.plus({ days: 1 });
    const tomorrowStr = tomorrow.toISODate()!;
    const next7Days = now.plus({ days: 7 }).toISODate()!;

    const grouped: TaskGroup[] = [];

    // Separate incomplete and completed todos
    const incompleteTodos = todos.filter(t => !t.completed);
    const completedTodos = todos.filter(t => t.completed);

    // Group incomplete todos by date
    const todosByDate: Record<string, Todo[]> = {};
    incompleteTodos.forEach((todo) => {
      const date = todo.due_date ? todo.due_date.split('T')[0] : 'no-date';
      if (!todosByDate[date]) {
        todosByDate[date] = [];
      }
      todosByDate[date].push(todo);
    });

    // Create groups for incomplete todos with proper titles
    Object.entries(todosByDate)
      .sort(([a], [b]) => {
        if (a === 'no-date') return 1;
        if (b === 'no-date') return -1;
        return a.localeCompare(b);
      })
      .forEach(([date, groupTodos]) => {
        let title = '';
        if (date === 'no-date') {
          title = 'No Due Date';
        } else if (date === today) {
          title = 'Today';
        } else if (date === tomorrowStr) {
          title = 'Tomorrow';
        } else if (date > tomorrowStr && date <= next7Days) {
          title = 'Next 7 Days';
        } else {
          title = formatSingaporeDate(date, 'MMM d');
        }

        grouped.push({
          title,
          date: date === 'no-date' ? null : date,
          todos: groupTodos,
          expanded: true,
        });
      });

    // Add completed group at the end if there are completed todos
    if (completedTodos.length > 0) {
      grouped.push({
        title: 'Completed',
        date: null,
        todos: completedTodos,
        expanded: true,
      });
    }

    setGroups(grouped);
  };

  const toggleGroup = (index: number) => {
    setGroups((prev) =>
      prev.map((group, i) =>
        i === index ? { ...group, expanded: !group.expanded } : group
      )
    );
  };

  const createTodo = async () => {
    if (!newTaskTitle.trim()) return;

    let dueDate: string | null = null;
    const now = getSingaporeNow();
    
    switch (activeView) {
      case 'today':
        dueDate = now.toISODate()!;
        break;
      case 'next7days':
      case 'thisweek':
        dueDate = now.toISODate()!;
        break;
    }

    try {
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          priority: 'medium',
          due_date: dueDate,
          list_id: activeView.startsWith('list-') 
            ? parseInt(activeView.replace('list-', '')) 
            : null,
        }),
      });

      if (response.ok) {
        setNewTaskTitle('');
        await fetchTodos();
      }
    } catch (error) {
      console.error('Error creating todo:', error);
    }
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !todo.completed }),
      });

      if (response.ok) {
        await fetchTodos();
      }
    } catch (error) {
      console.error('Error toggling todo:', error);
    }
  };

  const formatTaskTime = (todo: Todo): string | null => {
    if (!todo.due_date || !todo.due_date.includes('T')) return null;
    const dt = parseToSingapore(todo.due_date);
    return dt.toFormat('HH:mm');
  };

  const formatTaskDate = (todo: Todo): string | null => {
    if (!todo.due_date) return null;
    
    const now = getSingaporeNow();
    const today = now.toISODate()!;
    const todoDate = todo.due_date.split('T')[0];
    
    // If it's today and has time, don't show date
    if (todoDate === today && todo.due_date.includes('T')) {
      return null;
    }
    
    return formatSingaporeDate(todo.due_date, 'MMM d');
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header - 60px height */}
      <header className="h-[60px] border-b border-[#E5E5E5] flex items-center px-4">
        <button className="w-6 h-6 text-[#666666] hover:text-[#000000] mr-4">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-2xl font-semibold text-[#000000] flex-1">{viewTitle}</h1>
        <button 
          onClick={() => setHideCompleted(!hideCompleted)}
          className={`mr-4 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            hideCompleted 
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title={hideCompleted ? 'Show completed' : 'Hide completed'}
        >
          {hideCompleted ? 'Show' : 'Hide'} completed
        </button>
        <button className="w-5 h-5 text-[#666666] hover:text-[#000000] mr-4">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
        <button className="w-5 h-5 text-[#666666] hover:text-[#000000]">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </header>

      {/* Add Task Section - 56px height */}
      <div className="h-[56px] bg-[#F8F8F8] px-4 flex items-center mb-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createTodo();
          }}
          className="w-full"
        >
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="+ Add Task"
            className="w-full bg-transparent text-[15px] text-[#000000] placeholder-[#BBBBBB] focus:outline-none"
          />
        </form>
      </div>

      {/* Task Groups */}
      <div className="flex-1 overflow-y-auto">
        {groups
          .filter(group => !(hideCompleted && group.title === 'Completed'))
          .map((group, groupIndex) => (
          <div key={groupIndex} className="mb-4">
            {/* Group Header - 40px height */}
            <button
              onClick={() => toggleGroup(groupIndex)}
              className="h-[40px] w-full px-4 flex items-center hover:bg-[#FAFAFA] transition-colors duration-100"
            >
              <svg
                className={`w-4 h-4 text-[#666666] mr-2 transition-transform duration-200 ${
                  group.expanded ? '' : '-rotate-90'
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span className="text-[15px] font-semibold text-[#000000]">{group.title}</span>
              <span className="text-[15px] text-[#999999] ml-1">{group.todos.length}</span>
            </button>

            {/* Task Items */}
            {group.expanded && (
              <div>
                {group.todos.map((todo) => (
                  <div
                    key={todo.id}
                    onClick={() => onTaskSelect(todo)}
                    className={`min-h-[56px] px-4 py-3 flex items-center border-b border-[#F5F5F5] cursor-pointer transition-colors duration-100 ${
                      selectedTaskId === todo.id
                        ? 'bg-[#F0F0FF]'
                        : 'bg-white hover:bg-[#FAFAFA]'
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTodo(todo);
                      }}
                      className={`w-5 h-5 rounded border-[1.5px] flex-shrink-0 mr-3 flex items-center justify-center transition-all duration-150 ${
                        todo.completed
                          ? 'bg-[#5B7BFF] border-[#5B7BFF]'
                          : 'border-[#CCCCCC] hover:border-[#999999] bg-white'
                      }`}
                      aria-label={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
                    >
                      {todo.completed ? (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : null}
                    </button>

                    {/* Task Content */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      {/* Priority Indicator */}
                      <span
                        className={`w-1 h-4 rounded-full flex-shrink-0 ${
                          todo.priority === 'high'
                            ? 'bg-red-500'
                            : todo.priority === 'medium'
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        title={`Priority: ${todo.priority}`}
                      />
                      <p
                        className={`text-[15px] leading-5 ${
                          todo.completed
                            ? 'line-through text-[#999999] opacity-50'
                            : 'text-[#000000]'
                        }`}
                      >
                        {todo.title}
                      </p>
                    </div>

                    {/* Right Side - Icons and Time/Date */}
                    <div className="flex items-center gap-2 ml-4">
                      {/* Subtasks Icon */}
                      {todo.subtasks && todo.subtasks.length > 0 && (
                        <svg className="w-4 h-4 text-[#999999]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      )}

                      {/* Recurring Icon */}
                      {todo.is_recurring ? (
                        <svg className="w-4 h-4 text-[#999999]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      ) : null}

                      {/* Time Display (HH:MM for same day) */}
                      {formatTaskTime(todo) && (
                        <span className="text-[14px] text-[#5B7BFF]">
                          {formatTaskTime(todo)}
                        </span>
                      )}

                      {/* Date Display (for future tasks) */}
                      {formatTaskDate(todo) && (
                        <div className="flex items-center gap-1">
                          <svg className="w-[14px] h-[14px] text-[#5B7BFF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-[14px] text-[#5B7BFF]">
                            {formatTaskDate(todo)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Empty State */}
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-[#999999]">
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-[15px] font-medium">No tasks yet</p>
            <p className="text-[14px] text-center mt-2">
              Add a task using the input above
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
