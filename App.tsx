import React, { useState, useCallback } from 'react';
import JSZip from 'jszip';
import DropZone from './components/DropZone';
import GridPreview from './components/GridPreview';
import { sliceImage } from './services/imageProcessing';
import { generateStickerLabels } from './services/geminiService';
import { StickerSegment, ProcessingStatus } from './types';
import { Sparkles, Grid3X3, Layers } from 'lucide-react';

const App: React.FC = () => {
  const [segments, setSegments] = useState<StickerSegment[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [error, setError] = useState<string | null>(null);

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
      // We process AI in parallel with displaying the initial grid
      // so the user sees the images immediately while labels load.
      generateStickerLabels(file)
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
          // Don't block usage, just keep default labels
          setStatus('complete');
          setSegments(prev => prev.map(s => ({ ...s, isProcessing: false })));
        });

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while processing the image.');
      setStatus('error');
    }
  }, []);

  const handleUpdateLabel = (id: number, newLabel: string) => {
    setSegments(prev => prev.map(seg => 
      seg.id === id ? { ...seg, label: newLabel } : seg
    ));
  };

  const handleDownload = async () => {
    if (segments.length === 0) return;

    const zip = new JSZip();
    
    // Create a folder (optional, usually zip root is fine, let's keep it clean)
    segments.forEach((seg) => {
        // Ensure valid filename
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
             <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4" /> 4x4 Split
             </span>
             <span className="w-px h-4 bg-slate-300 mx-1 hidden sm:block"></span>
             <span className="flex items-center gap-1.5 hidden sm:flex">
                <Sparkles className="w-4 h-4 text-indigo-500" /> Auto-Tagging
             </span>
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
                <button 
                    onClick={handleReset}
                    className="px-4 py-2 bg-white border border-red-200 text-red-600 font-medium rounded-lg hover:bg-red-50 transition-colors"
                >
                    Try Again
                </button>
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
