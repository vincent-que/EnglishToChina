import { useEffect, useCallback } from 'react';
import { useTranslationStore } from '../stores/translation-store';
import type { AppSettings, TranslationTask } from '../../shared/types';

const api = window.electronAPI;

export function useElectronApi() {
  const updateTask = useTranslationStore((s) => s.updateTask);
  const setTasks = useTranslationStore((s) => s.setTasks);
  const setSettings = useTranslationStore((s) => s.setSettings);

  useEffect(() => {
    if (!api) return;

    api.settings.get().then((settings) => {
      setSettings(settings as Partial<AppSettings>);
    }).catch(console.error);

    api.history.getList().then((tasks) => {
      setTasks(tasks as unknown as TranslationTask[]);
    }).catch(console.error);

    const unsubProgress = api.translation.onProgress((data) => {
      if (data.taskId) {
        updateTask(data.taskId, {
          progress: data.percent,
          status: data.stage as 'parsing' | 'translating' | 'rebuilding' | 'complete' | 'error',
        });
      }
    });

    const unsubComplete = api.translation.onComplete((data) => {
      updateTask(data.taskId, {
        status: 'complete',
        progress: 100,
        outputPath: data.outputPath,
        completedAt: Date.now(),
      });
    });

    const unsubError = api.translation.onError((data) => {
      updateTask(data.taskId, {
        status: 'error',
        error: {
          code: data.code,
          message: data.message,
          recoverable: true,
        },
      });
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, [updateTask, setTasks, setSettings]);

  const selectFiles = useCallback(async () => {
    if (!api) return { canceled: true, filePaths: [] };
    return api.file.select();
  }, []);

  const startTranslation = useCallback(
    async (filePath: string, style: string, outputFormat: string, termTables: string[] = [], taskId?: string) => {
      if (!api) return { taskId: `mock_${Date.now()}` };
      return api.translation.start({
        taskId,
        filePath,
        style,
        termTables,
        outputFormat,
      });
    },
    []
  );

  const openFile = useCallback(async (filePath: string) => {
    if (!api) return;
    api.file.open(filePath);
  }, []);

  const openOutputDir = useCallback(async () => {
    if (!api) return;
    api.file.openOutputDir();
  }, []);

  const deleteHistoryTask = useCallback(async (taskId: string) => {
    if (!api) return [];
    const tasks = await api.history.delete(taskId);
    setTasks(tasks as unknown as TranslationTask[]);
    return tasks;
  }, [setTasks]);

  const clearHistory = useCallback(async () => {
    if (!api) return [];
    const tasks = await api.history.clear();
    setTasks(tasks as unknown as TranslationTask[]);
    return tasks;
  }, [setTasks]);

  return {
    selectFiles,
    startTranslation,
    openFile,
    openOutputDir,
    deleteHistoryTask,
    clearHistory,
    isElectron: !!api,
  };
}
