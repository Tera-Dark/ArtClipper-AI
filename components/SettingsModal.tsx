import React, { useState, useEffect } from 'react';
import { AISettings } from '../types';
import { XMarkIcon, CpuChipIcon, CommandLineIcon, GlobeAltIcon, KeyIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, ExclamationCircleIcon, BoltIcon } from '@heroicons/react/24/outline';
import { verifyConnection } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AISettings;
  onSave: (settings: AISettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [formData, setFormData] = useState<AISettings>(settings);
  const [showKey, setShowKey] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (isOpen) {
      setFormData(settings);
      setVerifyStatus('idle');
    }
  }, [isOpen, settings]);

  const handleVerify = async () => {
      setVerifying(true);
      setVerifyStatus('idle');
      try {
          await verifyConnection(formData);
          setVerifyStatus('success');
      } catch (e) {
          setVerifyStatus('error');
      } finally {
          setVerifying(false);
      }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden transform transition-all scale-100 border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center">
            <CpuChipIcon className="w-6 h-6 mr-2 text-primary" />
            API 服务配置
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          
          {/* API Key Section (Restored) */}
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
             <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                <div className="flex items-center"><KeyIcon className="w-4 h-4 mr-1.5 text-blue-500" /> API Key (必需)</div>
                {verifyStatus === 'success' && <span className="text-xs text-green-600 flex items-center font-normal"><CheckCircleIcon className="w-3 h-3 mr-1"/>验证通过</span>}
                {verifyStatus === 'error' && <span className="text-xs text-red-500 flex items-center font-normal"><ExclamationCircleIcon className="w-3 h-3 mr-1"/>验证失败</span>}
             </label>
             <div className="relative">
                 <input 
                    type={showKey ? "text" : "password"}
                    value={formData.apiKey || ''}
                    onChange={(e) => { setFormData({...formData, apiKey: e.target.value}); setVerifyStatus('idle'); }}
                    placeholder="请输入 Gemini API Key"
                    className="w-full pl-4 pr-24 py-3 rounded-lg border border-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-white font-mono text-sm"
                 />
                 <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                     <button 
                        onClick={() => setShowKey(!showKey)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
                        title={showKey ? "隐藏" : "显示"}
                     >
                         {showKey ? <EyeSlashIcon className="w-4 h-4"/> : <EyeIcon className="w-4 h-4"/>}
                     </button>
                     <button
                        onClick={handleVerify}
                        disabled={verifying}
                        className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all flex items-center ${
                            verifying ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                        }`}
                     >
                        {verifying ? <BoltIcon className="w-3 h-3 animate-pulse"/> : "验证"}
                     </button>
                 </div>
             </div>
             <p className="text-[11px] text-slate-400 mt-2">
                 Key 仅保存在本地。没有 Key? <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-500 hover:underline">去申请 &rarr;</a>
             </p>
          </div>

          {/* Base URL Section */}
          <div>
            <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center">
                  <GlobeAltIcon className="w-4 h-4 mr-1.5" />
                  API 服务端点
                </label>
                <div className="flex items-center">
                   <label className="text-xs text-slate-500 mr-2 cursor-pointer select-none" htmlFor="custom-url-toggle">
                       自定义代理
                   </label>
                   <button 
                      id="custom-url-toggle"
                      onClick={() => setFormData({...formData, useCustomUrl: !formData.useCustomUrl})}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${formData.useCustomUrl ? 'bg-primary' : 'bg-slate-200'}`}
                   >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${formData.useCustomUrl ? 'translate-x-4.5' : 'translate-x-1'}`} />
                   </button>
                </div>
            </div>
            
            {formData.useCustomUrl ? (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                    <input
                    type="text"
                    value={formData.baseUrl}
                    onChange={(e) => setFormData({...formData, baseUrl: e.target.value})}
                    placeholder="https://generativelanguage.googleapis.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-slate-700 bg-slate-50 focus:bg-white"
                    />
                    <p className="text-xs text-slate-400 mt-1.5">请输入完整的 API Base URL，通常用于国内中转或代理。</p>
                </div>
            ) : (
                 <div className="text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 flex items-center">
                     <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                     自动连接 Google AI Studio 官方服务
                 </div>
            )}
          </div>

          {/* Model Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center">
              <CpuChipIcon className="w-4 h-4 mr-1.5" />
              模型名称 (Model)
            </label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) => setFormData({...formData, model: e.target.value})}
              placeholder="gemini-3-flash-preview"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-slate-700 bg-slate-50 focus:bg-white font-mono"
            />
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center">
              <CommandLineIcon className="w-4 h-4 mr-1.5" />
              预设提示词 (System Prompt)
            </label>
            <textarea
              value={formData.systemPrompt}
              onChange={(e) => setFormData({...formData, systemPrompt: e.target.value})}
              rows={3}
              placeholder="自定义 AI 的识别逻辑..."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-slate-700 bg-slate-50 focus:bg-white text-sm leading-relaxed"
            />
          </div>
        </div>

        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-end space-x-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-200/50 rounded-xl transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onSave(formData)}
            className="px-8 py-2.5 bg-primary hover:bg-primaryHover text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all transform active:scale-95"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};