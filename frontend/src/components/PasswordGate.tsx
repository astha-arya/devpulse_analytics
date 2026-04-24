import { useState, FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Lock, Link as LinkIcon, Loader2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5001";

export default function PasswordGate() {
  const { shortId } = useParams<{ shortId: string }>();

  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter a password.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      // FIXED API ROUTE: Matches your urlRoutes.js structure
      const res = await fetch(`${API_BASE}/api/${shortId}/verify${window.location.search}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.status === 410) {
        setIsExpired(true);
        return;
      }

      if (res.status === 401) {
        setError("Incorrect password. Please try again.");
        return;
      }

      if (!res.ok) {
        setError(data.error || data.message || "Something went wrong.");
        return;
      }

      // Success — send the user to their destination
      window.location.href = data.originalUrl;
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isExpired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-500 mb-4">
            <LinkIcon className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            This link has expired
          </h1>
          <p className="text-gray-500">
            The link you're trying to visit is no longer active or has reached its click limit.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Password Protected
            </h1>
            <p className="text-sm text-gray-500">
              This link requires a password to access.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="gate-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="gate-password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Access Link →"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-400">
          Powered by <span className="font-semibold text-blue-600">DevPulse</span>
        </p>
      </div>
    </div>
  );
}