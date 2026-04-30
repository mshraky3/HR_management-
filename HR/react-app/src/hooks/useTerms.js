import { useState, useEffect } from 'react';
import { termsAPI } from '../utils/api';

export function useTerms() {
    const [terms, setTerms] = useState([]);
    const [loadingTerms, setLoadingTerms] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                setLoadingTerms(true);
                const res = await termsAPI.getAll();
                if (!cancelled && res.data.success) {
                    setTerms(res.data.data || []);
                }
            } catch {
                // callers handle their own error display
            } finally {
                if (!cancelled) setLoadingTerms(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    return { terms, loadingTerms };
}
