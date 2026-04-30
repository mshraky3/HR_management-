import { useState, useEffect } from 'react';
import { branchesAPI } from '../utils/api';

export function useBranches(options = { is_active: true }) {
    const [branches, setBranches] = useState([]);
    const [loadingBranches, setLoadingBranches] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                setLoadingBranches(true);
                const res = await branchesAPI.getAll(options);
                if (!cancelled && res.data.success) {
                    setBranches(res.data.data || []);
                }
            } catch {
                // callers handle their own error display
            } finally {
                if (!cancelled) setLoadingBranches(false);
            }
        };
        load();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { branches, loadingBranches };
}
