import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import App from './App';
import SharedLinkResolver from './components/SharedLinkResolver';

const Root: React.FC = () => {
  const location = useLocation();

  if (location.pathname.startsWith('/s/')) {
    return (
      <Routes>
        <Route path="/s/:token" element={<SharedLinkResolver />} />
      </Routes>
    );
  }

  return <App />;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);