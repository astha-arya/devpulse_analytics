import { useState } from 'react';
import { linkService } from '../services/linkService';
import toast from 'react-hot-toast';
import { Link as LinkIcon, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface CreateLinkFormProps {
  onSuccess: () => void;
}

export default function CreateLinkForm({ onSuccess }: CreateLinkFormProps) {
  const [originalUrl, setOriginalUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  
  // Phase 1 - New Fields
  const [expiresAt, setExpiresAt] = useState('');
  const [maxClicks, setMaxClicks] = useState('');
  const [password, setPassword] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!originalUrl) {
      toast.error('Please enter a URL');
      return;
    }

    setLoading(true);
    try {
      await linkService.shorten({
        originalUrl,
        customAlias: customAlias || undefined,
        expiresAt: expiresAt || undefined,
        maxClicks: maxClicks ? Number(maxClicks) : undefined,
        password: password || undefined,
      });
      
      toast.success('Link created successfully!');
      
      // Reset form
      setOriginalUrl('');
      setCustomAlias('');
      setExpiresAt('');
      setMaxClicks('');
      setPassword('');
      setShowAdvanced(false);
      
      onSuccess();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to create link';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
        <LinkIcon className="w-6 h-6 mr-2 text-blue-600" />
        Create New Short Link
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="originalUrl" className="block text-sm font-medium text-gray-700 mb-1">
            Original URL <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            id="originalUrl"
            value={originalUrl}
            onChange={(e) => setOriginalUrl(e.target.value)}
            placeholder="https://example.com/very-long-url"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
            required
          />
        </div>
        
        <div>
          <label htmlFor="customAlias" className="block text-sm font-medium text-gray-700 mb-1">
            Custom Alias <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            id="customAlias"
            value={customAlias}
            onChange={(e) => setCustomAlias(e.target.value)}
            placeholder="my-custom-link"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        {/* Advanced Options Toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center text-sm text-blue-600 hover:text-blue-700 transition-colors focus:outline-none"
        >
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4 mr-1" />
          ) : (
            <ChevronDown className="w-4 h-4 mr-1" />
          )}
          {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
        </button>

        {/* Advanced Options Panel */}
        {showAdvanced && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div>
              <label htmlFor="expiresAt" className="block text-sm font-medium text-gray-700 mb-1">
                Expires at <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="datetime-local"
                id="expiresAt"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-500">Link will stop working after this date & time.</p>
            </div>

            <div>
              <label htmlFor="maxClicks" className="block text-sm font-medium text-gray-700 mb-1">
                Max clicks <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                id="maxClicks"
                min="1"
                value={maxClicks}
                onChange={(e) => setMaxClicks(e.target.value)}
                placeholder="e.g. 100"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-500">Link expires after this many total clicks.</p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password protection <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for no password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-500">Visitors must enter this password before being redirected.</p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            'Create Short Link'
          )}
        </button>
      </form>
    </div>
  );
}