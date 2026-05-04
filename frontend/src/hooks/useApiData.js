import { useState, useEffect, useRef } from 'react';

/**
 * Hook generic pentru fetch + auto-refresh.
 * 
 * @param {Function} fetchFn - Funcția care face fetch (din services/api.js)
 * @param {Object} options - Opțiuni:
 *   - refreshMs: cât de des să facă refresh (default 5000)
 *   - enabled: dacă să facă fetch (default true)
 *   - deps: array de dependencies care declanșează re-fetch
 * @returns {Object} { data, loading, error, refresh }
 */
export function useApiData(fetchFn, options = {}) {
  const { refreshMs = 5000, enabled = true, deps = [] } = options;
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Folosim ref ca să avem mereu ultima versiune a fetchFn fără să declanșăm re-renders
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;
  
  const fetchData = async () => {
    try {
      const result = await fetchFnRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      console.error('API error:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    
    // Fetch inițial
    fetchData();
    
    // Setup auto-refresh
    if (refreshMs > 0) {
      const intervalId = setInterval(fetchData, refreshMs);
      return () => clearInterval(intervalId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refreshMs, ...deps]);
  
  return {
    data,
    loading,
    error,
    refresh: fetchData,
  };
}