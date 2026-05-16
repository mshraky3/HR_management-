/**
 * Task Queue Component
 * Shows top 3 tasks (1 primary + 2 secondary)
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import TaskIcon from './TaskIcon';
import './TaskQueue.css';

const TaskQueue = ({ tasks }) => {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  if (!tasks || tasks.length === 0) {
    return (
      <div className="task-queue">
        <div className="task-queue-empty">
          <TaskIcon type="default" size="large" />
          <p>جميع المهام مكتملة!</p>
        </div>
      </div>
    );
  }

  const primaryTask = tasks[0];
  const secondaryTasks = tasks.slice(1, 3);
  const remainingTasks = tasks.slice(3);

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

  // Don't show primary task in queue (it's already in FocusTaskCard)
  const queueTasks = tasks.slice(1);

  if (collapsed) {
    return (
      <div className="task-queue collapsed">
        <div className="task-queue-header">
          <h3 className="task-queue-title">المهام القادمة</h3>
          {queueTasks.length > 0 && (
            <div className="task-queue-count-badge">
              {queueTasks.length} مهام
            </div>
          )}
          <button
            className="task-queue-toggle"
            onClick={() => setCollapsed(false)}
          >
            عرض المهام
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="task-queue">
      <div className="task-queue-header">
        <h3 className="task-queue-title">المهام القادمة</h3>
        <button
          className="task-queue-toggle"
          onClick={() => { setCollapsed(true); setExpanded(false); }}
        >
          إخفاء
        </button>
      </div>

      <div className="task-queue-list">
        {/* Show secondary tasks (primary is in FocusTaskCard) */}
        {queueTasks.slice(0, 2).map((task, index) => (
          <div
            key={task.id}
            className={`task-queue-item secondary ${getPriorityColor(task.priority)}`}
          >
            <TaskIcon type={task.type} size="medium" className="task-queue-item-icon" />
            <div className="task-queue-item-content">
              <h4 className="task-queue-item-title">{task.title}</h4>
              <p className="task-queue-item-description">{task.description}</p>
              {task.totalItems > 1 && (() => {
                const remainingItems = task.remainingItems ?? (task.totalItems - (task.completedItems ?? 0));
                const progressPercentage = task.totalItems > 0 ? Math.round((remainingItems / task.totalItems) * 100) : 0;
                return (
                  <div className="task-queue-item-progress">
                    <span>{remainingItems} متبقي</span>
                    <div className="task-queue-item-progress-bar">
                      <div
                        className="task-queue-item-progress-fill"
                        style={{ width: `${progressPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })()}
            </div>
            {task.actionUrl && task.actionUrl.startsWith('#') ? (
              <button
                onClick={() => {
                  const sectionId = task.actionUrl.replace('#', '');
                  const element = document.getElementById(sectionId);
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className={`task-queue-item-action ${getPriorityColor(task.priority)}`}
              >
                {task.actionLabel}
              </button>
            ) : (
              <Link
                to={task.actionUrl}
                className={`task-queue-item-action ${getPriorityColor(task.priority)}`}
              >
                {task.actionLabel}
              </Link>
            )}
          </div>
        ))}

        {/* Remaining Tasks (collapsible) */}
        {remainingTasks.length > 0 && (
          <button
            className="task-queue-show-more"
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? 'إخفاء المزيد' : `عرض ${remainingTasks.length} مهام إضافية`}
          </button>
        )}
        {expanded && remainingTasks.length > 0 && (
          <div className="task-queue-remaining">
            {remainingTasks.map((task) => (
              <div
                key={task.id}
                className={`task-queue-item remaining ${getPriorityColor(task.priority)}`}
              >
                <TaskIcon type={task.type} size="medium" className="task-queue-item-icon" />
                <div className="task-queue-item-content">
                  <h4 className="task-queue-item-title">{task.title}</h4>
                  <p className="task-queue-item-description">{task.description}</p>
                </div>
                <Link
                  to={task.actionUrl}
                  className={`task-queue-item-action ${getPriorityColor(task.priority)}`}
                >
                  {task.actionLabel}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskQueue;
