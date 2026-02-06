/**
 * Task Card Wrapper Component
 * Wrapper component for inline task editors
 */

import { useState } from 'react';
import TaskIcon from './TaskIcon';
import './TaskCardWrapper.css';

const TaskCardWrapper = ({ task, children, collapsed: initialCollapsed, defaultExpanded = false, onComplete }) => {
  // If defaultExpanded is true, start expanded; otherwise use initialCollapsed (defaults to true/collapsed)
  const [collapsed, setCollapsed] = useState(defaultExpanded ? false : (initialCollapsed !== undefined ? initialCollapsed : true));

  if (!task) return null;

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical':
        return 'critical';
      case 'must_do':
        return 'must-do';
      case 'should_do':
        return 'should-do';
      default:
        return 'nice-to-have';
    }
  };

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'critical':
        return 'الأولوية القصوى';
      case 'must_do':
        return 'يجب إنجازه';
      case 'should_do':
        return 'يُنصح بإنجازه';
      default:
        return 'اختياري';
    }
  };

  const priorityClass = getPriorityColor(task.priority);
  const priorityLabel = getPriorityLabel(task.priority);

  const handleScrollToSection = () => {
    const sectionId = task.actionUrl.replace('#', '');
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div id={task.actionUrl.replace('#', '')} className={`task-card-wrapper ${priorityClass}`}>
      <div className="task-card-wrapper-header">
        <div className="task-card-wrapper-header-left">
          <TaskIcon type={task.type} size="medium" />
          <div className="task-card-wrapper-header-content">
            <h3 className="task-card-wrapper-title">{task.title}</h3>
            <span className={`task-card-wrapper-priority priority-${priorityClass}`}>
              {priorityLabel}
            </span>
          </div>
        </div>
        <div className="task-card-wrapper-header-right">
          {task.totalItems > 1 && (() => {
            const remainingItems = task.remainingItems ?? (task.totalItems - (task.completedItems ?? 0));
            return (
              <div className="task-card-wrapper-progress">
                <span className="task-card-wrapper-progress-text">
                  {remainingItems} متبقي
                </span>
              </div>
            );
          })()}
          <button
            className="task-card-wrapper-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'فتح' : 'إغلاق'}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className={collapsed ? 'collapsed' : ''}
            >
              <path
                d="M9 18L15 12L9 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                transform={collapsed ? 'rotate(-90)' : 'rotate(0)'}
                transformOrigin="12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="task-card-wrapper-body">
          <div className="task-card-wrapper-description">{task.description}</div>
          {children}
        </div>
      )}
    </div>
  );
};

export default TaskCardWrapper;
