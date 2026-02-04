import React, { useEffect, useRef, useState, forwardRef, useCallback } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { PDFPageProxy } from '../types';
import { Loader2 } from 'lucide-react';

interface BookViewerProps {
  pdfDocument: any;
  onFlip: (pageIndex: number) => void;
  onBookInit: (book: any) => void;
  mode?: 'manual' | 'preview';
  zoomLevel?: number;
  onZoomChange?: (zoom: number) => void;
}

const PAGE_WIDTH = 500;
const PAGE_HEIGHT = 707;

// --- Single Page Component ---
interface PageProps {
  number: number;
  pdfDocument: any;
  onPageLoaded?: () => void;
}

const Page = forwardRef<HTMLDivElement, PageProps>(({ number, pdfDocument, onPageLoaded }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current || isRendered) return;

    const renderPage = async () => {
      try {
        const page: PDFPageProxy = await pdfDocument.getPage(number);
        const originalViewport = page.getViewport({ scale: 1 });
        const desiredScale = PAGE_WIDTH / originalViewport.width;
        
        // Increased multiplier to 4x for extreme zoom levels (10x support)
        // Note: Going higher might cause memory issues on some devices.
        const outputScale = desiredScale * (window.devicePixelRatio || 1) * 4; 
        
        const viewport = page.getViewport({ scale: outputScale });
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        setIsRendered(true);
        onPageLoaded?.();
      } catch (error) {
        console.error(`Error rendering page ${number}`, error);
      }
    };

    renderPage();
  }, [pdfDocument, number, isRendered, onPageLoaded]);

  return (
    <div ref={ref} className="bg-white flex items-center justify-center overflow-hidden h-full w-full">
      <div className="relative w-full h-full bg-white">
        {!isRendered && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <Loader2 className="animate-spin text-gray-300" />
          </div>
        )}
        <canvas ref={canvasRef} className="block mx-auto" />
      </div>
    </div>
  );
});

Page.displayName = 'Page';

// --- Book Component ---

const BookViewer: React.FC<BookViewerProps> = ({ pdfDocument, onFlip, onBookInit, mode = 'manual', zoomLevel = 1, onZoomChange }) => {
  const [pages, setPages] = useState<number[]>([]);
  const [fitScale, setFitScale] = useState(1);
  const [isInitializing, setIsInitializing] = useState(true);
  const [loadedPagesCount, setLoadedPagesCount] = useState(0);
  const bookRef = useRef<any>(null);
  const autoFlipInterval = useRef<number | null>(null);
  
  // Panning State
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // Calculate scale so book fits perfectly in viewport
  useEffect(() => {
    const updateFitScale = () => {
      const availWidth = window.innerWidth - 96;
      const availHeight = window.innerHeight - 220;
      const scaleX = availWidth / (PAGE_WIDTH * 2);
      const scaleY = availHeight / PAGE_HEIGHT;
      const scale = Math.min(scaleX, scaleY);
      setFitScale(Math.max(0.4, Math.min(1.15, scale)));
    };
    updateFitScale();
    window.addEventListener('resize', updateFitScale);
    return () => window.removeEventListener('resize', updateFitScale);
  }, []);

  useEffect(() => {
    if (pdfDocument) {
      const numPages = pdfDocument.numPages;
      const pageNumbers = Array.from({ length: numPages }, (_, i) => i + 1);
      setPages(pageNumbers);
      setIsInitializing(true);
      setLoadedPagesCount(0);
      
      // Wait a bit for pages to start rendering, then hide loading
      const timer = setTimeout(() => {
        setIsInitializing(false);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [pdfDocument]);

  // Handle Preview Mode (Auto-flip)
  useEffect(() => {
    if (mode === 'preview' && bookRef.current) {
      const timer = setTimeout(() => {
        autoFlipInterval.current = window.setInterval(() => {
          const api = bookRef.current.pageFlip();
          const current = api.getCurrentPageIndex();
          const total = api.getPageCount();

          if (current < total - 1) {
            api.flipNext();
          } else {
            if (autoFlipInterval.current) clearInterval(autoFlipInterval.current);
          }
        }, 1200);
      }, 1000);
      
      return () => {
        clearTimeout(timer);
        if (autoFlipInterval.current) clearInterval(autoFlipInterval.current);
      };
    }
  }, [mode, pages.length]);

  // Reset Pan when zoom is 1
  useEffect(() => {
    if (zoomLevel === 1) {
      setPanPosition({ x: 0, y: 0 });
    }
  }, [zoomLevel]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    setIsPanning(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  }, [zoomLevel]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || zoomLevel <= 1) return;
    
    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;
    
    setPanPosition(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }));
    
    setLastMousePos({ x: e.clientX, y: e.clientY });
  }, [isPanning, lastMousePos, zoomLevel]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (onZoomChange) {
      // Toggle between 1x and a significant 4x zoom for detailed viewing
      onZoomChange(zoomLevel > 1.2 ? 1 : 4);
    }
  }, [zoomLevel, onZoomChange]);

  const handlePageLoaded = useCallback(() => {
    setLoadedPagesCount(prev => prev + 1);
  }, []);

  if (!pdfDocument || pages.length === 0) return null;

  const totalPages = pages.length;
  const loadingProgress = totalPages > 0 ? Math.min((loadedPagesCount / Math.min(10, totalPages)) * 100, 100) : 0;

  return (
    <div 
      ref={containerRef}
      className={`relative flex items-center justify-center h-full w-full py-10 fade-in overflow-hidden ${zoomLevel > 1 ? 'cursor-grab' : ''} ${isPanning ? 'cursor-grabbing' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      {/* Loading Overlay - Centered on book */}
      {isInitializing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-gray-100/95 via-gray-200/95 to-gray-300/95 backdrop-blur-sm">
          <div className="text-center">
            {/* Animated Book Icon */}
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl animate-pulse"></div>
              <div className="relative">
                <svg className="w-20 h-20 mx-auto text-blue-600 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
            </div>
            
            {/* Loading Text */}
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Preparing Your Flipbook</h3>
            <p className="text-gray-600 mb-6">Loading pages for smooth reading experience...</p>
            
            {/* Progress Bar */}
            <div className="w-64 mx-auto">
              <div className="h-2 bg-gray-300 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">{Math.round(loadingProgress)}% Complete</p>
            </div>
          </div>
        </div>
      )}
      <div 
        className="transition-transform duration-300 ease-out"
        style={{ 
          transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomLevel * fitScale})`,
          transformOrigin: 'center center'
        }}
      >
        <HTMLFlipBook
          width={PAGE_WIDTH}
          height={PAGE_HEIGHT}
          size="stretch"
          minWidth={300}
          maxWidth={600}
          minHeight={400}
          maxHeight={800}
          maxShadowOpacity={0.5}
          showCover={true} 
          mobileScrollSupport={true}
          onFlip={(e: { data: number }) => onFlip(e.data)}
          ref={(component: any) => {
            bookRef.current = component;
            if (component) onBookInit(component);
          }}
          className="shadow-2xl shadow-black/20"
          startPage={0}
          drawShadow={true}
          flippingTime={800}
          usePortrait={false}
          startZIndex={0}
          autoSize={true}
          clickEventForward={true}
          useMouseEvents={mode === 'manual' && zoomLevel === 1} // Only allow flip on click if not zoomed
          swipeDistance={30}
          showPageCorners={true}
          disableFlipByClick={mode === 'preview' || zoomLevel > 1}
        >
          {pages.map((pageNum) => (
            <Page key={pageNum} number={pageNum} pdfDocument={pdfDocument} onPageLoaded={handlePageLoaded} />
          ))}
        </HTMLFlipBook>
      </div>
    </div>
  );
};

export default BookViewer;