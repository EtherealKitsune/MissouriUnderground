import { useCallback, useEffect, useRef, useState } from 'react';

interface PanelResizeHandleProps {
  side: 'left' | 'right';
  onDrag: (deltaX: number) => void;
  onCommit: () => void;
}

export function PanelResizeHandle({ side, onDrag, onCommit }: PanelResizeHandleProps) {
  const [active, setActive] = useState(false);
  const draggingRef = useRef(false);

  const stopDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setActive(false);
    onCommit();
  }, [onCommit]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      onDrag(event.movementX);
    };
    const onPointerUp = () => stopDrag();

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onDrag, stopDrag]);

  return (
    <div
      className={`panel-resize-handle panel-resize-${side}${active ? ' dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Resize archive index' : 'Resize dossier panel'}
      onPointerDown={(event) => {
        event.preventDefault();
        draggingRef.current = true;
        setActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onLostPointerCapture={stopDrag}
    />
  );
}
