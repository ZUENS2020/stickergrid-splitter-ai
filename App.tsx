import React, { useState, useCallback, useEffect } from 'react';
import JSZip from 'jszip';
import DropZone from './components/DropZone';
import GridPreview from './components/GridPreview';
import { sliceImage } from './services/imageProcessing';
import { generateStickerLabels } from './services/geminiService';
import { StickerSegment, ProcessingStatus } from './types';
import { Sparkles, Grid3X3, Layers, Key, ChevronRight, Lock } from 'lucide-react';

const App: React.FC = () => {
  const [segments, setSegments] = useState<StickerSegment[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  
  // API Key State
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [isCheckingKey, setIsCheckingKey] = useState<boolean>(true);
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [manualKeyInput, setManualKeyInput] = useState<string>('');

  useEffect(() => {
    const checkKey = async () => {
      try {
        // 1. Check Local Storage
        const storedKey = localStorage.getItem('gemini_api_key');
        if (storedKey) {
            setCustomApiKey(storedKey);
            setHasApiKey(true);
            setIsCheckingKey(false);
            return;
        }

        // 2. Check Platform Integration
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
           const hasKey = await window.aistudio.hasSelectedApiKey();
           if (hasKey) {
               setHasApiKey(true);
               setIsCheckingKey(false);
               return;
           }
        } 
        
        // 3. Check Environment Variable
        if (process.env.API_KEY) {
            setHasApiKey(true);
        }

      } catch (e) {
        console.error("Error checking API key:", e);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
      if (window.aistudio) {
          try {
            await window.aistudio.openSelectKey();
            setHasApiKey(true);
          } catch(e) {
              console.error(e);
          }
      }
  };

  const handleManualKeySubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (manualKeyInput.trim().length > 0) {
          const key = manualKeyInput.trim();
          localStorage.setItem('gemini_api_key', key);
          setCustomApiKey(key);
          setHasApiKey(true);
      }
  };

  const clearApiKey = () => {
      localStorage.removeItem('gemini_api_key');
      setCustomApiKey('');
      setHasApiKey(false);
      setManualKeyInput('');
      setStatus('idle');
      setError(null);
  };

  const handleFileSelect = useCallback(async (file: File) => {
    setStatus('slicing');
    setError(null);
    setSegments([]);

    try {
      // 1. Slice Image
      const slicedSegments = await sliceImage(file, 4, 4);
      setSegments(slicedSegments);
      
      setStatus('analyzing');

      // 2. AI Analysis
      generateStickerLabels(file, customApiKey)
        .then((labels) => {
          setSegments(prev => prev.map((seg, idx) => ({
            ...seg,
            label: labels[idx] || seg.label,
            isProcessing: false
          })));
          setStatus('complete');
        })
        .catch(err => {
          console.error("AI Analysis failed", err);
          
          const errorMessage = err?.message || "";
          // Handle Auth Errors
          if (errorMessage.includes("Requested entity was not found") || errorMessage.includes("403") || errorMessage.includes("API Key is missing")) {
             clearApiKey(); // Reset key state
             setError("API Key invalid or expired. Please enter a valid key.");
             setStatus('error'); 
             return;
          }

          // Non-fatal error: just keep default labels
          setStatus('complete');
          setSegments(prev => prev.map(s => ({ ...s, isProcessing: false })));
        });

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while processing the image.');
      setStatus('error');
    }
  }, [customApiKey]);

  const handleUpdateLabel = (id: number, newLabel: string) => {
    setSegments(prev => prev.map(seg => 
      seg.id === id ? { ...seg, label: newLabel } : seg
    ));
  };

  const handleDownload = async () => {
    if (segments.length === 0) return;

    const zip = new JSZip();
    
    segments.forEach((seg) => {
        const safeLabel = seg.label.replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
        zip.file(`${safeLabel}.png`, seg.blob);
    });

    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'stickers-pack.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to generate ZIP file.');
    }
  };

  const handleReset = () => {
    setSegments([]);
    setStatus('idle');
    setError(null);
  };

  // ----------------------------------------------------------------
  // Render: Loading
  // ----------------------------------------------------------------

  if (isCheckingKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // Render: Key Selection Screen
  // ----------------------------------------------------------------

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-100 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Key className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">Configure Gemini API</h2>
              <p className="text-slate-600 mb-8 leading-relaxed">
                  To use the AI auto-tagging feature, please connect your Google Gemini API key.
              </p>
              
              {/* Option 1: Platform Select (if available) */}
              {window.aistudio && (
                <>
                  <button 
                    onClick={handleSelectKey}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 transform active:scale-95 mb-4"
                  >
                      <Sparkles className="w-5 h-5" />
                      <span className="text-lg">Select API Key</span>
                  </button>
                  
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white text-slate-500 font-medium">OR</span>
                    </div>
                  </div>
                </>
              )}

              {/* Option 2: Manual Entry */}
              <form onSubmit={handleManualKeySubmit} className="text-left">
                  <label htmlFor="apiKey" className="block text-sm font-medium text-slate-700 mb-1 ml-1">
                      Enter API Key Manually
                  </label>
                  <div className="relative flex items-center">
                    <input
                        type="password"
                        id="apiKey"
                        value={manualKeyInput}
                        onChange={(e) => setManualKeyInput(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none text-slate-800"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3" />
                    <button 
                        type="submit"
                        disabled={!manualKeyInput}
                        className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-white text-indigo-600 hover:bg-indigo-50 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-200"
                    >
                        Save
                    </button>
                  </div>
              </form>

              <p className="mt-6 text-xs text-slate-400">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline flex items-center justify-center gap-1">
                      Get an API Key <ChevronRight className="w-3 h-3" />
                  </a>
              </p>
          </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // Render: Main App
  // ----------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 backdrop-blur-md bg-white/80">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
                <Grid3X3 className="w-5 h-5" />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-slate-800">
              Sticker<span className="text-indigo-600">Grid</span> AI
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
             {/* Key Status Indicator */}
             <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-xs text-slate-600">API Connected</span>
                {customApiKey && (
                    <button onClick={clearApiKey} className="ml-1 p-0.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-red-500 transition-colors" title="Change Key">
                         <Key className="w-3 h-3" />
                    </button>
                )}
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-12">
        
        {/* Intro / Empty State */}
        {status === 'idle' && (
           <div className="max-w-2xl mx-auto text-center mb-10 animate-in fade-in zoom-in duration-500">
              <h2 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
                Turn Sticker Sheets into <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                    Ready-to-Use Packs
                </span>
              </h2>
              <p className="text-lg text-slate-600 mb-8 max-w-lg mx-auto leading-relaxed">
                Upload a 4x4 image grid. We'll automatically crop it into 16 separate files and use AI to name them instantly.
              </p>
              
              <DropZone onFileSelect={handleFileSelect} disabled={false} />
           </div>
        )}

        {/* Loading State */}
        {(status === 'slicing' || (status === 'analyzing' && segments.length === 0)) && (
           <div className="flex flex-col items-center justify-center py-20 animate-in fade-in">
              <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
              <p className="text-lg font-medium text-slate-700">Processing your image...</p>
              <p className="text-sm text-slate-400 mt-2">Slicing grid and analyzing contents</p>
           </div>
        )}

        {/* Error State */}
        {status === 'error' && (
            <div className="max-w-lg mx-auto mt-10 p-6 bg-red-50 border border-red-200 rounded-xl text-center">
                <FileWarning className="w-10 h-10 text-red-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-red-700">Something went wrong</h3>
                <p className="text-red-600 mt-1 mb-6">{error}</p>
                <div className="flex justify-center gap-3">
                    <button 
                        onClick={handleReset}
                        className="px-4 py-2 bg-white border border-red-200 text-red-600 font-medium rounded-lg hover:bg-red-50 transition-colors"
                    >
                        Try Again
                    </button>
                     {/* Option to change key if error occurred */}
                    <button 
                        onClick={clearApiKey}
                        className="px-4 py-2 bg-red-100 text-red-700 font-medium rounded-lg hover:bg-red-200 transition-colors"
                    >
                        Change API Key
                    </button>
                </div>
            </div>
        )}

        {/* Results Grid */}
        {segments.length > 0 && (status === 'analyzing' || status === 'complete') && (
           <GridPreview 
              segments={segments} 
              onUpdateLabel={handleUpdateLabel}
              onDownloadAll={handleDownload}
              onReset={handleReset}
              isProcessing={status === 'analyzing'}
           />
        )}
      </main>
    </div>
  );
};

// Icon needed for error state
function FileWarning(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      {...props}
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export default App;