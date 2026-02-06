import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { SettingsModal } from './components/SettingsModal';
import SlicePreviewPanel from './components/SlicePreviewPanel';
import { generateGridSlices, generateSlices, scanForSprites } from './utils/imageUtils';
import { detectSegments } from './services/geminiService';
import { loadFilesFromDB, saveFileToDB, deleteFileFromDB, clearDB } from './utils/db';
import { ImageFile, SliceMode, ExportConfig, AISettings, BoundingBox } from './types';
import { GEMINI_MODEL_VISION } from './constants';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
    PlusIcon, PhotoIcon, XMarkIcon, ArrowDownTrayIcon, CheckCircleIcon,
    CloudArrowUpIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon,
    ClockIcon, TrashIcon, Squares2X2Icon, CheckIcon, PlayCircleIcon,
    SparklesIcon, WrenchScrewdriverIcon, ViewColumnsIcon
} from '@heroicons/react/24/outline';

const DEFAULT_EXPORT_CONFIG: ExportConfig = {
    padding: 0,
    removeBackground: false,
    fileFormat: 'png'
};

const DEFAULT_AI_SETTINGS: AISettings = {
    apiKey: '', // User needs to provide this
    useCustomUrl: false,
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: GEMINI_MODEL_VISION,
    systemPrompt: ''
};

function App() {
    const [files, setFiles] = useState<ImageFile[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [queueProcessing, setQueueProcessing] = useState(false);
    const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const [exportedImages, setExportedImages] = useState<{ src: string, name: string }[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isDrawable, setIsDrawable] = useState(false); // Add this if missing or use existing logic
    const [selectedExportIndices, setSelectedExportIndices] = useState<Set<number>>(new Set()); // New state for export selection
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // New feature states
    const [isPaused, setIsPaused] = useState(false);
    const [concurrency, setConcurrency] = useState(1);
    const isPausedRef = useRef(false);
    const cancelQueueRef = useRef(false); // For cancelling queue processing

    const [aiSettings, setAiSettings] = useState<AISettings>(() => {
        const saved = localStorage.getItem('smartslice_ai_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            return { ...DEFAULT_AI_SETTINGS, ...parsed };
        }
        return DEFAULT_AI_SETTINGS;
    });

    const [notification, setNotification] = useState<{ msg: string, type: 'success' | 'error' | 'info', action?: { label: string, onClick: () => void } } | null>(null);
    const [processingMessage, setProcessingMessage] = useState<string>('');
    const [lastError, setLastError] = useState<{ message: string, fileId: string, action: 'ai' | 'scan' } | null>(null);
    const activeFile = files.find((f) => f.id === activeFileId) || null;

    const filesRef = useRef(files);
    useEffect(() => { filesRef.current = files; }, [files]);

    // --- Undo/Redo State ---
    const historyRef = useRef<Record<string, { undo: BoundingBox[][], redo: BoundingBox[][] }>>({});
    const [historyVersion, setHistoryVersion] = useState(0); // Forcing re-render on history change

    const getCurrentHistory = useCallback((fileId: string) => {
        if (!historyRef.current[fileId]) {
            historyRef.current[fileId] = { undo: [], redo: [] };
        }
        return historyRef.current[fileId];
    }, []);

    const pushToHistory = useCallback((fileId: string, slices: BoundingBox[]) => {
        const history = getCurrentHistory(fileId);
        // Limit history size to 50
        if (history.undo.length >= 50) history.undo.shift();
        history.undo.push(slices);
        history.redo = []; // Clear redo on new action
        setHistoryVersion(v => v + 1);
    }, [getCurrentHistory]);

    const handleUndo = useCallback(() => {
        if (!activeFileId) return;
        const history = getCurrentHistory(activeFileId);
        if (history.undo.length === 0) return;

        const currentSlices = activeFile?.slices || [];
        const previousSlices = history.undo.pop();

        if (previousSlices) {
            history.redo.push(currentSlices);
            updateFileAndDB(activeFileId, { slices: previousSlices }, false); // false = don't push to history
            setHistoryVersion(v => v + 1);
            showNotification('撤销', 'info');
        }
    }, [activeFileId, activeFile, getCurrentHistory]);

    const handleRedo = useCallback(() => {
        if (!activeFileId) return;
        const history = getCurrentHistory(activeFileId);
        if (history.redo.length === 0) return;

        const currentSlices = activeFile?.slices || [];
        const nextSlices = history.redo.pop();

        if (nextSlices) {
            history.undo.push(currentSlices);
            updateFileAndDB(activeFileId, { slices: nextSlices }, false); // false = don't push to history
            setHistoryVersion(v => v + 1);
            showNotification('重做', 'info');
        }
    }, [activeFileId, activeFile, getCurrentHistory]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
            }
            // Also support Ctrl+Y for Redo
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo]);

    const showNotification = (msg: string, type: 'success' | 'error' | 'info' = 'info', action?: { label: string, onClick: () => void }) => {
        setNotification({ msg, type, action });
        // Errors with retry action stay longer
        const timeout = type === 'error' && action ? 8000 : 3000;
        setTimeout(() => setNotification(null), timeout);
    }

    // --- Persistence Logic ---
    useEffect(() => {
        const init = async () => {
            try {
                const savedFiles = await loadFilesFromDB();
                if (savedFiles.length > 0) {
                    setFiles(savedFiles);
                    setActiveFileId(savedFiles[0].id);
                }
            } catch (e: any) {
                console.error("Failed to load DB", e);
            }
        };
        init();
    }, []);

    const updateFileAndDB = async (id: string, updates: Partial<ImageFile>, recordHistory = true) => {
        setFiles((prev) => {
            const newFiles = prev.map((f) => {
                if (f.id === id) {
                    // Record history BEFORE updating if slices are changing
                    if (recordHistory && updates.slices && activeFileId === id) {
                        pushToHistory(id, f.slices);
                    }
                    const updatedFile = { ...f, ...updates };
                    saveFileToDB(updatedFile).catch((err: any) => console.error("Save failed", err));
                    return updatedFile;
                }
                return f;
            });
            return newFiles;
        });
    };

    const addFilesToApp = async (fileList: File[]) => {
        const newFiles: ImageFile[] = fileList.map((file) => ({
            id: `img-${Date.now()}-${Math.random()}`,
            file,
            previewUrl: URL.createObjectURL(file),
            originalWidth: 0,
            originalHeight: 0,
            slices: [],
            mode: SliceMode.GRID,
            gridConfigs: { rows: 2, cols: 2 },
            scanTolerance: 20,
            exportConfig: { ...DEFAULT_EXPORT_CONFIG },
            status: 'idle'
        }));

        const initializedFiles = newFiles.map(f => ({
            ...f,
            slices: generateGridSlices(2, 2)
        }));

        setFiles((prev) => [...prev, ...initializedFiles]);
        if (!activeFileId && newFiles.length > 0) {
            setActiveFileId(newFiles[0].id);
        }

        for (const f of initializedFiles) {
            await saveFileToDB(f);
        }

        showNotification(`已导入 ${newFiles.length} 张图片`, 'success');
        if (newFiles.length > 5 && !isDrawerOpen) setIsDrawerOpen(true);
    };

    const removeFileFromApp = async (id: string) => {
        // Clean up Blob URL to prevent memory leak
        const fileToRemove = files.find(f => f.id === id);
        if (fileToRemove) URL.revokeObjectURL(fileToRemove.previewUrl);

        await deleteFileFromDB(id);
        setFiles(prev => {
            const newFiles = prev.filter(f => f.id !== id);
            if (activeFileId === id) {
                setActiveFileId(newFiles.length > 0 ? newFiles[0].id : null);
            }
            return newFiles;
        });
        if (selectedIds.has(id)) {
            const newSet = new Set(selectedIds);
            newSet.delete(id);
            setSelectedIds(newSet);
        }
    };

    const clearAllFiles = async () => {
        // Clean up all Blob URLs to prevent memory leak
        files.forEach(f => URL.revokeObjectURL(f.previewUrl));

        // Cancel any ongoing queue processing
        cancelQueueRef.current = true;
        isPausedRef.current = false;
        setQueueProcessing(false);
        setIsProcessing(false);
        setIsPaused(false);

        await clearDB();
        setFiles([]);
        setActiveFileId(null);
        setSelectedIds(new Set());
        showNotification('工作区已清空，处理已取消', 'info');

        // Reset cancel flag after a short delay
        setTimeout(() => { cancelQueueRef.current = false; }, 100);
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const selectAll = () => {
        if (selectedIds.size === files.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(files.map(f => f.id)));
    };

    const deleteSelected = async () => {
        if (!window.confirm(`确定删除选中的 ${selectedIds.size} 张图片吗?`)) return;
        const ids = Array.from(selectedIds) as string[];
        for (const id of ids) {
            await deleteFileFromDB(id);
        }
        setFiles(prev => {
            const newFiles = prev.filter(f => !selectedIds.has(f.id));
            if (activeFileId && selectedIds.has(activeFileId)) {
                setActiveFileId(newFiles.length > 0 ? newFiles[0].id : null);
            }
            return newFiles;
        });
        setSelectedIds(new Set());
    };

    const handleFileClick = (e: React.MouseEvent, fileId: string, index: number) => {
        if (e.metaKey || e.ctrlKey) {
            // Toggle Selection
            e.stopPropagation();
            toggleSelect(fileId);
        } else if (e.shiftKey && activeFileId) {
            // Range Selection
            e.stopPropagation();
            const activeIndex = files.findIndex(f => f.id === activeFileId);
            if (activeIndex !== -1) {
                const start = Math.min(activeIndex, index);
                const end = Math.max(activeIndex, index);
                const rangeIds = new Set(selectedIds);
                for (let i = start; i <= end; i++) {
                    rangeIds.add(files[i].id);
                }
                setSelectedIds(rangeIds);
                setActiveFileId(fileId); // Move active focus to newest click
            }
        } else {
            // Normal Navigation
            setActiveFileId(fileId);
            // Optional: Clear selection on single click? 
            // Usually 'Select One' clears others unless configured otherwise.
            // For this app, let's keep it simple: Single click navigates. 
            // If user wants to clear selection, they can click background or use 'Deselect All' button.
            // User request: "can only click to jump to that image", implying they want to select multiple without jumping.
        }
    };

    // --- Drag and Drop Handlers ---
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (!isDragging) setIsDragging(true);
    }, [isDragging]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer) {
            const droppedFiles = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.type.startsWith('image/'));
            if (droppedFiles.length > 0) await addFilesToApp(droppedFiles);
        }
    }, [isDrawerOpen]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            addFilesToApp(Array.from(e.target.files));
        }
        e.target.value = '';
    };

    // --- Processing Logic ---

    const processAiDetect = async (file: ImageFile): Promise<ImageFile> => {
        try {
            const detectedSlices = await detectSegments(file.file, aiSettings);
            return { ...file, slices: detectedSlices, status: 'done' };
        } catch (e: any) {
            console.error(e);
            return { ...file, status: 'error' };
        }
    };

    const processScanDetect = async (file: ImageFile): Promise<ImageFile> => {
        try {
            const detectedSlices = await scanForSprites(file.previewUrl, file.scanTolerance);
            return { ...file, slices: detectedSlices, status: 'done' };
        } catch (e: any) {
            return { ...file, status: 'error' };
        }
    };

    // --- QUEUE SYSTEM (with pause & concurrency) ---
    const processQueue = async () => {
        if (queueProcessing) return;
        setQueueProcessing(true);
        isPausedRef.current = false;
        cancelQueueRef.current = false; // Reset cancel flag at start

        let processedCount = 0;

        const processFile = async (file: ImageFile) => {
            // Check if cancelled before processing
            if (cancelQueueRef.current) return 0;

            // Check if file still exists
            const currentFiles = filesRef.current;
            if (!currentFiles.find(f => f.id === file.id)) return 0;

            await updateFileAndDB(file.id, { status: 'processing' });

            let result;
            if (file.mode === SliceMode.SCAN) {
                result = await processScanDetect(file);
            } else {
                result = await processAiDetect(file);
            }

            // Check again if file still exists and not cancelled
            if (cancelQueueRef.current || !filesRef.current.find(f => f.id === file.id)) return 0;

            await updateFileAndDB(file.id, {
                slices: result.slices,
                status: result.status,
                mode: file.mode
            });
            return 1;
        };

        while (true) {
            // Check for cancellation
            if (cancelQueueRef.current) {
                console.log('[Queue] Cancelled');
                break;
            }

            // Check for pause
            if (isPausedRef.current) {
                await new Promise<void>(resolve => {
                    const checkPause = setInterval(() => {
                        if (!isPausedRef.current || cancelQueueRef.current) {
                            clearInterval(checkPause);
                            resolve();
                        }
                    }, 200);
                });
                // Check again if cancelled during pause
                if (cancelQueueRef.current) break;
            }

            const currentFiles = filesRef.current;
            const queuedFiles = currentFiles.filter(f => f.status === 'queued');

            if (queuedFiles.length === 0) break;

            // Process up to 'concurrency' files at once
            const batch = queuedFiles.slice(0, concurrency);
            try {
                const results = await Promise.all(batch.map(processFile));
                processedCount += results.reduce((a, b) => a + b, 0);
            } catch (e) {
                console.error('[Queue] Error:', e);
            }
        }

        setQueueProcessing(false);
        setIsProcessing(false);
        setIsPaused(false);
        if (processedCount > 0 && !cancelQueueRef.current) {
            showNotification(`批量处理完成 (${processedCount} 张)`, 'success');
        }
    };

    // Pause/Resume handlers
    const handlePauseResume = () => {
        if (isPaused) {
            isPausedRef.current = false;
            setIsPaused(false);
            showNotification('已继续处理', 'info');
        } else {
            isPausedRef.current = true;
            setIsPaused(true);
            showNotification('已暂停处理', 'info');
        }
    };

    // Delete selected files
    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) {
            showNotification('请先选择要删除的图片', 'error');
            return;
        }
        const count = selectedIds.size;
        for (const id of selectedIds) {
            await removeFileFromApp(id);
        }
        setSelectedIds(new Set());
        showNotification(`已删除 ${count} 张图片`, 'success');
    };

    // --- Batch Execution Handlers ---

    const handleRunBatch = async (mode: 'AI' | 'SCAN' | 'GRID' | 'CLEAR') => {
        // 1. Determine Target Files
        let targetIds = selectedIds;

        // If nothing selected, prompt user to process ALL
        if (selectedIds.size === 0) {
            if (files.length === 0) {
                showNotification("没有可处理的图片", "error");
                return;
            }
            if (window.confirm(`当前未选中任何图片。是否对列表中的全部 ${files.length} 张图片执行【${mode}】操作？`)) {
                targetIds = new Set(files.map(f => f.id));
            } else {
                return; // User cancelled
            }
        }

        if (mode === 'CLEAR') {
            const newFiles = await Promise.all(files.map(async f => {
                if (targetIds.has(f.id)) {
                    const updated = { ...f, slices: [], status: 'idle' as const };
                    await saveFileToDB(updated);
                    return updated;
                }
                return f;
            }));
            setFiles(newFiles);
            showNotification(`已清空 ${targetIds.size} 张图片的切片`, 'success');
            return;
        }

        // 2. Pre-flight checks
        if (mode === 'AI') {
            // Check for API Key in settings OR env
            if (!aiSettings.apiKey && !process.env.API_KEY) {
                showNotification("请先配置 API Key 才能使用 AI 功能", 'error');
                setSettingsModalOpen(true);
                return;
            }
        }

        // 3. Execution Logic
        // Config source: Active file or Default/Self
        const sourceConfig = activeFile;

        if (mode === 'GRID') {
            // Synchronous Batch for Grid
            const rows = sourceConfig?.gridConfigs.rows || 2;
            const cols = sourceConfig?.gridConfigs.cols || 2;
            const newSlices = generateGridSlices(rows, cols);

            const newFiles = files.map(f => {
                if (targetIds.has(f.id)) {
                    const updated = { ...f, mode: SliceMode.GRID, gridConfigs: { rows, cols }, slices: newSlices, status: 'done' as const };
                    saveFileToDB(updated);
                    return updated;
                }
                return f;
            });
            setFiles(newFiles);
            showNotification(`已对 ${targetIds.size} 张图片应用网格`, 'success');
        }
        else {
            // Async Queue Batch (AI / SCAN)
            const newFiles = files.map(f => {
                if (targetIds.has(f.id)) {
                    // Apply config from active file if available
                    const updates: any = { status: 'queued' };
                    if (mode === 'SCAN') {
                        updates.mode = SliceMode.SCAN;
                        if (sourceConfig) updates.scanTolerance = sourceConfig.scanTolerance;
                    } else {
                        updates.mode = SliceMode.AI_AUTO;
                    }

                    const updated = { ...f, ...updates };
                    saveFileToDB(updated);
                    return updated;
                }
                return f;
            });
            setFiles(newFiles);
            setIsProcessing(true);
            showNotification(`${targetIds.size} 个任务已加入队列...`, 'info');
            // Give React state a moment to update before starting queue
            setTimeout(processQueue, 100);
        }
    };

    // --- Handlers for Editor/Sidebar ---
    const handleModeChange = (mode: SliceMode) => {
        if (activeFile) {
            let newSlices = activeFile.slices;
            if (mode === SliceMode.GRID) newSlices = generateGridSlices(activeFile.gridConfigs.rows, activeFile.gridConfigs.cols);
            updateFileAndDB(activeFile.id, { mode, slices: newSlices });
        }
    };

    const handleGridUpdate = (rows: number, cols: number) => {
        if (activeFile) updateFileAndDB(activeFile.id, { gridConfigs: { rows, cols }, slices: generateGridSlices(rows, cols) });
    };

    const handleAiDetect = async (targetFileId?: string) => {
        const targetFile = targetFileId ? files.find(f => f.id === targetFileId) : activeFile;
        if (!targetFile) return;

        // Check key presence
        if (!aiSettings.apiKey && !process.env.API_KEY) {
            showNotification("请先配置 API Key", 'error');
            setSettingsModalOpen(true);
            return;
        }

        setIsProcessing(true);
        setProcessingMessage('AI 识别中...');
        setLastError(null);
        updateFileAndDB(targetFile.id, { status: 'processing' });

        try {
            const detectedSlices = await detectSegments(targetFile.file, aiSettings);
            await updateFileAndDB(targetFile.id, { slices: detectedSlices, status: 'done' });
            showNotification(`AI 识别完成，找到 ${detectedSlices.length} 个区域`, 'success');
        } catch (e: any) {
            const errorMsg = e.message || 'AI 识别失败';
            await updateFileAndDB(targetFile.id, { status: 'error' });
            setLastError({ message: errorMsg, fileId: targetFile.id, action: 'ai' });
            showNotification(errorMsg, 'error', {
                label: '重试',
                onClick: () => handleAiDetect(targetFile.id)
            });
        } finally {
            setIsProcessing(false);
            setProcessingMessage('');
        }
    };

    const handleScanDetect = async (targetFileId?: string) => {
        const targetFile = targetFileId ? files.find(f => f.id === targetFileId) : activeFile;
        if (!targetFile) return;

        setIsProcessing(true);
        setProcessingMessage('扫描识别中...');
        setLastError(null);
        updateFileAndDB(targetFile.id, { status: 'processing' });

        try {
            const detectedSlices = await scanForSprites(targetFile.previewUrl, targetFile.scanTolerance);
            await updateFileAndDB(targetFile.id, { slices: detectedSlices, status: 'done' });
            showNotification(`扫描完成，找到 ${detectedSlices.length} 个区域`, 'success');
        } catch (e: any) {
            const errorMsg = e.message || '扫描失败';
            await updateFileAndDB(targetFile.id, { status: 'error' });
            setLastError({ message: errorMsg, fileId: targetFile.id, action: 'scan' });
            showNotification(errorMsg, 'error', {
                label: '重试',
                onClick: () => handleScanDetect(targetFile.id)
            });
        } finally {
            setIsProcessing(false);
            setProcessingMessage('');
        }
    };

    const handleExport = async () => {
        if (!activeFile) return;

        // Check for empty slices
        if (activeFile.slices.length === 0) {
            showNotification('当前图片没有切片，请先识别或手动绘制', 'error');
            return;
        }

        setIsProcessing(true);
        try {
            const images = await generateSlices(activeFile.previewUrl, activeFile.slices, activeFile.exportConfig);
            const originalName = activeFile.file.name.substring(0, activeFile.file.name.lastIndexOf('.')) || 'image';
            const formattedImages = images.map((img, idx) => ({ src: img, name: `${originalName}_slice_${idx + 1}` }));
            setExportedImages(formattedImages);
            setExportModalOpen(true);
        } catch (e: any) {
            showNotification("导出失败", 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBatchExport = async () => {
        // Smart export: export all images that have slices
        // Priority: selected images > all images with slices

        let filesToExport: ImageFile[] = [];

        if (selectedIds.size > 0) {
            // Export selected images only
            filesToExport = files.filter(f => selectedIds.has(f.id) && f.slices && f.slices.length > 0);
            if (filesToExport.length === 0) {
                showNotification("选中的图片都没有切片", 'error');
                return;
            }
        } else {
            // No selection: export ALL images that have slices (no confirmation needed)
            filesToExport = files.filter(f => f.slices && f.slices.length > 0);
            if (filesToExport.length === 0) {
                showNotification("没有已切片的图片可导出，请先识别图片", 'error');
                return;
            }
        }

        // Count total slices
        const totalSliceCount = filesToExport.reduce((sum, f) => sum + f.slices.length, 0);
        console.log(`[BatchExport] Exporting ${filesToExport.length} images with ${totalSliceCount} total slices`);

        setIsProcessing(true);
        showNotification(`正在导出 ${filesToExport.length} 张图片的 ${totalSliceCount} 个切片...`, 'info');

        try {
            const promises = filesToExport.map(async (file, fileIdx) => {
                console.log(`[BatchExport] Processing ${fileIdx + 1}/${filesToExport.length}: ${file.file.name} (${file.slices.length} slices)`);
                const images = await generateSlices(file.previewUrl, file.slices, file.exportConfig);
                return images.map((img, idx) => {
                    const originalName = file.file.name.substring(0, file.file.name.lastIndexOf('.')) || 'image';
                    return { src: img, name: `${originalName}_slice_${idx + 1}` };
                });
            });

            const results = await Promise.all(promises);
            const allImages = results.flat();
            console.log(`[BatchExport] Generated ${allImages.length} slice images`);

            if (allImages.length === 0) {
                showNotification("切片生成失败", 'error');
                return;
            }

            setExportedImages(allImages);
            setSelectedExportIndices(new Set(allImages.map((_, i) => i))); // Select all by default
            setExportModalOpen(true);
            showNotification(`已加载 ${allImages.length} 个切片，请选择并下载`, 'success');
        } catch (e: any) {
            console.error('[BatchExport] Error:', e);
            showNotification("导出出错: " + e.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    // --- Render Helpers ---
    const FileStatusIcon = ({ status }: { status?: string }) => {
        switch (status) {
            case 'processing': return <div className="bg-white/90 rounded-full p-1 shadow"><ArrowDownTrayIcon className="w-4 h-4 text-primary animate-spin" /></div>;
            case 'queued': return <div className="bg-white/90 rounded-full p-1 shadow"><ClockIcon className="w-4 h-4 text-slate-500" /></div>;
            case 'done': return <div className="bg-green-500 rounded-full p-1 shadow"><CheckCircleIcon className="w-4 h-4 text-white" /></div>;
            case 'error': return <div className="bg-red-500 rounded-full p-1 shadow"><XMarkIcon className="w-4 h-4 text-white" /></div>;
            default: return null;
        }
    };

    return (
        <div
            className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden relative"
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        >

            {/* Global Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-[100] bg-primary/90 backdrop-blur-sm flex flex-col items-center justify-center text-white animate-in fade-in duration-200 pointer-events-none">
                    <CloudArrowUpIcon className="w-32 h-32 mb-8 animate-bounce" />
                    <h2 className="text-4xl font-bold">释放以添加图片</h2>
                    <p className="text-xl mt-4 text-blue-100">支持批量导入多种格式</p>
                </div>
            )}

            {/* Toast */}
            {notification && (
                <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[80] px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-md border animate-in slide-in-from-top-4 fade-in duration-300 font-bold flex items-center space-x-3 ${notification.type === 'error' ? 'bg-white border-red-100 text-red-600' :
                    notification.type === 'success' ? 'bg-white border-green-100 text-green-600' :
                        'bg-white border-slate-200 text-slate-700'
                    }`}>
                    {notification.type === 'success' && <CheckCircleIcon className="w-6 h-6 flex-shrink-0" />}
                    {notification.type === 'error' && <XMarkIcon className="w-6 h-6 flex-shrink-0" />}
                    <span className="max-w-md truncate">{notification.msg}</span>
                    {notification.action && (
                        <button
                            onClick={() => { notification.action?.onClick(); setNotification(null); }}
                            className="ml-2 px-3 py-1.5 bg-primary hover:bg-primaryHover text-white text-sm rounded-lg font-bold transition-all shadow-sm"
                        >
                            {notification.action.label}
                        </button>
                    )}
                </div>
            )}

            {/* Settings Modal */}
            <SettingsModal
                isOpen={settingsModalOpen} onClose={() => setSettingsModalOpen(false)}
                settings={aiSettings} onSave={(s) => { setAiSettings(s); localStorage.setItem('smartslice_ai_settings', JSON.stringify(s)); setSettingsModalOpen(false); showNotification('设置已保存', 'success'); }}
            />

            {/* --- DRAWER SIDEBAR (Left) --- */}
            <div className={`bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out z-20 shadow-xl relative shrink-0 ${isDrawerOpen ? 'w-80' : 'w-20'}`}>

                {/* Drawer Header */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 bg-white sticky top-0 z-10">
                    {/* Top Header - Logo area */}
                    <div className="flex items-center space-x-2 w-full">
                        {isDrawerOpen ? (
                            <>
                                <span className="font-extrabold text-slate-700 text-lg">图库</span>
                                <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full font-mono">{files.length}</span>
                                <div className="flex-1"></div>
                                {files.length > 0 && (
                                    <button onClick={selectAll} className="text-xs text-primary font-bold hover:bg-blue-50 px-2 py-1 rounded">
                                        {selectedIds.size === files.length ? '全不选' : '全选'}
                                    </button>
                                )}
                            </>
                        ) : (
                            <div className="w-full flex justify-center cursor-pointer hover:scale-110 transition-transform" onClick={() => setIsDrawerOpen(true)}>
                                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                                    <Squares2X2Icon className="w-6 h-6 text-white" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- CURVED TOGGLE BUTTON (Vertically Centered) --- */}
                <button
                    onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                    className="absolute -right-5 top-1/2 -translate-y-1/2 w-5 h-12 bg-white rounded-r-xl border-y border-r border-slate-200 shadow-md flex items-center justify-center text-slate-400 hover:text-primary hover:w-6 transition-all duration-200 z-50 group"
                    title={isDrawerOpen ? "收起" : "展开"}
                >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-white"></div> {/* Cover border gap */}
                    {isDrawerOpen ? <ChevronDoubleLeftIcon className="w-3 h-3" /> : <ChevronDoubleRightIcon className="w-3 h-3" />}
                </button>

                {/* Queue Progress Bar */}
                {queueProcessing && (
                    <div className="h-1 bg-slate-100 w-full">
                        <div className="h-full bg-primary animate-pulse transition-all duration-500"
                            style={{ width: `${(files.filter(f => f.status === 'done' || f.status === 'error').length / files.length) * 100}%` }}></div>
                    </div>
                )}

                {/* File List / Grid */}
                <div className={`flex-1 overflow-y-auto custom-scrollbar p-3 ${isDrawerOpen ? 'bg-slate-50/50' : 'flex flex-col items-center space-y-4 bg-white'}`}>

                    {/* GRID VIEW (Expanded) */}
                    {isDrawerOpen ? (
                        <div className="grid grid-cols-3 gap-2 pb-20">
                            {files.map((file, idx) => {
                                const isSelected = selectedIds.has(file.id);
                                return (
                                    <div
                                        key={file.id}
                                        onClick={(e) => handleFileClick(e, file.id, idx)}
                                        className={`aspect-square relative rounded-xl cursor-pointer group overflow-hidden border-2 transition-all duration-200 ${activeFileId === file.id
                                            ? 'border-primary ring-2 ring-blue-100 shadow-md z-10 scale-105'
                                            : isSelected
                                                ? 'border-blue-400 bg-blue-50'
                                                : 'border-slate-200 hover:border-slate-300 bg-white'
                                            }`}
                                    >
                                        <div className="absolute inset-0 bg-checkerboard opacity-50 pointer-events-none"></div>
                                        <img src={file.previewUrl} className="w-full h-full object-contain relative z-0" loading="lazy" />

                                        {/* Sequence Badge */}
                                        <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1.5 rounded-md backdrop-blur-sm z-10 font-mono">
                                            {idx + 1}
                                        </div>

                                        {/* Selection Checkbox */}
                                        <div
                                            onClick={(e) => { e.stopPropagation(); toggleSelect(file.id); }}
                                            className={`absolute top-1 right-1 w-5 h-5 rounded-full border shadow-sm z-30 flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary' : 'bg-white border-slate-300 hover:border-primary opacity-0 group-hover:opacity-100'
                                                }`}
                                        >
                                            {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                                        </div>

                                        {/* Status Overlay */}
                                        <div className="absolute bottom-1 right-1 z-20">
                                            <FileStatusIcon status={file.status} />
                                        </div>

                                        {/* Delete Button (on hover) */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeFileFromApp(file.id); }}
                                            className="absolute bottom-1 left-1 z-30 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                            title="删除"
                                        >
                                            <TrashIcon className="w-3 h-3" />
                                        </button>
                                    </div>
                                )
                            })}

                            {/* Add Button in Grid */}
                            <label className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-blue-50 transition-colors text-slate-400 hover:text-primary gap-1">
                                <PlusIcon className="w-6 h-6" />
                                <span className="text-[10px] font-bold">添加</span>
                                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                            </label>
                        </div>
                    ) : (
                        /* COMPACT VIEW (Collapsed) */
                        <>
                            {files.map((file, idx) => (
                                <div key={file.id} className="relative group w-14 h-14 shrink-0">
                                    {activeFileId === file.id && <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-primary rounded-r-full"></div>}
                                    <button
                                        onClick={() => setActiveFileId(file.id)}
                                        className={`w-full h-full rounded-2xl overflow-hidden border-2 transition-all ${activeFileId === file.id ? 'border-primary shadow-lg ring-2 ring-blue-50' : 'border-slate-100 hover:border-slate-300'
                                            }`}
                                    >
                                        <img src={file.previewUrl} className="w-full h-full object-cover" />
                                    </button>
                                </div>
                            ))}
                            <label className="w-14 h-14 shrink-0 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-primary hover:text-primary hover:bg-blue-50 transition-colors">
                                <PlusIcon className="w-6 h-6" />
                                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                            </label>
                        </>
                    )}
                </div>

                {/* --- Batch Actions Toolbar (Inside Drawer) - REMOVED TO SIMPLIFY AND MOVE TO SIDEBAR --- */}
                {/* Previous drawer batch toolbar was confusing. Logic moved to Right Sidebar to centralize actions */}

            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col h-full relative bg-slate-50 min-w-0">
                {/* Workspace */}
                <div className="flex-1 relative overflow-hidden flex flex-col min-h-0">
                    {activeFile ? (
                        <>
                            {/* Editor */}
                            <div className="flex-1 p-8 overflow-hidden flex items-center justify-center min-h-0">
                                <div className="w-full h-full shadow-soft rounded-3xl overflow-hidden bg-white border border-slate-100 ring-4 ring-slate-100/50">
                                    <Editor
                                        imageSrc={activeFile.previewUrl}
                                        slices={activeFile.slices}
                                        onSlicesChange={(slices) => updateFileAndDB(activeFile.id, { slices })}
                                        selectedSliceId={selectedSliceId}
                                        onSelectSlice={setSelectedSliceId}
                                        onLoadImage={(w, h) => updateFileAndDB(activeFile.id, { originalWidth: w, originalHeight: h })}
                                    />
                                </div>
                            </div>

                            {/* Slice Preview Panel */}
                            <SlicePreviewPanel
                                imageUrl={activeFile.previewUrl}
                                slices={activeFile.slices}
                                originalWidth={activeFile.originalWidth || 1}
                                originalHeight={activeFile.originalHeight || 1}
                                onSliceSelect={setSelectedSliceId}
                                selectedSliceId={selectedSliceId}
                            />
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 animate-in fade-in zoom-in duration-500 select-none p-8">
                            <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-8 shadow-soft border border-slate-50">
                                <PhotoIcon className="w-12 h-12 text-slate-300" />
                            </div>
                            <p className="text-2xl font-bold text-slate-700 mb-2">工作区空闲</p>
                            <label className="mt-4 px-6 py-3 bg-white border border-slate-200 hover:border-primary hover:text-primary text-slate-600 rounded-xl cursor-pointer transition-colors font-semibold shadow-sm">
                                导入图片
                                <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileUpload} />
                            </label>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Sidebar */}
            <div className="w-96 bg-white border-l border-slate-200 flex flex-col z-20 shadow-xl relative shrink-0">
                <Sidebar
                    activeFile={activeFile}
                    filesCount={files.length}
                    slicedFilesCount={files.filter(f => f.slices && f.slices.length > 0).length}
                    totalSliceCount={files.reduce((sum, f) => sum + (f.slices?.length || 0), 0)}
                    onModeChange={handleModeChange}
                    onGridUpdate={handleGridUpdate}
                    onScanConfigChange={(v) => updateFileAndDB(activeFile?.id || '', { scanTolerance: v })}
                    onAiDetect={() => handleAiDetect()}
                    onScanDetect={() => handleScanDetect()}
                    onDeleteSlice={() => { if (activeFile) updateFileAndDB(activeFile.id, { slices: [] }); }}
                    isProcessing={isProcessing}
                    processingMessage={processingMessage}
                    onExport={handleExport}
                    onConfigChange={(config) => activeFile && updateFileAndDB(activeFile.id, { exportConfig: config })}
                    onOpenSettings={() => setSettingsModalOpen(true)}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={!!(activeFileId && historyRef.current[activeFileId]?.undo.length > 0)}
                    canRedo={!!(activeFileId && historyRef.current[activeFileId]?.redo.length > 0)}
                    onBatchAction={(action) => {
                        if (action === 'export') handleBatchExport();
                        else if (action === 'ai') handleRunBatch('AI');
                        else if (action === 'scan') handleRunBatch('SCAN');
                        else if (action === 'grid') handleRunBatch('GRID');
                        else if (action === 'clear') handleRunBatch('CLEAR');
                    }}
                    onApplySettingsToAll={(type) => {
                        if (type === 'export') handleBatchExport();
                        else if (type === 'grid') handleRunBatch('GRID');
                        else if (type === 'scan') handleRunBatch('SCAN');
                        else if (type === 'mode' && activeFile) {
                            if (activeFile.mode === SliceMode.GRID) handleRunBatch('GRID');
                            else if (activeFile.mode === SliceMode.SCAN) handleRunBatch('SCAN');
                            else handleRunBatch('AI');
                        }
                    }}
                    // New props for pause/concurrency/delete
                    isPaused={isPaused}
                    onPauseResume={handlePauseResume}
                    concurrency={concurrency}
                    onConcurrencyChange={setConcurrency}
                    selectedCount={selectedIds.size}
                    onDeleteSelected={handleDeleteSelected}
                    queueProcessing={queueProcessing}
                />

                {/* Export Modal */}
                {exportModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                            <div className="flex justify-between items-center px-8 py-6 border-b border-slate-100 bg-white">
                                <div>
                                    <h2 className="text-2xl font-extrabold text-slate-800">导出预览</h2>
                                    <p className="text-sm text-slate-500 mt-1 font-medium">已选 {selectedExportIndices.size} / {exportedImages.length} 个切片</p>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <button
                                        onClick={() => {
                                            if (selectedExportIndices.size === exportedImages.length) setSelectedExportIndices(new Set());
                                            else setSelectedExportIndices(new Set(exportedImages.map((_, i) => i)));
                                        }}
                                        className="text-sm font-bold text-primary hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        {selectedExportIndices.size === exportedImages.length ? '全不选' : '全选'}
                                    </button>
                                    <button onClick={() => setExportModalOpen(false)} className="bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors text-slate-500"><XMarkIcon className="w-6 h-6" /></button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6">
                                    {exportedImages.map((img, idx) => {
                                        const isSelected = selectedExportIndices.has(idx);
                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => {
                                                    const newSet = new Set(selectedExportIndices);
                                                    if (newSet.has(idx)) newSet.delete(idx);
                                                    else newSet.add(idx);
                                                    setSelectedExportIndices(newSet);
                                                }}
                                                className={`group relative bg-white rounded-2xl p-4 border transition-all duration-200 cursor-pointer ${isSelected ? 'border-primary ring-1 ring-primary shadow-md bg-blue-50/10' : 'border-slate-200 hover:border-primary hover:shadow-lg'
                                                    }`}
                                            >
                                                <div className={`absolute top-2 right-2 w-5 h-5 rounded-md border flex items-center justify-center transition-all z-10 ${isSelected ? 'bg-primary border-primary' : 'bg-white border-slate-300'
                                                    }`}>
                                                    {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                                                </div>
                                                <div className="aspect-square w-full flex items-center justify-center overflow-hidden mb-3 bg-checkerboard rounded-xl relative">
                                                    <img src={img.src} className="max-w-full max-h-full object-contain relative z-0" />
                                                </div>
                                                <div className={`text-[10px] text-center font-mono font-medium truncate ${isSelected ? 'text-primary' : 'text-slate-400'}`}>{img.name}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="px-8 py-6 border-t border-slate-100 bg-white flex justify-end space-x-4">
                                <button onClick={() => setExportModalOpen(false)} className="px-8 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">取消</button>
                                <button
                                    onClick={async () => {
                                        const imagesToDownload = exportedImages.filter((_, i) => selectedExportIndices.has(i));
                                        if (imagesToDownload.length === 0) {
                                            showNotification('请先选择要导出的图片', 'error');
                                            return;
                                        }

                                        const format = activeFile?.exportConfig.fileFormat || 'png';

                                        // For small batches (<=5), use direct download
                                        if (imagesToDownload.length <= 5) {
                                            for (const img of imagesToDownload) {
                                                const link = document.createElement('a');
                                                link.href = img.src;
                                                link.download = `${img.name}.${format}`;
                                                document.body.appendChild(link);
                                                link.click();
                                                document.body.removeChild(link);
                                                await new Promise(r => setTimeout(r, 100)); // Small delay between downloads
                                            }
                                            showNotification(`已下载 ${imagesToDownload.length} 个文件`, 'success');
                                        } else {
                                            // For large batches, pack into ZIP
                                            showNotification(`正在打包 ${imagesToDownload.length} 个文件为 ZIP...`, 'info');
                                            try {
                                                const zip = new JSZip();
                                                const folder = zip.folder('slices');

                                                for (let i = 0; i < imagesToDownload.length; i++) {
                                                    const img = imagesToDownload[i];
                                                    // Extract base64 data from data URL
                                                    const base64Data = img.src.split(',')[1];
                                                    folder?.file(`${img.name}.${format}`, base64Data, { base64: true });
                                                }

                                                const content = await zip.generateAsync({ type: 'blob' });
                                                const timestamp = new Date().toISOString().slice(0, 10);
                                                saveAs(content, `slices_${timestamp}.zip`);
                                                showNotification(`已导出 ${imagesToDownload.length} 个切片为 ZIP`, 'success');
                                            } catch (e) {
                                                console.error('ZIP export error:', e);
                                                showNotification('ZIP 打包失败', 'error');
                                            }
                                        }
                                    }}
                                    disabled={selectedExportIndices.size === 0}
                                    className="px-8 py-3 bg-primary hover:bg-primaryHover disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-bold shadow-lg flex items-center transition-all"
                                >
                                    <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
                                    下载选中 ({selectedExportIndices.size})
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}

export default App;