'use client';

import { useState, useEffect } from 'react';
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';

interface Subtask {
  id: number;
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

interface TimeBlock {
  id: number;
  title: string;
  startTime: string;
  endTime: string;
  duration: number; // minutes
  color: string;
}

interface RightPanelProps {
  selectedTask: Todo | null;
  onClose: () => void;
  onUpdate: () => void;
}

export function RightPanel({ selectedTask, onClose, onUpdate }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<'detail' | 'timeline'>('detail');
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [currentTime, setCurrentTime] = useState(getSingaporeNow());

  useEffect(() => {
    // Update current time every minute
    const interval = setInterval(() => {
      setCurrentTime(getSingaporeNow());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'timeline') {
      fetchTimeBlocks();
    }
  }, [activeTab]);

  const fetchTimeBlocks = async () => {
    try {
      const response = await fetch('/api/todos');
      if (response.ok) {
        const todos = await response.json();
        const today = getSingaporeNow().toISODate()!;
        
        // Convert todos with time to time blocks
        const blocks: TimeBlock[] = todos
          .filter((t: Todo) => t.due_date && t.due_date.includes('T'))
          .map((t: Todo) => {
            const dueDate = new Date(t.due_date!);
            const startTime = `${dueDate.getHours().toString().padStart(2, '0')}:${dueDate.getMinutes().toString().padStart(2, '0')}`;
            const endTime = calculateEndTime(startTime, 60); // Default 1 hour
            return {
              id: t.id,
              title: t.title,
              startTime,
              endTime,
              duration: 60,
              color: getPriorityColor(t.priority),
            };
          });
        
        setTimeBlocks(blocks);
      }
    } catch (error) {
      console.error('Error fetching time blocks:', error);
    }
  };

  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'high':
        return '#EF4444';
      case 'medium':
        return '#F59E0B';
      case 'low':
        return '#10B981';
      default:
        return '#3B82F6';
    }
  };

  const getCurrentTimePosition = (): number => {
    const hours = currentTime.hour;
    const minutes = currentTime.minute;
    return (hours * 60 + minutes) / (24 * 60) * 100;
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('detail')}
          className={`flex-1 px-4 py-3 text-sm font-medium ${
            activeTab === 'detail'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Task Detail
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex-1 px-4 py-3 text-sm font-medium ${
            activeTab === 'timeline'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Timeline
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'detail' ? (
          <TaskDetailView
            task={selectedTask}
            onClose={onClose}
            onUpdate={onUpdate}
          />
        ) : (
          <TimelineView
            timeBlocks={timeBlocks}
            currentTime={currentTime}
            getCurrentTimePosition={getCurrentTimePosition}
          />
        )}
      </div>
    </div>
  );
}

function TaskDetailView({
  task,
  onClose,
  onUpdate,
}: {
  task: Todo | null;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<number | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [showListSelector, setShowListSelector] = useState(false);

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDueDate(task.due_date || '');
      setPriority(task.priority);
      fetchSubtasks();
    }
  }, [task]);

  // Close list selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showListSelector && !target.closest('.list-selector-container')) {
        setShowListSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showListSelector]);

  const fetchTags = async () => {
    try {
      const response = await fetch('/api/tags');
      if (response.ok) {
        const data = await response.json();
        console.log('Available tags:', data);
        setAvailableTags(data);
      } else {
        console.error('Failed to fetch tags:', response.status);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const toggleTag = async (tagId: number) => {
    if (!task) return;
    const hasTag = task.tags.some(t => t.id === tagId);
    try {
      const response = await fetch(`/api/todos/${task.id}/tags`, {
        method: hasTag ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId }),
      });
      if (response.ok) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error toggling tag:', error);
    }
  };

  const getTagIcon = (tagName: string): string => {
    const icons: Record<string, string> = {
      'Work': '💼',
      'Workout': '⚡',
      'Learning': '🎓',
      'Reading': '📖',
    };
    return icons[tagName] || '🏷️';
  };

  const fetchSubtasks = async () => {
    if (!task) return;
    try {
      const response = await fetch(`/api/todos/${task.id}/subtasks`);
      if (response.ok) {
        const data = await response.json();
        setSubtasks(data);
      }
    } catch (error) {
      console.error('Error fetching subtasks:', error);
    }
  };

  const updateTask = async (updates: Partial<Todo>) => {
    if (!task) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/todos/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        onUpdate();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error updating task:', response.status, errorData);
        alert(`Failed to save: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Failed to save. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTask = async () => {
    if (!task || !confirm('Delete this task?')) return;
    try {
      const response = await fetch(`/api/todos/${task.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        onClose();
        onUpdate();
      }
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const addSubtask = async () => {
    if (!task || !newSubtaskTitle.trim()) return;
    try {
      const response = await fetch(`/api/todos/${task.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSubtaskTitle, position: subtasks.length }),
      });
      if (response.ok) {
        setNewSubtaskTitle('');
        await fetchSubtasks();
        onUpdate();
      }
    } catch (error) {
      console.error('Error adding subtask:', error);
    }
  };

  const toggleSubtask = async (subtaskId: number, completed: boolean) => {
    if (!task) return;
    try {
      const response = await fetch(`/api/todos/${task.id}/subtasks/${subtaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      });
      if (response.ok) {
        await fetchSubtasks();
        onUpdate();
      }
    } catch (error) {
      console.error('Error toggling subtask:', error);
    }
  };

  const updateSubtask = async (subtaskId: number, title: string) => {
    if (!task || !title.trim()) return;
    try {
      const response = await fetch(`/api/todos/${task.id}/subtasks/${subtaskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (response.ok) {
        await fetchSubtasks();
        setEditingSubtaskId(null);
        onUpdate();
      }
    } catch (error) {
      console.error('Error updating subtask:', error);
    }
  };

  const deleteSubtask = async (subtaskId: number) => {
    if (!task || !confirm('Delete this subtask?')) return;
    try {
      const response = await fetch(`/api/todos/${task.id}/subtasks/${subtaskId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await fetchSubtasks();
        onUpdate();
      }
    } catch (error) {
      console.error('Error deleting subtask:', error);
    }
  };

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
        <p className="text-lg font-medium">Select a task</p>
        <p className="text-sm text-center mt-2">
          Click on a task from the list to view and edit its details
        </p>
      </div>
    );
  }

  return (
    <div className="h-full bg-white p-6">
      {/* Main Content Card */}
      <div className="bg-[#ECECEC] rounded-3xl p-8 mb-6 overflow-visible">
        {/* Title - Editable */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => updateTask({ title })}
          className="w-full text-[20px] font-medium text-black mb-3 bg-transparent border-none focus:outline-none focus:ring-0 p-0 leading-tight"
          placeholder="Task title"
        />

        {/* Description - Editable */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== task.description) {
              updateTask({ description });
            }
          }}
          placeholder="Add a description..."
          rows={3}
          className="w-full text-[14px] text-[#666666] leading-relaxed mb-5 bg-transparent border-none focus:outline-none focus:ring-0 p-0 resize-none"
        />

        {/* Divider */}
        <div className="border-t border-[#D0D0D0] my-5"></div>

        {/* List Section */}
        <div className="mb-5 relative list-selector-container">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[15px] font-normal text-black">List</h3>
            <button
              onClick={() => {
                console.log('Toggle list selector, current state:', showListSelector);
                console.log('Available tags count:', availableTags.length);
                setShowListSelector(!showListSelector);
              }}
              className="w-6 h-6 rounded-full bg-white hover:bg-gray-100 flex items-center justify-center text-[#666666] text-lg transition-colors"
              title="Add list"
            >
              +
            </button>
          </div>

          {/* Selected Lists */}
          <div className="flex flex-wrap gap-2">
            {task.tags.filter(tag => ['Work', 'Workout', 'Learning', 'Reading'].includes(tag.name)).map((tag) => (
              <div
                key={tag.id}
                className="group flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg text-[14px] text-[#666666]"
              >
                <span className="text-base">{getTagIcon(tag.name)}</span>
                <span>{tag.name}</span>
                <button
                  onClick={() => toggleTag(tag.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#999999] hover:text-red-600"
                  title="Remove list"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {task.tags.filter(tag => ['Work', 'Workout', 'Learning', 'Reading'].includes(tag.name)).length === 0 && (
              <p className="text-[14px] text-[#999999]">No list assigned</p>
            )}
          </div>

          {/* List Selector Dropdown */}
          {showListSelector ? (
            <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-300 p-2 z-50 w-48 max-h-60 overflow-y-auto">
              {availableTags.filter(tag => ['Work', 'Workout', 'Learning', 'Reading'].includes(tag.name)).length > 0 ? (
                availableTags.filter(tag => ['Work', 'Workout', 'Learning', 'Reading'].includes(tag.name)).map((tag) => {
                  const isSelected = task.tags.some(t => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => {
                        toggleTag(tag.id);
                        setShowListSelector(false);
                      }}
                      disabled={isSelected}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[14px] transition-colors ${
                        isSelected
                          ? 'text-[#999999] bg-gray-50 cursor-not-allowed'
                          : 'text-[#666666] hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-base">{getTagIcon(tag.name)}</span>
                      <span>{tag.name}</span>
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-[14px] text-[#999999]">No lists available</div>
              )}
            </div>
          ) : null}
        </div>

        {/* Due Date - Editable */}
        <div className="mb-5">
          <h3 className="text-[15px] font-normal text-black mb-2">Due Date</h3>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              updateTask({ due_date: e.target.value || null });
            }}
            className="w-full bg-white px-3 py-2 border border-[#D0D0D0] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-[14px] text-[#666666]"
          />
        </div>

        {/* Priority - Editable */}
        <div className="mb-5">
          <h3 className="text-[15px] font-normal text-black mb-2">Priority</h3>
          <div className="flex gap-2 w-full">
            {(['high', 'medium', 'low'] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPriority(p);
                  updateTask({ priority: p });
                }}
                className={`flex-1 py-2 rounded-lg text-[14px] font-normal transition-all text-[#666666] ${
                  priority === p
                    ? p === 'high'
                      ? 'bg-white ring-2 ring-red-500'
                      : p === 'medium'
                      ? 'bg-white ring-2 ring-[#D4A514]'
                      : 'bg-white ring-2 ring-green-500'
                    : 'bg-white hover:bg-gray-50'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Created & Modified */}
        <div className="text-[13px] text-[#999999] space-y-1">
          <p>Created: {task.created_at ? formatSingaporeDate(task.created_at.replace(' ', 'T'), 'MMM d, yyyy HH:mm') : 'Unknown'}</p>
          <p>Modified: {task.updated_at ? formatSingaporeDate(task.updated_at.replace(' ', 'T'), 'MMM d, yyyy HH:mm') : 'Unknown'}</p>
        </div>
      </div>

      {/* Editable Sections Below */}
      <div className="mt-6 space-y-4">
        {/* Subtasks */}
        <div>
          <label className="block text-[15px] font-normal text-black mb-2">Subtasks</label>
        <div className="space-y-2">
          {subtasks.map((subtask) => (
            <div key={subtask.id} className="flex items-center space-x-2 group">
              <button
                onClick={() => toggleSubtask(subtask.id, subtask.completed)}
                className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                  subtask.completed
                    ? 'bg-blue-500 border-blue-500'
                    : 'border-gray-300 hover:border-blue-500'
                }`}
                aria-label={subtask.completed ? 'Mark subtask as incomplete' : 'Mark subtask as complete'}
              >
                {subtask.completed ? (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : null}
              </button>
              {editingSubtaskId === subtask.id ? (
                <input
                  type="text"
                  value={editingSubtaskTitle}
                  onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                  onBlur={() => updateSubtask(subtask.id, editingSubtaskTitle)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateSubtask(subtask.id, editingSubtaskTitle);
                    } else if (e.key === 'Escape') {
                      setEditingSubtaskId(null);
                    }
                  }}
                  autoFocus
                  className="flex-1 text-sm px-2 py-1 border border-blue-500 rounded focus:outline-none"
                />
              ) : (
                <span
                  onClick={() => {
                    setEditingSubtaskId(subtask.id);
                    setEditingSubtaskTitle(subtask.title);
                  }}
                  className={`flex-1 text-[14px] cursor-pointer ${
                    subtask.completed ? 'line-through text-[#999999]' : 'text-[#1A1A1A]'
                  }`}
                >
                  {subtask.title}
                </span>
              )}
              <button
                onClick={() => deleteSubtask(subtask.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-red-600 hover:bg-red-50 rounded transition-opacity"
                title="Delete subtask"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addSubtask();
            }}
            className="flex items-center space-x-2 mt-2"
          >
            <button type="submit" className="w-4 h-4 rounded border-2 border-gray-300 flex-shrink-0" />
            <input
              type="text"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              placeholder="Add subtask"
              className="flex-1 text-[14px] text-[#666666] focus:outline-none placeholder-[#999999]"
            />
          </form>
        </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            onClick={() => updateTask({ completed: !task.completed })}
            className={`flex-1 py-3 rounded-lg font-medium text-[14px] transition-colors ${
              task.completed
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {task.completed ? 'Mark Undone' : 'Mark Done'}
          </button>
          <button
            onClick={deleteTask}
            className="flex-1 py-3 bg-red-100 text-red-700 rounded-lg font-medium text-[14px] hover:bg-red-200 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelineView({
  timeBlocks,
  currentTime,
  getCurrentTimePosition,
}: {
  timeBlocks: TimeBlock[];
  currentTime: any;
  getCurrentTimePosition: () => number;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="relative">
      {/* Current Time Indicator */}
      <div
        className="absolute left-0 right-0 h-0.5 bg-red-500 z-10"
        style={{ top: `${getCurrentTimePosition()}%` }}
      >
        <div className="absolute -left-2 -top-1 w-4 h-4 bg-red-500 rounded-full" />
        <span className="absolute -left-14 -top-2 text-xs font-medium text-red-500">
          {currentTime.hour.toString().padStart(2, '0')}:
          {currentTime.minute.toString().padStart(2, '0')}
        </span>
      </div>

      {/* Timeline Grid */}
      <div className="p-4">
        {hours.map((hour) => (
          <div key={hour} className="relative h-16 border-b border-gray-100">
            <span className="absolute -left-2 -top-2 text-xs text-gray-500 w-12 text-right">
              {hour.toString().padStart(2, '0')}:00
            </span>
            
            {/* Time Blocks for this hour */}
            {timeBlocks
              .filter((block) => {
                const blockHour = parseInt(block.startTime.split(':')[0]);
                return blockHour === hour;
              })
              .map((block) => (
                <div
                  key={block.id}
                  className="absolute left-14 right-4 rounded-lg px-3 py-1 text-white text-xs font-medium shadow-sm"
                  style={{
                    backgroundColor: block.color,
                    height: `${(block.duration / 60) * 4}rem`,
                    top: `${(parseInt(block.startTime.split(':')[1]) / 60) * 4}rem`,
                  }}
                >
                  {block.title}
                  <div className="text-xs opacity-75 mt-0.5">
                    {block.startTime} - {block.endTime}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
