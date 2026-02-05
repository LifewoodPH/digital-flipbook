import React, { useState, useRef, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { GoogleGenAI } from "@google/genai";
import { CheckCircle2, AlertCircle } from 'lucide-react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Home from './components/Home';
import Upload from './components/Upload';
import BookViewer from './components/BookViewer';
import Controls from './components/Controls';
import Library from './components/Library';
import LibraryActionModal from './components/LibraryActionModal';
import UploadCategoryModal from './components/UploadCategoryModal';
import FeaturedCarousel from './components/FeaturedCarousel';
import LandingPage from './components/LandingPage';
import { getDocument } from './utils/pdfUtils';
import { BookRef, LibraryBook, BookCategory } from './types';
import type { LibraryFilter } from './components/Sidebar';

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [darkMode, setDarkMode] = useState(true); // Start in dark mode for home
  const [homeVariant, setHomeVariant] = useState<1 | 2>(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [readerMode, setReaderMode] = useState<'manual' | 'preview'>('manual');
  const [books, setBooks] = useState<LibraryBook[]>([]); 
  const [selectedBook, setSelectedBook] = useState<LibraryBook | null>(null);
  const [pendingBook, setPendingBook] = useState<LibraryBook | null>(null);
  const [uploadedBooksPending, setUploadedBooksPending] = useState<LibraryBook[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [conversionToast, setConversionToast] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isLoadingBook, setIsLoadingBook] = useState(false);
  
  const bookRef = useRef<BookRef | null>(null);
  
  // Derive current view and filter from route
  const getCurrentView = (): 'home' | 'upload' | 'library' | 'reader' => {
    if (location.pathname === '/' || location.pathname === '/home') return 'home';
    if (location.pathname === '/upload') return 'upload';
    if (location.pathname.startsWith('/reader')) return 'reader';
    return 'library';
  };
  
  const getCurrentFilter = (): LibraryFilter => {
    if (location.pathname === '/favorites') return 'favorites';
    if (location.pathname === '/philippines') return 'philippines';
    if (location.pathname === '/internal') return 'internal';
    if (location.pathname === '/international') return 'international';
    if (location.pathname === '/ph-interns') return 'ph_interns';
    return 'all';
  };
  
  const view = getCurrentView();
  const libraryFilter = getCurrentFilter();

  const extractCover = async (doc: any): Promise<string> => {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;
    
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const handleFilesSelect = async (selectedFiles: File[]) => {
    const total = selectedFiles.length;
    if (total === 0) return;

    try {
      const newBooks: LibraryBook[] = [];
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setLoadingStatus(`Importing Book ${i + 1} of ${total}...`);
        
        const doc = await getDocument(file);
        const coverUrl = await extractCover(doc);
        
        newBooks.push({
          id: Math.random().toString(36).substr(2, 9) + Date.now(),
          name: file.name,
          doc: doc,
          coverUrl: coverUrl,
          totalPages: doc.numPages
        });
      }

      setLoadingStatus(null);
      setSidebarOpen(false);
      
      // Add books to library first
      setBooks(prev => [...prev, ...newBooks]);
      
      // Queue all books for category selection (one by one)
      if (newBooks.length > 0) {
        setUploadedBooksPending(newBooks);
      }
      
    } catch (error) {
      console.error("Failed to load PDF", error);
      setLoadingStatus(null);
      setConversionToast("Conversion failed. Please ensure your files are valid PDFs and try again.");
      setTimeout(() => setConversionToast(null), 5000);
    }
  };

  const handleUploadCategoryConfirm = (bookId: string, category?: BookCategory, isFavorite?: boolean) => {
    // Update the book with category
    setBooks(prev => prev.map(book => 
      book.id === bookId 
        ? { ...book, category, isFavorite: isFavorite || false }
        : book
    ));
    
      // Remove this book from pending queue and show next
      setUploadedBooksPending(prev => {
        const remaining = prev.slice(1);
        if (remaining.length === 0) {
          // All books categorized, go to library
          navigate('/library');
          setConversionToast(
            prev.length === 1 
              ? "Your flipbook has been added to the library!" 
              : "All flipbooks have been added to the library!"
          );
          setTimeout(() => setConversionToast(null), 4000);
        }
        return remaining;
      });
    };

  const handleRemoveBook = (bookId: string) => {
    setBooks(prev => prev.filter(b => b.id !== bookId));
    if (pendingBook?.id === bookId) setPendingBook(null);
  };

  const handleSummarize = async (bookId: string): Promise<string | null> => {
    const book = books.find(b => b.id === bookId);
    if (!book || !book.doc) return null;

    setIsSummarizing(true);
    try {
      let sampleText = "";
      for (let i = 1; i <= Math.min(3, book.totalPages); i++) {
        const page = await book.doc.getPage(i);
        const textContent = await page.getTextContent();
        sampleText += textContent.items.map((item: any) => item.str).join(" ") + " ";
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Provide a extremely concise one-sentence hook/summary (under 25 words) for a book based on this extracted text. Make it sound professional and intriguing: ${sampleText.substring(0, 2000)}`,
      });

      return response.text?.trim() || "No summary available.";
    } catch (err) {
      console.error("AI Summarization failed", err);
      return null;
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleUpdateSummary = (bookId: string, summary: string) => {
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, summary: summary } : b));
    if (pendingBook?.id === bookId) {
      setPendingBook(prev => prev ? { ...prev, summary: summary } : null);
    }
  };

  const handleUpdateBookCategory = (bookId: string, category?: import('./types').BookCategory) => {
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, category } : b));
    if (pendingBook?.id === bookId) {
      setPendingBook(prev => prev ? { ...prev, category } : null);
    }
  };

  const handleToggleFavorite = (bookId: string) => {
    setBooks(prev => prev.map(b => b.id === bookId ? { ...b, isFavorite: !b.isFavorite } : b));
    if (pendingBook?.id === bookId) {
      setPendingBook(prev => prev ? { ...prev, isFavorite: !prev.isFavorite } : null);
    }
  };

  const handleSelectMode = async (mode: 'manual' | 'preview') => {
    if (!pendingBook) return;
    
    // Show loading state
    setIsLoadingBook(true);
    setReaderMode(mode);
    
    try {
      // Quick validation that PDF is accessible
      const doc = pendingBook.doc;
      await doc.getPage(1); // Just verify first page loads
      
      // Set view immediately - BookViewer will handle the detailed loading
      setSelectedBook(pendingBook);
      setPendingBook(null);
      setCurrentPage(0);
      setZoomLevel(1);
      navigate(`/reader/${pendingBook.id}`);
      
      // Small delay for transition
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('Error loading book:', error);
      setConversionToast('Failed to load book. Please try again.');
      setTimeout(() => setConversionToast(null), 4000);
    } finally {
      setIsLoadingBook(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (view !== 'reader') return;
        if (e.key === 'ArrowRight') bookRef.current?.pageFlip()?.flipNext();
        if (e.key === 'ArrowLeft') bookRef.current?.pageFlip()?.flipPrev();
        if (e.key === 'Escape') { navigate('/library'); setSelectedBook(null); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, navigate]);

  const isLandingPage = location.pathname === '/landing';

  return (
    <div className={`flex h-screen w-full overflow-hidden font-sans transition-colors duration-300 ${darkMode ? 'bg-[#0D0D0F] text-white' : 'bg-[#F5F5F7] text-gray-900'}`}>
      {/* Sidebar - Shared across views except reader (optional) */}
      {view !== 'reader' && !isLandingPage && (
        <Sidebar 
          currentView={view} 
          currentFilter={libraryFilter}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(prev => !prev)}
          isMobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col relative overflow-hidden">
        {!isLandingPage && <Header 
          view={view}
          darkMode={darkMode}
          homeVariant={homeVariant}
          onToggleHomeVariant={() => setHomeVariant(prev => prev === 1 ? 2 : 1)}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          fileName={selectedBook?.name} 
        />}

        <main className={`flex-1 relative w-full h-full ${isLandingPage ? '' : 'pt-16'} overflow-y-auto no-scrollbar ${darkMode ? 'bg-[#0D0D0F]' : 'bg-[#F5F5F7]'}`}>
          <Routes>
            {/* 3D Landing Page Route */}
            <Route path="/landing" element={<LandingPage />} />

            {/* Home Route */}
            <Route path="/" element={
              <Home 
                books={books}
                darkMode={darkMode}
                variant={homeVariant}
                onUpload={() => navigate('/upload')}
                onBrowseLibrary={() => navigate('/library')}
                onSelectBook={(b) => setPendingBook(b)}
              />
            } />
            
            <Route path="/home" element={<Navigate to="/" replace />} />

            {/* Upload Route */}
            <Route path="/upload" element={
              <Upload 
                onFilesSelect={handleFilesSelect} 
                onBack={() => navigate('/library')}
                isLoading={!!loadingStatus} 
                statusMessage={loadingStatus || ""} 
                darkMode={darkMode}
              />
            } />

            {/* Library Routes */}
            <Route path="/library" element={
              <div className="animate-in fade-in duration-700">
                {books.length > 0 && libraryFilter === 'all' && (
                  <FeaturedCarousel books={books.slice(0, 5)} darkMode={darkMode} />
                )}
                <Library 
                  books={books} 
                  filter={libraryFilter}
                  darkMode={darkMode}
                  onSelectBook={(b) => setPendingBook(b)} 
                  onAddNew={() => navigate('/upload')}
                  onRemoveBook={handleRemoveBook}
                />
              </div>
            } />

            <Route path="/favorites" element={
              <Library 
                books={books} 
                filter="favorites"
                darkMode={darkMode}
                onSelectBook={(b) => setPendingBook(b)} 
                onAddNew={() => navigate('/upload')}
                onRemoveBook={handleRemoveBook}
              />
            } />

            <Route path="/philippines" element={
              <Library 
                books={books} 
                filter="philippines"
                darkMode={darkMode}
                onSelectBook={(b) => setPendingBook(b)} 
                onAddNew={() => navigate('/upload')}
                onRemoveBook={handleRemoveBook}
              />
            } />

            <Route path="/internal" element={
              <Library 
                books={books} 
                filter="internal"
                darkMode={darkMode}
                onSelectBook={(b) => setPendingBook(b)} 
                onAddNew={() => navigate('/upload')}
                onRemoveBook={handleRemoveBook}
              />
            } />

            <Route path="/international" element={
              <Library 
                books={books} 
                filter="international"
                darkMode={darkMode}
                onSelectBook={(b) => setPendingBook(b)} 
                onAddNew={() => navigate('/upload')}
                onRemoveBook={handleRemoveBook}
              />
            } />

            <Route path="/ph-interns" element={
              <Library 
                books={books} 
                filter="ph_interns"
                darkMode={darkMode}
                onSelectBook={(b) => setPendingBook(b)} 
                onAddNew={() => navigate('/upload')}
                onRemoveBook={handleRemoveBook}
              />
            } />

            {/* Reader Route */}
            <Route path="/reader/:bookId" element={
              selectedBook && (
            <div className="w-full h-full min-h-0 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-700 overflow-hidden relative">
              {/* Apple-Style Clean Background - Black & White Theme */}
              <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-gray-100">
                {/* Subtle radial gradient for depth */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.02),transparent_70%)]" />
              </div>
              
              {/* Minimal Ambient Orbs - Grayscale */}
              <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-gray-200/20 rounded-full blur-[120px] pointer-events-none" />
              <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-gray-300/15 rounded-full blur-[100px] pointer-events-none" />
              
              {/* Fine Texture Overlay */}
              <div 
                className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-multiply"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
              />
              
              {/* Progress Bar Above Book - Apple Style */}
              <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 w-full max-w-3xl px-8">
                <div className="bg-white/90 backdrop-blur-xl rounded-full shadow-lg border border-gray-200 p-1">
                  <div className="relative h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-gray-800 to-gray-600 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${((currentPage + 1) / selectedBook.totalPages) * 100}%` }}
                    />
                  </div>
                  {/* Book Title Below Progress */}
                  <div className="mt-2 text-center">
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {selectedBook.name.replace('.pdf', '')}
                    </p>
                  </div>
                </div>
              </div>
              
              {readerMode === 'preview' && (
                <div className="absolute top-36 left-1/2 -translate-x-1/2 z-10 bg-gray-900/90 backdrop-blur-xl text-white px-5 py-2.5 rounded-full text-[10px] font-bold tracking-[0.15em] uppercase flex items-center gap-2 border border-gray-700 shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  Preview Mode
                </div>
              )}

              {/* Book container - perfectly centered */}
              <div className="relative z-10 flex-1 flex items-center justify-center w-full">
                <BookViewer 
                  pdfDocument={selectedBook.doc} 
                  onFlip={setCurrentPage}
                  onBookInit={(b) => bookRef.current = { pageFlip: () => b.pageFlip() }}
                  mode={readerMode}
                  zoomLevel={zoomLevel}
                  onZoomChange={setZoomLevel}
                />
              </div>
              
              {/* Controls below the book */}
              {readerMode === 'manual' && (
                <div className="relative z-20 pb-6">
                  <Controls 
                    currentPage={currentPage} 
                    totalPages={selectedBook.totalPages} 
                    zoomLevel={zoomLevel}
                    onZoomChange={setZoomLevel}
                    onNext={() => bookRef.current?.pageFlip()?.flipNext()} 
                    onPrev={() => bookRef.current?.pageFlip()?.flipPrev()}
                    onFullscreen={() => !document.fullscreenElement ? document.documentElement.requestFullscreen() : document.exitFullscreen()}
                  />
                </div>
              )}

              {readerMode === 'preview' && (
                <button 
                  onClick={() => setReaderMode('manual')}
                  className="relative z-20 mb-8 bg-white/90 backdrop-blur-xl text-black px-10 py-4 rounded-full font-bold text-sm shadow-2xl hover:bg-white transition-all active:scale-95 border border-white/50"
                >
                  Start Reading
                </button>
              )}
            </div>
              )
            } />
          </Routes>
        </main>
      </div>

      <LibraryActionModal 
        book={pendingBook}
        onClose={() => setPendingBook(null)}
        onSelectMode={handleSelectMode}
        onSummarize={handleSummarize}
        onApplySummary={handleUpdateSummary}
        onUpdateCategory={handleUpdateBookCategory}
        onToggleFavorite={handleToggleFavorite}
        isSummarizing={isSummarizing}
        isLoadingBook={isLoadingBook}
        onRemove={handleRemoveBook}
      />

      {/* Upload Category Modal - shown after uploading a book */}
      <UploadCategoryModal
        book={uploadedBooksPending[0] || null}
        currentIndex={uploadedBooksPending.length > 0 ? 1 : 0}
        totalBooks={uploadedBooksPending.length}
        onClose={() => {
          setUploadedBooksPending([]);
          navigate('/library');
        }}
        onConfirm={handleUploadCategoryConfirm}
      />

      {/* Conversion success/error toast */}
      {conversionToast && (
        <div 
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border animate-in fade-in slide-in-from-bottom-4 duration-300 ${
            conversionToast.startsWith('Conversion failed') 
              ? darkMode ? 'bg-red-900/80 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-800' 
              : darkMode ? 'bg-gray-800/95 backdrop-blur-xl border-gray-700 text-white' : 'bg-white/95 backdrop-blur-xl border-gray-200 text-gray-900'
          }`}
        >
          {conversionToast.startsWith('Conversion failed') ? (
            <AlertCircle size={24} className="text-red-500 shrink-0" />
          ) : (
            <CheckCircle2 size={24} className="text-green-500 shrink-0" />
          )}
          <span className="font-medium text-sm max-w-md">{conversionToast}</span>
        </div>
      )}
    </div>
  );
};

export default App;