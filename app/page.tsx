'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ThreePanelLayout } from './components/ThreePanelLayout';
import { LeftNavigation } from './components/LeftNavigation';
import { CenterPanel } from './components/CenterPanel';
import { RightPanel } from './components/RightPanel';

interface User {
  id: number;
  username: string;
}

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

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('today');
  const [selectedTask, setSelectedTask] = useState<Todo | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    // Listen for keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // N or Ctrl+N: New task (handled by CenterPanel)
      // Esc: Close detail panel
      if (e.key === 'Escape') {
        setSelectedTask(null);
        setSelectedTaskId(null);
      }
      // Delete: Delete selected task (handled by RightPanel)
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data);
      } else {
        router.push('/login');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleViewChange = (viewId: string) => {
    setActiveView(viewId);
    setSelectedTask(null);
    setSelectedTaskId(null);
  };

  const handleTaskSelect = (todo: Todo | null) => {
    setSelectedTask(todo);
    setSelectedTaskId(todo?.id || null);
  };

  const handleTaskUpdate = () => {
    // Trigger refresh of center panel
    setRefreshKey((prev) => prev + 1);
    // Refresh selected task
    if (selectedTask) {
      fetchTask(selectedTask.id);
    }
  };

  const fetchTask = async (taskId: number) => {
    try {
      const response = await fetch(`/api/todos/${taskId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedTask(data);
      }
    } catch (error) {
      console.error('Error fetching task:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ThreePanelLayout
      leftPanel={
        <LeftNavigation
          user={user}
          onLogout={handleLogout}
          activeView={activeView}
          onViewChange={handleViewChange}
        />
      }
      centerPanel={
        <CenterPanel
          key={refreshKey}
          activeView={activeView}
          onTaskSelect={handleTaskSelect}
          selectedTaskId={selectedTaskId}
        />
      }
      rightPanel={
        <RightPanel
          selectedTask={selectedTask}
          onClose={() => {
            setSelectedTask(null);
            setSelectedTaskId(null);
          }}
          onUpdate={handleTaskUpdate}
        />
      }
    />
  );
}
