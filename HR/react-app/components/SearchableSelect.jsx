import { useState, useRef, useEffect } from 'react';
import './SearchableSelect.css';

const SearchableSelect = ({ value, onChange, options, placeholder = 'اختر...', className = '' }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);
    const inputRef = useRef(null);

    const filtered = search
        ? options.filter(o => o.label.includes(search))
        : options;

    const selectedLabel = options.find(o => o.value.toString() === value?.toString())?.label || '';

    useEffect(() => {
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useEffect(() => {
        if (open && inputRef.current) inputRef.current.focus();
    }, [open]);

    return (
        <div className={`ss-wrap ${className}`} ref={ref}>
            <button
                type="button"
                className={`ss-trigger ${open ? 'ss-open' : ''} ${value ? 'ss-has-value' : ''}`}
                onClick={() => { setOpen(!open); setSearch(''); }}
            >
                <span className="ss-trigger-text">{selectedLabel || placeholder}</span>
                <span className="ss-arrow">{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div className="ss-dropdown">
                    <div className="ss-search-box">
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="ابحث..."
                            className="ss-search-input"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div className="ss-options">
                        {filtered.length === 0 ? (
                            <div className="ss-no-results">لا توجد نتائج</div>
                        ) : (
                            filtered.map(o => (
                                <button
                                    type="button"
                                    key={o.value}
                                    className={`ss-option ${o.value.toString() === value?.toString() ? 'ss-selected' : ''}`}
                                    onClick={() => { onChange(o.value.toString()); setOpen(false); setSearch(''); }}
                                >
                                    {o.label}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
