import { useState, useEffect } from 'react';
import { branchesAPI } from '../utils/api';

export function useBranches(options = { is_active: true }) {
    const [branches, setBranches] = useState([]);
    const [loadingBranches, setLoadingBranches] = useState(false);

    // Serialize options so the effect re-runs when options change,
    // without requiring callers to memoize the object reference.
    const optionsKey = JSON.stringify(options);

    useEffect(() => {
        const currentOptions = JSON.parse(optionsKey);
        let cancelled = false;
        const load = async () => {
            try {
                setLoadingBranches(true);
                const res = await branchesAPI.getAll(currentOptions);
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
    }, [optionsKey]);

    return { branches, loadingBranches };
}
