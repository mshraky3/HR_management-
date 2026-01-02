import React from 'react';
import getBranchColor from '../utils/branchColors';
import './BranchBadge.css';

const BranchBadge = ({ branch, size = 18, showName = false }) => {
    const key = branch?.id ?? branch?.branch_name ?? branch ?? '';
    const color = getBranchColor(key);
    const initials = (branch?.branch_name || String(branch)).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

    const style = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px'
    };

    const swatchStyle = {
        width: size,
        height: size,
        borderRadius: size > 16 ? 4 : 3,
        backgroundColor: color.bg,
        color: color.textColor,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(10, Math.floor(size / 2.2)),
        fontWeight: 700,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
    };

    return (
        <span style={style} className="branch-badge-inline">
            <span className="branch-badge-swatch" style={swatchStyle} title={branch?.branch_name || String(branch)}>
                {initials}
            </span>
            {showName && <span className="branch-badge-name">{branch.branch_name || branch}</span>}
        </span>
    );
};

export default BranchBadge;
