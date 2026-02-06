import React, { useEffect, useRef, useState, forwardRef, useCallback } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { Loader2, ChevronLeft, ChevronRight, Maximize, Minimize, Grid3X3, Play, Pause } from 'lucide-react';

interface BookViewerProps {
  pdfDocument: any;
  onFlip: (pageIndex: number) => void;
  onBookInit: (book: any) => void;
  autoPlay?: boolean; // Preview mode - auto flip pages
}

const PAGE_WIDTH = 550;
const PAGE_HEIGHT = 733;

// Page flip sound using Web Audio API (no external files needed)
let audioContext: AudioContext | null = null;

const playFlipSound = () => {
  try {
    // Create AudioContext on first use
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    // Resume if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Create a realistic page flip sound
    const duration = 0.15;
    const now = audioContext.currentTime;
    
    // White noise for paper rustling
    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      // Shaped noise - starts loud, fades quickly
      const envelope = Math.pow(1 - i / bufferSize, 2);
      data[i] = (Math.random() * 2 - 1) * envelope * 0.3;
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    
    // Filter for paper-like sound
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.5;
    
    // Gain control
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    
    noise.start(now);
    noise.stop(now + duration);
  } catch (e) {
    // Silent fail
  }
};

// No-op for compatibility
const initSoundSystem = () => {};
const soundSystemReady = true;

// Page Component - Realistic book page with subtle texture
const Page = forwardRef<HTMLDivElement, { number: number; pdfDocument: any }>(
  ({ number, pdfDocument }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [rendered, setRendered] = useState(false);

    useEffect(() => {
      if (!pdfDocument || !canvasRef.current || rendered) return;

      const render = async () => {
        try {
          const page = await pdfDocument.getPage(number);
          const viewport = page.getViewport({ scale: 2.5 });
          const canvas = canvasRef.current!;
          const ctx = canvas.getContext('2d')!;
          
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          await page.render({ canvasContext: ctx, viewport }).promise;
          setRendered(true);
        } catch (e) {
          console.error('Page render error:', e);
        }
      };

      render();
    }, [pdfDocument, number, rendered]);

    return (
      <div 
        ref={ref} 
        className="page-realistic"
        style={{ 
          width: PAGE_WIDTH, 
          height: PAGE_HEIGHT, 
          background: '#fff',
          boxShadow: 'inset -2px 0 5px rgba(0,0,0,0.05)'
        }}
      >
        {!rendered && (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <Loader2 className="animate-spin text-gray-300" size={24} />
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: rendered ? 'block' : 'none' }}
        />
      </div>
    );
  }
);

Page.displayName = 'Page';

// Main BookViewer
const BookViewer: React.FC<BookViewerProps> = ({ pdfDocument, onFlip, onBookInit, autoPlay = false }) => {
  const [pages, setPages] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [baseScale, setBaseScale] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(autoPlay);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const bookRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null);
  const scaleRef = useRef(1);
  
  const scale = baseScale * (zoomLevel / 100);
  scaleRef.current = scale;

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Calculate base scale to fit screen - only on true resize, not during flips
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout | null = null;
    
    const updateScale = () => {
      const w = window.innerWidth - 120;
      const h = window.innerHeight - 180;
      const scaleX = w / (PAGE_WIDTH * 2);
      const scaleY = h / PAGE_HEIGHT;
      const newScale = Math.min(scaleX, scaleY, 1.3);
      setBaseScale(newScale);
    };
    
    // Debounced resize handler to prevent flickering during animations
    const handleResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateScale, 100);
    };
    
    // Initial calculation
    updateScale();
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, []);

  // Initialize pages
  useEffect(() => {
    const initBook = async () => {
      if (!pdfDocument) {
        setError('No PDF document provided');
        setLoading(false);
        return;
      }

      try {
        setLoadingText('Loading pages...');
        
        if (!pdfDocument.numPages || pdfDocument.numPages < 1) {
          throw new Error('PDF has no pages');
        }

        const nums = Array.from({ length: pdfDocument.numPages }, (_, i) => i + 1);
        setPages(nums);
        
        setLoadingText('Preparing viewer...');
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        setLoading(false);
        console.log(`BookViewer ready: ${pdfDocument.numPages} pages`);
      } catch (err: any) {
        console.error('BookViewer init error:', err);
        setError(err.message || 'Failed to load book');
        setLoading(false);
      }
    };

    initBook();
  }, [pdfDocument]);

  // Auto-play mode - flip pages automatically
  useEffect(() => {
    if (isAutoPlaying && !loading && pages.length > 0) {
      autoPlayRef.current = setInterval(() => {
        const pageFlip = bookRef.current?.pageFlip();
        if (pageFlip) {
          const current = pageFlip.getCurrentPageIndex();
          const total = pageFlip.getPageCount();
          
          playFlipSound();
          
          if (current < total - 1) {
            pageFlip.flipNext();
          } else {
            pageFlip.turnToPage(0);
          }
        }
      }, 3500);
    }

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
    };
  }, [isAutoPlaying, loading, pages.length]);

  // Initialize sounds on mount (preload)
  useEffect(() => {
    initSoundSystem();
  }, []);

  const flipPrev = useCallback(() => {
    // Initialize sounds on first click
    if (!soundSystemReady) {
      initSoundSystem();
    }
    
    const pageFlip = bookRef.current?.pageFlip();
    if (pageFlip) {
      // Play sound immediately with flip
      playFlipSound();
      pageFlip.flipPrev();
    }
  }, []);

  const flipNext = useCallback(() => {
    // Initialize sounds on first click
    if (!soundSystemReady) {
      initSoundSystem();
    }
    
    const pageFlip = bookRef.current?.pageFlip();
    if (pageFlip) {
      // Play sound immediately with flip
      playFlipSound();
      pageFlip.flipNext();
    }
  }, []);

  const handleFlip = useCallback((e: any) => {
    // Sound already played - just update state
    setCurrentPage(e.data);
    onFlip(e.data);
  }, [onFlip]);

  // Error state
  if (error) {
    return (
      <div className="df-container w-full h-full flex items-center justify-center" style={{ background: 'rgb(243, 240, 252)' }}>
        <div className="text-center">
          <div className="text-red-500 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-gray-700 font-medium">Failed to load book</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Still loading or no pages
  if (!pdfDocument || pages.length === 0 || loading) {
    return (
      <div className="df-container w-full h-full flex items-center justify-center" style={{ background: 'rgb(243, 240, 252)' }}>
        <div className="text-center">
          <Loader2 className="animate-spin text-gray-500 mx-auto mb-3" size={40} />
          <p className="text-gray-600 text-sm">{loadingText}</p>
        </div>
      </div>
    );
  }

  const totalPages = pages.length;


  return (
    <div 
      ref={containerRef}
      className="df-container w-full h-full flex flex-col" 
      style={{ 
        background: isFullscreen ? '#1a1a1a' : 'rgb(243, 240, 252)',
        touchAction: 'pan-x pan-y' // Prevent pinch-zoom on mobile
      }}
      onWheel={(e) => {
        // Prevent Ctrl+scroll zoom
        if (e.ctrlKey) {
          e.preventDefault();
        }
      }}
    >
      {/* Main Book Area */}
      <div className="flex-1 relative flex items-center justify-center">
        {/* Left Navigation */}
        <button
          onClick={flipPrev}
          onMouseDown={(e) => e.preventDefault()} // Prevent focus change
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-black/20 hover:text-black/50 transition-all z-20 rounded-full hover:bg-black/5"
          title="Previous Page"
        >
          <ChevronLeft size={32} />
        </button>

        {/* The Book - Clean, no frame */}
        <div 
          className="relative book-3d-container"
          style={{ 
            transform: `scale(${scale})`, 
            transformOrigin: 'center center'
          }}
        >
          <HTMLFlipBook
            width={PAGE_WIDTH}
            height={PAGE_HEIGHT}
            size="fixed"
            minWidth={PAGE_WIDTH}
            maxWidth={PAGE_WIDTH}
            minHeight={PAGE_HEIGHT}
            maxHeight={PAGE_HEIGHT}
            showCover={true}
            maxShadowOpacity={0.5}
            mobileScrollSupport={true}
            onFlip={handleFlip}
            ref={(el: any) => {
              bookRef.current = el;
              if (el) onBookInit(el);
            }}
            className="book-3d-flip"
            style={{ boxShadow: '0 5px 30px rgba(0,0,0,0.2)' }}
            startPage={0}
            flippingTime={800}  // Match dflip's duration: 800ms
            usePortrait={false}
            drawShadow={true}
            startZIndex={0}
            autoSize={false}
            clickEventForward={false}
            useMouseEvents={true}
            swipeDistance={0}
            showPageCorners={false}
            disableFlipByClick={true}
          >
            {pages.map((num) => (
              <Page key={num} number={num} pdfDocument={pdfDocument} />
            ))}
          </HTMLFlipBook>
        </div>

        {/* Right Navigation */}
        <button
          onClick={flipNext}
          onMouseDown={(e) => e.preventDefault()} // Prevent focus change
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-black/20 hover:text-black/50 transition-all z-20 rounded-full hover:bg-black/5"
          title="Next Page"
        >
          <ChevronRight size={32} />
        </button>
      </div>

      {/* Bottom Controls - Black Bar */}
      <div 
        className="h-12 mx-auto mb-4 flex items-center justify-center gap-2 px-5 rounded-full"
        style={{
          background: 'linear-gradient(180deg, #3a3a3a 0%, #2a2a2a 50%, #1a1a1a 100%)',
          boxShadow: '0 2px 15px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
        }}
      >
        {/* Page Info */}
        <span className="text-white text-sm font-medium px-2">{currentPage + 1}/{totalPages}</span>

        {/* Divider */}
        <div className="w-px h-5 bg-white/20" />

        {/* Thumbnails */}
        <button className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors">
          <Grid3X3 size={18} />
        </button>

        {/* Auto-play toggle */}
        <button 
          onClick={() => {
            if (!soundSystemReady) initSoundSystem();
            setIsAutoPlaying(!isAutoPlaying);
          }}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${isAutoPlaying ? 'text-white bg-white/20' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
          title={isAutoPlaying ? 'Pause auto-flip' : 'Start auto-flip'}
        >
          {isAutoPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>

        {/* Zoom Slider - prevent scroll/wheel from changing value */}
        <div className="flex items-center gap-2 px-2">
          <span className="text-white/50 text-xs">-</span>
          <input
            type="range"
            min="50"
            max="150"
            value={zoomLevel}
            onChange={(e) => {
              const newValue = Number(e.target.value);
              // Only update if value actually changed (prevents accidental triggers)
              if (newValue !== zoomLevel) {
                setZoomLevel(newValue);
              }
            }}
            onWheel={(e) => { e.preventDefault(); e.stopPropagation(); }} // Prevent scroll from changing zoom
            onKeyDown={(e) => { e.preventDefault(); e.stopPropagation(); }} // Prevent keyboard from changing zoom
            tabIndex={-1} // Prevent tab focus
            className="w-20 h-1 bg-white/20 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-3
              [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:bg-white
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:shadow-md
              [&::-moz-range-thumb]:w-3
              [&::-moz-range-thumb]:h-3
              [&::-moz-range-thumb]:bg-white
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:border-0
              [&::-moz-range-thumb]:cursor-pointer"
            title={`Zoom: ${zoomLevel}%`}
          />
          <span className="text-white/50 text-xs">+</span>
        </div>

        {/* Fullscreen */}
        <button 
          onClick={toggleFullscreen}
          className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${isFullscreen ? 'text-white bg-white/20' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </div>
    </div>
  );
};

export default BookViewer;
