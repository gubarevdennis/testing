import { create } from 'zustand';

/** Files still on their way to the server, per page: the save indicator must not say «Сохранено» meanwhile (R-MEDIA-006). */
export const useUploadState = create<{ active: Record<string, number> }>(() => ({ active: {} }));
