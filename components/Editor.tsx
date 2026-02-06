import React, { useRef, useEffect, useState, MouseEvent } from 'react';
import { BoundingBox, Point } from '../types';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface EditorProps {
  imageSrc: string;
  slices: BoundingBox[];
  onSlicesChange: (slices: BoundingBox[]) => void;
  selectedSliceId: string | null;
  onSelectSlice: (id: string | null) => void;
  onLoadImage: (width: number, height: number) => void;
}

type DragMode = 'create' | 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'resize-n' | 'resize-s' | 'resize-w' | 'resize-e';

interface DragState {
  mode: DragMode;
  startX: number; // Normalized 0-1
  startY: number; // Normalized 0-1
  activeSliceId?: string;
  initialSlice?: BoundingBox; // Snapshot of slice before drag
}

export const Editor: React.FC<EditorProps> = ({
  imageSrc,
  slices,
  onSlicesChange,
  selectedSliceId,
  onSelectSlice,
  onLoadImage
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<Point | null>(null);
  // Dimensions for magnifier calculations
  const [imgDim, setImgDim] = useState({ w: 0, h: 0 });

  // Helper: Get mouse position relative to the IMAGE (0-1)
  const getNormalizedPoint = (e: MouseEvent): Point | null => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();

    // Check if mouse is roughly inside image bounds (allow slight overflow for handles)
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    return { x, y };
  };

  const handleImageLoad = () => {
    if (imgRef.current) {
      const w = imgRef.current.naturalWidth;
      const h = imgRef.current.naturalHeight;
      setImgDim({ w, h });
      onLoadImage(w, h);
    }
  }

  const handleMouseDown = (e: MouseEvent, sliceId?: string, mode: DragMode = 'create') => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection or native drag

    // Middle click or Spacebar panning could be implemented here if needed

    const point = getNormalizedPoint(e);
    if (!point) return;

    if (sliceId) {
      // Manipulating existing slice
      onSelectSlice(sliceId);
      const slice = slices.find(s => s.id === sliceId);
      if (slice) {
        setDragState({
          mode,
          startX: point.x,
          startY: point.y,
          activeSliceId: sliceId,
          initialSlice: { ...slice }
        });
      }
    } else {
      // Deselect and start creating
      onSelectSlice(null);
      setDragState({
        mode: 'create',
        startX: point.x,
        startY: point.y
      });
      setCurrentMousePos(point);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const point = getNormalizedPoint(e);
    if (!point) return;

    setCurrentMousePos(point);

    if (!dragState) return;

    // Creation Logic
    if (dragState.mode === 'create') {
      return;
    }

    // Move/Resize Logic
    if (dragState.activeSliceId && dragState.initialSlice) {
      const dx = point.x - dragState.startX;
      const dy = point.y - dragState.startY;
      const init = dragState.initialSlice;

      let newX = init.x;
      let newY = init.y;
      let newW = init.width;
      let newH = init.height;

      switch (dragState.mode) {
        case 'move':
          newX = init.x + dx;
          newY = init.y + dy;
          break;
        case 'resize-se':
          newW = init.width + dx;
          newH = init.height + dy;
          break;
        case 'resize-sw':
          newX = init.x + dx;
          newW = init.width - dx;
          newH = init.height + dy;
          break;
        case 'resize-ne':
          newY = init.y + dy;
          newW = init.width + dx;
          newH = init.height - dy;
          break;
        case 'resize-nw':
          newX = init.x + dx;
          newY = init.y + dy;
          newW = init.width - dx;
          newH = init.height - dy;
          break;
        case 'resize-n':
          newY = init.y + dy;
          newH = init.height - dy;
          break;
        case 'resize-s':
          newH = init.height + dy;
          break;
        case 'resize-w':
          newX = init.x + dx;
          newW = init.width - dx;
          break;
        case 'resize-e':
          newW = init.width + dx;
          break;
      }

      // Normalize (no negative dims)
      if (newW < 0) { newX += newW; newW = Math.abs(newW); }
      if (newH < 0) { newY += newH; newH = Math.abs(newH); }

      const updatedSlices = slices.map(s =>
        s.id === dragState.activeSliceId
          ? { ...s, x: newX, y: newY, width: newW, height: newH }
          : s
      );
      onSlicesChange(updatedSlices);
    }
  };

  const handleMouseUp = () => {
    if (dragState?.mode === 'create' && currentMousePos) {
      const x = Math.min(dragState.startX, currentMousePos.x);
      const y = Math.min(dragState.startY, currentMousePos.y);
      const width = Math.abs(currentMousePos.x - dragState.startX);
      const height = Math.abs(currentMousePos.y - dragState.startY);

      // Minimum size threshold to prevent accidental clicks creating tiny boxes
      if (width > 0.01 && height > 0.01) {
        const newSlice: BoundingBox = {
          id: `manual-${Date.now()}`,
          x, y, width, height,
        };
        onSlicesChange([...slices, newSlice]);
        onSelectSlice(newSlice.id);
      }
    }

    setDragState(null);
    setCurrentMousePos(null);
  };

  const handleDelete = () => {
    if (selectedSliceId) {
      onSlicesChange(slices.filter(s => s.id !== selectedSliceId));
      onSelectSlice(null);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedSliceId) {
      handleDelete();
    }
  }

  // --- Components for Handles ---
  const Handle = ({ cursor, mode, top, left, bottom, right }: any) => (
    <div
      className={`absolute w-3.5 h-3.5 bg-white border border-primary rounded-full z-30 shadow-sm hover:scale-125 transition-transform hover:bg-blue-50`}
      style={{ cursor, top, left, bottom, right, margin: '-7px' }} // Center handle
      onMouseDown={(e) => handleMouseDown(e, selectedSliceId!, mode)}
    />
  );

  // --- Magnifier Renderer ---
  const Magnifier = () => {
    if (!currentMousePos || !dragState || !imgRef.current) return null;

    const ZOOM_LEVEL = 4.0; // Increased for pixel-level detail
    const SIZE = 160;   // Slightly larger view

    const imgW = imgRef.current.clientWidth;
    const imgH = imgRef.current.clientHeight;

    // Clamp mouse pos for display
    const xPct = Math.max(0, Math.min(1, currentMousePos.x));
    const yPct = Math.max(0, Math.min(1, currentMousePos.y));

    const bgPosX = (xPct * imgW * ZOOM_LEVEL) - (SIZE / 2);
    const bgPosY = (yPct * imgH * ZOOM_LEVEL) - (SIZE / 2);

    return (
      <div
        className="fixed z-50 rounded-full border-[3px] border-white shadow-[0_4px_20px_rgba(0,0,0,0.25)] pointer-events-none overflow-hidden bg-white ring-2 ring-slate-900/10"
        style={{
          width: SIZE,
          height: SIZE,
          left: imgRef.current.getBoundingClientRect().left + (xPct * imgW) + 24, // Offset from cursor
          top: imgRef.current.getBoundingClientRect().top + (yPct * imgH) + 24,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundImage: `url(${imageSrc})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${imgW * ZOOM_LEVEL}px ${imgH * ZOOM_LEVEL}px`,
            backgroundPosition: `-${bgPosX}px -${bgPosY}px`,
            imageRendering: 'pixelated'
          }}
        />

        {/* Overlay Slices for Alignment */}
        {slices.map(slice => {
          const isSel = slice.id === selectedSliceId;
          const sx = (slice.x * imgW * ZOOM_LEVEL) - bgPosX;
          const sy = (slice.y * imgH * ZOOM_LEVEL) - bgPosY;
          const sw = slice.width * imgW * ZOOM_LEVEL;
          const sh = slice.height * imgH * ZOOM_LEVEL;

          if (sx + sw < 0 || sy + sh < 0 || sx > SIZE || sy > SIZE) return null;

          return (
            <div
              key={`mag-${slice.id}`}
              className={`absolute pointer-events-none ${isSel ? 'border-primary z-10' : 'border-white/60'
                }`}
              style={{
                left: sx, top: sy, width: sw, height: sh,
                borderWidth: '1px',
                opacity: isSel ? 1 : 0.6,
                borderColor: isSel ? undefined : 'white'
              }}
            />
          );
        })}

        {/* Pro Precision Crosshair */}
        {/* 1. Outer Ring */}
        <div className="absolute top-1/2 left-1/2 -mt-4 -ml-4 w-8 h-8 border border-primary/30 rounded-full"></div>

        {/* 2. Crosshairs with gap */}
        <div className="absolute top-1/2 left-0 w-[calc(50%-4px)] h-[1px] bg-primary/80 shadow-[0_1px_2px_rgba(255,255,255,0.5)]"></div>
        <div className="absolute top-1/2 right-0 w-[calc(50%-4px)] h-[1px] bg-primary/80 shadow-[0_1px_2px_rgba(255,255,255,0.5)]"></div>
        <div className="absolute top-0 left-1/2 h-[calc(50%-4px)] w-[1px] bg-primary/80 shadow-[1px_0_2px_rgba(255,255,255,0.5)]"></div>
        <div className="absolute bottom-0 left-1/2 h-[calc(50%-4px)] w-[1px] bg-primary/80 shadow-[1px_0_2px_rgba(255,255,255,0.5)]"></div>

        {/* 3. Central Dot (The Pixel) */}
        <div className="absolute top-1/2 left-1/2 w-1 h-1 -mt-0.5 -ml-0.5 bg-red-500 rounded-full shadow-sm ring-1 ring-white/50"></div>
      </div>
    )
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center bg-slate-100 overflow-hidden select-none outline-none group relative bg-checkerboard"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Magnifier Overlay */}
      <Magnifier />

      <div
        ref={containerRef}
        className="relative shadow-2xl"
        onMouseDown={(e) => handleMouseDown(e)} // Create start
      >
        <img
          ref={imgRef}
          src={imageSrc}
          onLoad={handleImageLoad}
          alt="Workspace"
          className="block max-w-[85vw] max-h-[85vh] object-contain pointer-events-none"
          draggable={false}
        />

        {/* Existing Slices Overlay */}
        {slices.map((slice) => {
          const isSelected = slice.id === selectedSliceId;
          return (
            <div
              key={slice.id}
              className={`absolute box-border ${isSelected
                ? 'border-2 border-primary bg-primary/10 z-20'
                : 'border border-white/50 ring-1 ring-black/20 bg-white/10 hover:bg-primary/5 hover:border-primary/50 z-10'
                }`}
              style={{
                left: `${slice.x * 100}%`,
                top: `${slice.y * 100}%`,
                width: `${slice.width * 100}%`,
                height: `${slice.height * 100}%`,
                cursor: isSelected ? 'move' : 'pointer'
              }}
              onMouseDown={(e) => handleMouseDown(e, slice.id, 'move')}
            >
              {isSelected && (
                <>
                  {/* Corners */}
                  <Handle cursor="nw-resize" mode="resize-nw" top="0%" left="0%" />
                  <Handle cursor="ne-resize" mode="resize-ne" top="0%" right="0%" />
                  <Handle cursor="sw-resize" mode="resize-sw" bottom="0%" left="0%" />
                  <Handle cursor="se-resize" mode="resize-se" bottom="0%" right="0%" />

                  {/* Sides */}
                  <Handle cursor="n-resize" mode="resize-n" top="0%" left="50%" />
                  <Handle cursor="s-resize" mode="resize-s" bottom="0%" left="50%" />
                  <Handle cursor="w-resize" mode="resize-w" top="50%" left="0%" />
                  <Handle cursor="e-resize" mode="resize-e" top="50%" right="0%" />

                  {/* Quick Delete Button */}
                  <div
                    onMouseDown={(e) => { e.stopPropagation(); handleDelete(); }}
                    className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md z-40 transition-transform hover:scale-110"
                    title="Delete (Backspace)"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </div>
                </>
              )}

              {/* Info Tag */}
              {isSelected && (
                <div className="absolute -top-8 left-0 bg-primary text-white text-[10px] px-2 py-0.5 rounded shadow-sm font-bold whitespace-nowrap pointer-events-none">
                  #{slice.id.slice(-3)} • {Math.round(slice.width * (imgDim.w || 0))} x {Math.round(slice.height * (imgDim.h || 0))}px
                </div>
              )}
            </div>
          );
        })}

        {/* Drawing Preview */}
        {dragState?.mode === 'create' && currentMousePos && (
          <div
            className="absolute border-2 border-dashed border-indigo-500 bg-indigo-500/20 z-30 pointer-events-none"
            style={{
              left: `${Math.min(dragState.startX, currentMousePos.x) * 100}%`,
              top: `${Math.min(dragState.startY, currentMousePos.y) * 100}%`,
              width: `${Math.abs(currentMousePos.x - dragState.startX) * 100}%`,
              height: `${Math.abs(currentMousePos.y - dragState.startY) * 100}%`,
            }}
          >
            <div className="absolute top-0 right-0 -mt-6 bg-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded">
              Creating...
            </div>
          </div>
        )}
      </div>

      {/* Help Overlay */}
      <div className="absolute bottom-6 bg-white/80 backdrop-blur-md text-slate-600 px-4 py-2 rounded-full text-xs font-semibold shadow-sm border border-slate-200 pointer-events-none">
        点击选择 • 拖拽移动 • 调整边缘 • Delete 删除
      </div>
    </div>
  );
};