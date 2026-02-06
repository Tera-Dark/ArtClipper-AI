import React, { useState } from 'react';
import { SliceMode, ImageFile, ExportConfig } from '../types';
import {
  ArrowDownTrayIcon, TrashIcon, SparklesIcon, ViewColumnsIcon,
  HandRaisedIcon, WrenchScrewdriverIcon, AdjustmentsHorizontalIcon,
  Cog6ToothIcon, Square2StackIcon, PlayCircleIcon, ArrowPathIcon,
  ArrowsRightLeftIcon, CheckBadgeIcon, ArchiveBoxArrowDownIcon,
  BoltIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, PauseCircleIcon
} from '@heroicons/react/24/outline';

interface SidebarProps {
  activeFile: ImageFile | null;
  filesCount: number;
  onModeChange: (mode: SliceMode) => void;
  onGridUpdate: (rows: number, cols: number) => void;
  onScanConfigChange: (tolerance: number) => void;
  onAiDetect: () => void;
  onScanDetect: () => void;
  onDeleteSlice: () => void;
  isProcessing: boolean;
  processingMessage?: string;
  onExport: () => void;
  onConfigChange: (config: ExportConfig) => void;
  onOpenSettings: () => void;
  onBatchAction: (action: 'ai' | 'scan' | 'grid' | 'export' | 'clear') => void;
  onApplySettingsToAll: (type: 'mode' | 'grid' | 'scan' | 'export') => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // New props for pause/concurrency/delete
  isPaused?: boolean;
  onPauseResume?: () => void;
  concurrency?: number;
  onConcurrencyChange?: (value: number) => void;
  selectedCount?: number;
  onDeleteSelected?: () => void;
  queueProcessing?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeFile,
  filesCount,
  onModeChange,
  onGridUpdate,
  onScanConfigChange,
  onAiDetect,
  onScanDetect,
  onDeleteSlice,
  isProcessing,
  onExport,
  onConfigChange,
  onOpenSettings,
  onBatchAction,
  onApplySettingsToAll,
  onUndo, onRedo, canUndo, canRedo,
  processingMessage,
  // New props
  isPaused = false,
  onPauseResume,
  concurrency = 1,
  onConcurrencyChange,
  selectedCount = 0,
  onDeleteSelected,
  queueProcessing = false
}) => {
  const [rows, setRows] = useState(activeFile?.gridConfigs.rows || 2);
  const [cols, setCols] = useState(activeFile?.gridConfigs.cols || 2);

  // Sync internal state if active file changes
  React.useEffect(() => {
    if (activeFile) {
      setRows(activeFile.gridConfigs.rows);
      setCols(activeFile.gridConfigs.cols);
    }
  }, [activeFile]);

  const handleGridChange = (r: number, c: number) => {
    setRows(r);
    setCols(c);
    onGridUpdate(r, c);
  };

  const handleConfigUpdate = (key: keyof ExportConfig, value: any) => {
    if (activeFile) {
      onConfigChange({
        ...activeFile.exportConfig,
        [key]: value
      });
    }
  }

  // --- Render Helpers ---

  // Mini Tab for Mode Selection
  const ModeTab = ({ mode, icon: Icon, label }: any) => {
    const isActive = activeFile?.mode === mode;
    return (
      <button
        onClick={() => onModeChange(mode)}
        className={`flex-1 flex flex-col items-center justify-center py-2 relative transition-all duration-200 ${isActive ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
      >
        <div className={`mb-1 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
          <Icon className={`w-5 h-5`} strokeWidth={isActive ? 2 : 1.5} />
        </div>
        <span className={`text-[10px] uppercase tracking-wide font-bold ${isActive ? 'opacity-100' : 'opacity-70'}`}>{label}</span>
        {isActive && <div className="absolute bottom-0 w-8 h-1 bg-slate-800 rounded-t-full"></div>}
      </button>
    );
  };

  // Compact Action Button
  const ActionButton = ({ onClick, disabled, label, icon: Icon, primary = false, danger = false }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-2.5 px-4 rounded-xl flex items-center justify-center font-bold text-sm transition-all active:scale-95 shadow-sm
            ${primary
          ? 'bg-slate-900 text-white hover:bg-black disabled:bg-slate-200 disabled:text-slate-400'
          : danger
            ? 'bg-red-50 text-red-600 hover:bg-red-100'
            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
        }
        `}
    >
      {isProcessing && primary ? <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" /> : <Icon className="w-4 h-4 mr-2" />}
      {isProcessing && primary && processingMessage ? processingMessage : label}
    </button>
  );

  const BatchButton = ({ action, icon: Icon, label, colorClass }: any) => (
    <button
      onClick={() => onBatchAction(action)}
      disabled={isProcessing}
      className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 hover:bg-slate-100 group ${colorClass}`}
      title={label}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-1 bg-slate-50 border border-slate-100 group-hover:scale-110 transition-transform ${isProcessing ? 'opacity-50' : ''}`}>
        <Icon className="w-5 h-5 text-slate-600" />
      </div>
      <span className="text-[9px] font-medium text-slate-500">{label}</span>
    </button>
  );

  if (!activeFile) {
    return (
      <div className="w-96 bg-white border-l border-slate-200 p-8 flex flex-col items-center justify-center text-slate-400 text-center shadow-2xl z-30">
        <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 border border-slate-100">
          <Square2StackIcon className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">未选择图片</h3>
        <p className="text-sm text-slate-500">从左侧选择一张图片开始切图</p>

        <div className="mt-8">
          <button
            onClick={onOpenSettings}
            className="text-slate-400 hover:text-slate-600 flex items-center text-sm font-medium transition-colors"
          >
            <Cog6ToothIcon className="w-4 h-4 mr-1.5" /> 全局设置
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-96 bg-white border-l border-slate-200 flex flex-col h-full shadow-2xl z-30 font-sans text-slate-600">

      {/* 1. Slim Header */}
      <div className="h-14 px-5 border-b border-slate-100 bg-white flex justify-between items-center sticky top-0 z-10">
        <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center">
          <AdjustmentsHorizontalIcon className="w-4 h-4 mr-2 text-slate-400" />
          工作台
        </h2>
        <div className="flex items-center space-x-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="撤销 (Ctrl+Z)"
          >
            <ArrowUturnLeftIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="重做 (Ctrl+Shift+Z)"
          >
            <ArrowUturnRightIcon className="w-4 h-4" />
          </button>
          <div className="w-px h-3 bg-slate-200 mx-1"></div>
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors"
            title="设置"
          >
            <Cog6ToothIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8 custom-scrollbar bg-white">

        {/* 2. Mode Tabs (Segmented Control) */}
        <section>
          <div className="flex justify-between items-end mb-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">处理模式</label>
            {filesCount > 1 && (
              <button
                onClick={() => onApplySettingsToAll('mode')}
                className="text-[9px] text-slate-400 hover:text-primary flex items-center transition-colors font-medium"
                title="应用到所有"
              >
                <ArrowsRightLeftIcon className="w-3 h-3 mr-1" /> 同步
              </button>
            )}
          </div>
          <div className="flex bg-slate-50 rounded-xl p-1 border border-slate-100">
            <ModeTab mode={SliceMode.AI_AUTO} icon={SparklesIcon} label="AI" />
            <ModeTab mode={SliceMode.SCAN} icon={WrenchScrewdriverIcon} label="扫描" />
            <ModeTab mode={SliceMode.GRID} icon={ViewColumnsIcon} label="网格" />
            <ModeTab mode={SliceMode.MANUAL} icon={HandRaisedIcon} label="手绘" />
          </div>
        </section>

        {/* 3. Operational Canvas (Clean, no card bg) */}
        <section className="space-y-4">
          {/* Section Header with Sync/Clear */}
          <div className="flex justify-between items-center h-4">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">参数控制</label>
            <div className="flex space-x-2">
              {(activeFile.mode === SliceMode.GRID || activeFile.mode === SliceMode.SCAN) && filesCount > 1 && (
                <button onClick={() => onApplySettingsToAll(activeFile.mode === SliceMode.GRID ? 'grid' : 'scan')} className="text-[10px] text-slate-400 hover:text-slate-800 transition-colors" title="同步参数">
                  <ArrowsRightLeftIcon className="w-3 h-3" />
                </button>
              )}
              {activeFile.slices.length > 0 && (
                <button onClick={onDeleteSlice} className="text-[10px] text-red-400 hover:text-red-600 transition-colors flex items-center" title="清空">
                  <TrashIcon className="w-3 h-3 mr-0.5" /> 清空
                </button>
              )}
            </div>
          </div>

          {/* --- AI MODE --- */}
          {activeFile.mode === SliceMode.AI_AUTO && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                使用 Gemini Vision AI 自动识别并拆分图像中的所有独立元素。
              </p>
              <ActionButton onClick={onAiDetect} disabled={isProcessing} label="开始 AI 识别" icon={SparklesIcon} primary />
            </div>
          )}

          {/* --- SCAN MODE --- */}
          {activeFile.mode === SliceMode.SCAN && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">扫描灵敏度</span>
                  <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-1.5 rounded">{activeFile.scanTolerance || 20}</span>
                </div>
                <input
                  type="range" min="1" max="100"
                  value={activeFile.scanTolerance || 20}
                  onChange={(e) => onScanConfigChange(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-slate-800 hover:accent-slate-700"
                />
                <div className="flex justify-between mt-1 text-[10px] font-medium text-slate-400">
                  <span>精确 (低容差)</span>
                  <span>模糊 (高容差)</span>
                </div>
              </div>
              <ActionButton onClick={onScanDetect} disabled={isProcessing} label="运行魔法扫描" icon={WrenchScrewdriverIcon} primary />
            </div>
          )}

          {/* --- GRID MODE --- */}
          {activeFile.mode === SliceMode.GRID && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-2">行数 <span className="text-slate-400 font-normal">Rows</span></label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="range" min="1" max="10" value={rows}
                      onChange={(e) => handleGridChange(parseInt(e.target.value), cols)}
                      className="flex-1 h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-slate-800"
                    />
                    <span className="text-xs font-bold font-mono w-4">{rows}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-2">列数 <span className="text-slate-400 font-normal">Cols</span></label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="range" min="1" max="10" value={cols}
                      onChange={(e) => handleGridChange(rows, parseInt(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-slate-800"
                    />
                    <span className="text-xs font-bold font-mono w-4">{cols}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --- MANUAL MODE --- */}
          {activeFile.mode === SliceMode.MANUAL && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center">
                <HandRaisedIcon className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <p className="text-xs text-slate-500">在画布上直接拖拽鼠标创建切片。<br />选中切片后按 <kbd className="font-sans border border-slate-300 rounded px-1 text-[10px]">Del</kbd> 删除。</p>
              </div>
              <div className="mt-4">
                <ActionButton onClick={onDeleteSlice} label="清空画布" icon={TrashIcon} danger />
              </div>
            </div>
          )}
        </section>

        <div className="w-full h-px bg-slate-100"></div>

        {/* 4. Export & Config (Simplified) */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">导出选项</label>
            {filesCount > 1 && (
              <button onClick={() => onApplySettingsToAll('export')} className="text-[9px] text-slate-400 hover:text-primary flex items-center transition-colors" title="应用到所有">
                <ArrowsRightLeftIcon className="w-3 h-3 mr-1" /> 同步
              </button>
            )}
          </div>

          <div className="space-y-4">
            {/* Format Toggle */}
            <div className="flex bg-slate-50 p-1 rounded-lg">
              {['png', 'jpeg', 'webp'].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => handleConfigUpdate('fileFormat', fmt)}
                  className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${activeFile.exportConfig.fileFormat === fmt ? 'bg-white shadow-sm text-slate-900 border border-black/5' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {fmt}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Padding Input */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">Padding</label>
                <div className="relative">
                  <input
                    type="number" min="0" max="100"
                    value={activeFile.exportConfig.padding}
                    onChange={(e) => handleConfigUpdate('padding', parseInt(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono font-medium focus:outline-none focus:border-slate-400 transition-colors"
                  />
                  <span className="absolute right-2 top-1.5 text-[10px] text-slate-400">px</span>
                </div>
              </div>
              {/* BG Toggle */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Remove BG</label>
                <div
                  onClick={() => handleConfigUpdate('removeBackground', !activeFile.exportConfig.removeBackground)}
                  className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors duration-200 ${activeFile.exportConfig.removeBackground ? 'bg-slate-800' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${activeFile.exportConfig.removeBackground ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {filesCount > 1 && <div className="w-full h-px bg-slate-100"></div>}

        {/* 5. Batch Tools (Icon Grid) */}
        {filesCount > 1 && (
          <section>
            <div className="flex justify-between items-center mb-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">批量操作 (全部)</label>
              <span className="bg-slate-100 text-slate-400 text-[9px] px-1.5 py-0.5 rounded font-mono">ALL</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              <BatchButton action="ai" icon={SparklesIcon} label="AI" />
              <BatchButton action="scan" icon={WrenchScrewdriverIcon} label="扫描" />
              <BatchButton action="grid" icon={ViewColumnsIcon} label="网格" />
              <BatchButton action="export" icon={ArchiveBoxArrowDownIcon} label="导出" />
              <BatchButton action="clear" icon={TrashIcon} label="清空" />
            </div>

            {/* Pause/Resume & Concurrency Controls */}
            {queueProcessing && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl animate-in fade-in duration-300">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-blue-700">处理中...</span>
                  {onPauseResume && (
                    <button
                      onClick={onPauseResume}
                      className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${isPaused
                          ? 'bg-green-500 text-white hover:bg-green-600'
                          : 'bg-yellow-500 text-white hover:bg-yellow-600'
                        }`}
                    >
                      {isPaused ? (
                        <><PlayCircleIcon className="w-4 h-4 mr-1" /> 继续</>
                      ) : (
                        <><PauseCircleIcon className="w-4 h-4 mr-1" /> 暂停</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Concurrency Control */}
            {onConcurrencyChange && (
              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-500">并发数</label>
                  <span className="text-xs font-bold text-slate-700">{concurrency}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={concurrency}
                  onChange={(e) => onConcurrencyChange(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-slate-800 mt-2"
                />
              </div>
            )}

            {/* Delete Selected */}
            {selectedCount > 0 && onDeleteSelected && (
              <button
                onClick={onDeleteSelected}
                className="mt-3 w-full py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center justify-center transition-colors"
              >
                <TrashIcon className="w-4 h-4 mr-1.5" />
                删除选中 ({selectedCount})
              </button>
            )}
          </section>
        )}

      </div>

      {/* Footer */}
      <div className="p-5 border-t border-slate-100 bg-white">
        <button
          onClick={onExport}
          disabled={activeFile.slices.length === 0 || isProcessing}
          className="w-full py-4 bg-slate-900 hover:bg-black disabled:bg-slate-100 disabled:text-slate-300 text-white rounded-2xl flex items-center justify-center font-bold text-sm shadow-lg shadow-slate-200 transition-all hover:shadow-xl active:scale-[0.98]"
        >
          <ArrowDownTrayIcon className="w-5 h-5 mr-2" />
          导出切片 ({activeFile.slices.length})
        </button>
      </div>
    </div>
  );
};