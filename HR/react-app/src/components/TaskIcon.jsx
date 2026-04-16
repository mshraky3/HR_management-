/**
 * Task Icon Component
 * Centralized SVG icon component for all task types
 */

import './TaskIcon.css';

const TaskIcon = ({ type, size = 'medium', className = '' }) => {
  const sizeClasses = {
    small: 'task-icon-small',
    medium: 'task-icon-medium',
    large: 'task-icon-large'
  };

  // Map task types to icon color classes
  const getIconTypeClass = (type) => {
    switch (type) {
      case 'document':
      case 'branch_info':
        return 'icon-document';
      case 'employee':
      case 'employee_contract_data':
        return 'icon-employee';
      case 'bus':
        return 'icon-bus';
      case 'payroll_absence':
        return 'icon-payroll';
      case 'beneficiary':
        return 'icon-beneficiary';
      case 'notification':
        return 'icon-alert';
      default:
        return '';
    }
  };

  const iconClass = `task-icon ${sizeClasses[size] || sizeClasses.medium} ${getIconTypeClass(type)} ${className}`.trim();

  const renderIcon = () => {
    switch (type) {
      case 'branch_info':
        return (
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM19 19H5V5H19V19Z" fill="currentColor" />
            <path d="M7 7H17V9H7V7ZM7 11H17V13H7V11ZM7 15H13V17H7V15Z" fill="currentColor" />
          </svg>
        );

      case 'document':
        return (
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2V8H20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 9H9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );

      case 'bus':
        return (
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 6H20C21.1 6 22 6.9 22 8V17C22 18.1 21.1 19 20 19H19C19 20.1 18.1 21 17 21C15.9 21 15 20.1 15 19H9C9 20.1 8.1 21 7 21C5.9 21 5 20.1 5 19H4C2.9 19 2 18.1 2 17V8C2 6.9 2.9 6 4 6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 21C7.55228 21 8 20.5523 8 20C8 19.4477 7.55228 19 7 19C6.44772 19 6 19.4477 6 20C6 20.5523 6.44772 21 7 21Z" fill="currentColor" />
            <path d="M17 21C17.5523 21 18 20.5523 18 20C18 19.4477 17.5523 19 17 19C16.4477 19 16 19.4477 16 20C16 20.5523 16.4477 21 17 21Z" fill="currentColor" />
            <path d="M22 10H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 7V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 7V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );

      case 'employee':
      case 'employee_contract_data':
        return (
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20.59 22C20.59 18.13 16.74 15 12 15C7.26 15 3.41 18.13 3.41 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 7V5H18V7H16ZM16 11V9H18V11H16Z" fill="currentColor" opacity="0.5" />
          </svg>
        );

      case 'payroll_absence':
        return (
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 10H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="16" r="2" fill="currentColor" />
          </svg>
        );

      case 'beneficiary':
        return (
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 4H18C19.1 4 20 4.9 20 6V20C20 21.1 19.1 22 18 22H6C4.9 22 4 21.1 4 20V6C4 4.9 4.9 4 6 4H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="8" y="2" width="8" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 11C13.1 11 14 10.1 14 9C14 7.9 13.1 7 12 7C10.9 7 10 7.9 10 9C10 10.1 10.9 11 12 11Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 17C8 14.79 9.79 13 12 13C14.21 13 16 14.79 16 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M9 19H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );

      case 'notification':
        return (
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 8A6 6 0 0 0 6 8C6 11.09 4.77 13.81 3 15.87V17H21V15.87C19.23 13.81 18 11.09 18 8Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="18" cy="6" r="3" fill="currentColor" opacity="0.8" />
          </svg>
        );

      default:
        return (
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
    }
  };

  return (
    <div className={iconClass}>
      {renderIcon()}
    </div>
  );
};

export default TaskIcon;
