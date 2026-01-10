import React from 'react';
import './BranchBadge.css';

const BranchBadge = ({ branch, size = 18, showName = false }) => {
    const style = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px'
    };

    return (
        <span style={style} className="branch-badge-inline">
            {showName && <span className="branch-badge-name">{branch?.branch_name || branch || ''}</span>}
        </span>
    );
};

export default BranchBadge;
