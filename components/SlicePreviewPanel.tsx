import React, { useState, useEffect, useRef } from 'react';
import { BoundingBox } from '../types';
import { EyeIcon, EyeSlashIcon, XMarkIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline';

interface SlicePreviewPanelProps {
    imageUrl: string;
    slices: BoundingBox[];
    originalWidth: number;
    originalHeight: number;
    onSliceSelect?: (id: string) => void;
    selectedSliceId?: string | null;
}

interface SlicePreview {
    id: string;
    dataUrl: string;
    width: number;
    height: number;
}

const SlicePreviewPanel: React.FC<SlicePreviewPanelProps> = ({
    imageUrl,
    slices,
    originalWidth,
    originalHeight,
    onSliceSelect,
    selectedSliceId
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [previews, setPreviews] = useState<SlicePreview[]>([]);
    const [lightboxImage, setLightboxImage] = useState<{ src: string, name: string } | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    // Generate slice previews when slices change
    useEffect(() => {
        if (!imageUrl || slices.length === 0) {
            setPreviews([]);
            return;
        }

        const generatePreviews = async () => {
            setIsGenerating(true);

            // Load image if not already loaded
            if (!imageRef.current || imageRef.current.src !== imageUrl) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = reject;
                    img.src = imageUrl;
                });
                imageRef.current = img;
            }

            const img = imageRef.current;
            const canvas = canvasRef.current;
            if (!canvas || !img) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const newPreviews: SlicePreview[] = [];

            for (const slice of slices) {
                // Convert normalized coordinates to pixel coordinates
                const x = Math.round(slice.x * img.naturalWidth);
                const y = Math.round(slice.y * img.naturalHeight);
                const width = Math.round(slice.width * img.naturalWidth);
                const height = Math.round(slice.height * img.naturalHeight);

                if (width <= 0 || height <= 0) continue;

                canvas.width = width;
                canvas.height = height;

                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/png');
                newPreviews.push({
                    id: slice.id,
                    dataUrl,
                    width,
                    height
                });
            }

            setPreviews(newPreviews);
            setIsGenerating(false);
        };

        generatePreviews();
    }, [imageUrl, slices]);

    if (slices.length === 0) {
        return null;
    }

    return (
        <>
            {/* Hidden canvas for generating previews */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Preview Panel */}
            <div className="border-t border-slate-200 bg-white">
                {/* Header */}
                <div
                    className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <div className="flex items-center gap-2">
                        {isExpanded ? (
                            <EyeIcon className="w-4 h-4 text-slate-500" />
                        ) : (
                            <EyeSlashIcon className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="text-sm font-semibold text-slate-700">
                            切片预览
                        </span>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                            {slices.length}
                        </span>
                    </div>
                    <div className="text-xs text-slate-400">
                        {isExpanded ? '点击收起' : '点击展开'}
                    </div>
                </div>

                {/* Preview Grid */}
                {isExpanded && (
                    <div className="px-4 pb-4 max-h-48 overflow-y-auto">
                        {isGenerating ? (
                            <div className="flex items-center justify-center py-8 text-slate-400">
                                <div className="animate-spin w-5 h-5 border-2 border-slate-300 border-t-primary rounded-full mr-2" />
                                生成预览中...
                            </div>
                        ) : (
                            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
                                {previews.map((preview, idx) => (
                                    <div
                                        key={preview.id}
                                        className={`group relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${selectedSliceId === preview.id
                                                ? 'border-primary ring-2 ring-blue-100 shadow-md'
                                                : 'border-slate-200 hover:border-primary hover:shadow-md'
                                            }`}
                                        onClick={() => {
                                            onSliceSelect?.(preview.id);
                                            setLightboxImage({ src: preview.dataUrl, name: `切片 ${idx + 1}` });
                                        }}
                                    >
                                        <div className="absolute inset-0 bg-checkerboard" />
                                        <img
                                            src={preview.dataUrl}
                                            alt={`切片 ${idx + 1}`}
                                            className="w-full h-full object-contain relative z-10"
                                        />
                                        {/* Size badge on hover */}
                                        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                            {preview.width}×{preview.height}
                                        </div>
                                        {/* Index badge */}
                                        <div className="absolute top-0.5 left-0.5 bg-black/50 text-white text-[9px] px-1 rounded z-20">
                                            {idx + 1}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Lightbox */}
            {lightboxImage && (
                <div
                    className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-8 animate-in fade-in duration-200"
                    onClick={() => setLightboxImage(null)}
                >
                    <div
                        className="relative max-w-[90vw] max-h-[90vh] bg-checkerboard rounded-2xl overflow-hidden shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={lightboxImage.src}
                            alt={lightboxImage.name}
                            className="max-w-full max-h-[85vh] object-contain"
                        />
                        <div className="absolute top-4 right-4 flex gap-2">
                            <button
                                onClick={() => setLightboxImage(null)}
                                className="w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="absolute bottom-4 left-4 bg-black/50 text-white px-3 py-1.5 rounded-lg text-sm">
                            {lightboxImage.name}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default SlicePreviewPanel;
