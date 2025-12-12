/**
 * VirtualTable Component
 * High-performance table using react-window for rendering large datasets
 * Only renders visible rows, dramatically improving performance for 1000+ rows
 */

import { memo, useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';

// Memoized row component for performance
const TableRow = memo(({ data, index, style }) => {
  const { items, columns, renderCell, onRowClick, rowClassName } = data;
  const item = items[index];
  
  if (!item) return null;
  
  const className = rowClassName ? rowClassName(item, index) : '';
  
  return (
    <div 
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid #e2e8f0',
        cursor: onRowClick ? 'pointer' : 'default',
        backgroundColor: index % 2 === 0 ? '#fff' : '#f8fafc',
      }}
      className={`virtual-table-row ${className}`}
      onClick={() => onRowClick && onRowClick(item, index)}
    >
      {columns.map((column, colIndex) => (
        <div 
          key={column.key || colIndex}
          style={{
            flex: column.flex || 1,
            minWidth: column.minWidth || 100,
            maxWidth: column.maxWidth,
            padding: '8px 12px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: column.align || 'right',
          }}
        >
          {renderCell ? renderCell(item, column, index) : item[column.key]}
        </div>
      ))}
    </div>
  );
});

TableRow.displayName = 'TableRow';

/**
 * VirtualTable - A virtualized table component for large datasets
 * 
 * @param {Object} props
 * @param {Array} props.data - Array of data items
 * @param {Array} props.columns - Column definitions: { key, label, flex?, minWidth?, maxWidth?, align? }
 * @param {number} props.height - Container height in pixels
 * @param {number} props.rowHeight - Height of each row (default: 48)
 * @param {Function} props.renderCell - Custom cell renderer (item, column, rowIndex) => ReactNode
 * @param {Function} props.onRowClick - Row click handler (item, index) => void
 * @param {Function} props.rowClassName - Function to add custom class to rows (item, index) => string
 * @param {string} props.emptyMessage - Message when no data
 * @param {boolean} props.loading - Show loading state
 */
const VirtualTable = ({
  data = [],
  columns = [],
  height = 400,
  rowHeight = 48,
  renderCell,
  onRowClick,
  rowClassName,
  emptyMessage = 'لا توجد بيانات',
  loading = false,
  className = '',
}) => {
  // Memoize item data to prevent unnecessary re-renders
  const itemData = useMemo(() => ({
    items: data,
    columns,
    renderCell,
    onRowClick,
    rowClassName,
  }), [data, columns, renderCell, onRowClick, rowClassName]);

  // Calculate header height
  const headerHeight = 44;

  // Render header
  const renderHeader = useCallback(() => (
    <div 
      style={{
        display: 'flex',
        backgroundColor: '#f1f5f9',
        borderBottom: '2px solid #e2e8f0',
        fontWeight: 'bold',
        height: headerHeight,
        alignItems: 'center',
      }}
      className="virtual-table-header"
    >
      {columns.map((column, index) => (
        <div
          key={column.key || index}
          style={{
            flex: column.flex || 1,
            minWidth: column.minWidth || 100,
            maxWidth: column.maxWidth,
            padding: '8px 12px',
            textAlign: column.align || 'right',
          }}
        >
          {column.label}
        </div>
      ))}
    </div>
  ), [columns]);

  // Loading state
  if (loading) {
    return (
      <div className={`virtual-table ${className}`} style={{ height }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%',
          color: '#64748b'
        }}>
          <div className="spinner" style={{ marginLeft: '10px' }}></div>
          جاري التحميل...
        </div>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className={`virtual-table ${className}`} style={{ height }}>
        {renderHeader()}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: height - headerHeight,
          color: '#64748b'
        }}>
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className={`virtual-table ${className}`}>
      {renderHeader()}
      <List
        height={height - headerHeight}
        itemCount={data.length}
        itemSize={rowHeight}
        itemData={itemData}
        width="100%"
        style={{ direction: 'rtl' }}
      >
        {TableRow}
      </List>
    </div>
  );
};

export default memo(VirtualTable);

// CSS styles to be added to your global CSS or component
export const virtualTableStyles = `
.virtual-table {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.virtual-table-header {
  position: sticky;
  top: 0;
  z-index: 1;
}

.virtual-table-row:hover {
  background-color: #f1f5f9 !important;
}

.virtual-table-row.selected {
  background-color: #e0f2fe !important;
}
`;

