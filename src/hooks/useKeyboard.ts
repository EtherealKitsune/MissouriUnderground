import { useEffect } from 'react';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-hotkey-scope="form"]')) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export interface KeyboardActions {
  onPan?: (dx: number, dy: number) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onCreatePin?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onSearch?: () => void;
  onDeleteRequest?: () => void;
}

export function useKeyboard(actions: KeyboardActions, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    let ctrlQArmed = false;
    let ctrlQTimer: ReturnType<typeof setTimeout> | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        if (e.key === 'Escape') actions.onCancel?.();
        return;
      }

      const key = e.key.toLowerCase();

      if (e.ctrlKey && key === 'f') {
        e.preventDefault();
        actions.onSearch?.();
        return;
      }

      if (e.ctrlKey && key === 'e') {
        e.preventDefault();
        actions.onConfirm?.();
        return;
      }

      if (e.ctrlKey && key === 'q') {
        e.preventDefault();
        if (ctrlQArmed) {
          ctrlQArmed = false;
          if (ctrlQTimer) clearTimeout(ctrlQTimer);
          actions.onDeleteRequest?.();
        } else {
          ctrlQArmed = true;
          if (ctrlQTimer) clearTimeout(ctrlQTimer);
          ctrlQTimer = setTimeout(() => {
            ctrlQArmed = false;
          }, 1500);
        }
        return;
      }

      if (e.key === 'Escape') {
        actions.onCancel?.();
        return;
      }

      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
        actions.onCreatePin?.();
        return;
      }

      if (key === 'z' && !e.ctrlKey) {
        actions.onZoomOut?.();
        return;
      }
      if (key === 'x' && !e.ctrlKey) {
        actions.onZoomIn?.();
        return;
      }

      const step = e.shiftKey ? 120 : 60;
      if (key === 'w') {
        e.preventDefault();
        actions.onPan?.(0, -step);
      } else if (key === 's') {
        e.preventDefault();
        actions.onPan?.(0, step);
      } else if (key === 'a') {
        e.preventDefault();
        actions.onPan?.(-step, 0);
      } else if (key === 'd') {
        e.preventDefault();
        actions.onPan?.(step, 0);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (ctrlQTimer) clearTimeout(ctrlQTimer);
    };
  }, [actions, enabled]);
}
