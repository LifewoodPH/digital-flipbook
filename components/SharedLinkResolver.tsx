import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { resolveShareLink } from '../src/lib/bookStorage';
import SharedCategoryView from './SharedCategoryView';
import SharedBookView from './SharedBookView';

export default function SharedLinkResolver() {
  const { token } = useParams<{ token: string }>();
  const [linkData, setLinkData] = useState<{ linkType: string; target: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(true);
      setLoading(false);
      return;
    }

    resolveShareLink(token)
      .then(data => {
        if (data) setLinkData(data);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0c] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={28} className="animate-spin text-white/40" />
          <span className="text-white/50 text-sm">Loading shared content...</span>
        </div>
      </div>
    );
  }

  if (error || !linkData) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0c] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-white text-lg font-semibold">Link Not Found</h2>
          <p className="text-white/40 text-sm max-w-xs">
            This link may have expired or doesn't exist. Ask the sender for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (linkData.linkType === 'category') {
    return <SharedCategoryView categorySlug={linkData.target} />;
  }

  if (linkData.linkType === 'book') {
    return <SharedBookView bookIdOverride={linkData.target} />;
  }

  return null;
}
