import { create } from 'zustand';
import type { TranslationTask, AppSettings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/constants';

interface TranslationState {
  tasks: TranslationTask[];
  settings: AppSettings;
  isTranslating: boolean;

  addTask: (task: TranslationTask) => void;
  setTasks: (tasks: TranslationTask[]) => void;
  updateTask: (taskId: string, updates: Partial<TranslationTask>) => void;
  removeTask: (taskId: string) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setIsTranslating: (value: boolean) => void;
}

export const useTranslationStore = create<TranslationState>((set) => ({
  tasks: [],
  settings: { ...DEFAULT_SETTINGS },
  isTranslating: false,

  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)],
    })),

  setTasks: (tasks) => set({ tasks }),

  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, ...updates } : t
      ),
    })),

  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),

  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),

  setIsTranslating: (value) => set({ isTranslating: value }),
}));
