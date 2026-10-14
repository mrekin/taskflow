'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

import { api } from '@/lib/api-utils';
import { Button } from '@/components/ui/button';

interface ImageViewerProps {
  blobId: string;
  alt: string;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const SCALE_STEP = 1.25;

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
}

/** Image preview: zoom (wheel + buttons), 90° rotation, pan by drag. Pure CSS transforms. */
export function ImageViewer({ blobId, alt }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  const dragState = useRef<DragState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const zoomBy = useCallback((factor: number) => {
    setScale((prev) => clampScale(prev * factor));
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Reset the view when another file is opened
  useEffect(() => {
    reset();
  }, [blobId, reset]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  // Wheel zoom via a native listener: React attaches onWheel passively, so preventDefault would be ignored
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? SCALE_STEP : 1 / SCALE_STEP);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  // Pan via native listeners, like the wheel handler above: the overlay stops
  // pointerdown propagation for Radix, so React's delegated handlers never see it
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onPointerDown = (e: PointerEvent) => {
      dragState.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        baseX: offsetRef.current.x,
        baseY: offsetRef.current.y,
      };
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragState.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      setOffset({ x: drag.baseX + e.clientX - drag.startX, y: drag.baseY + e.clientY - drag.startY });
    };
    const onPointerUp = (e: PointerEvent) => {
      if (dragState.current?.pointerId !== e.pointerId) return;
      dragState.current = null;
    };
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={containerRef}
        className="absolute inset-0 flex cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing"
      >
        <img
          src={api(`/api/attachments/file/${blobId}?disposition=inline`)}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)` }}
        />
      </div>

      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md border bg-background/95 p-1 shadow-md">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomBy(1 / SCALE_STEP)} title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomBy(SCALE_STEP)} title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRotation((prev) => (prev + 90) % 360)} title="Rotate 90°">
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={reset} title="Reset">
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
