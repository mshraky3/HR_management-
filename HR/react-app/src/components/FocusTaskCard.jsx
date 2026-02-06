/**
 * Focus Task Card Component
 * Displays the primary task in a large, prominent card
 */

import { Link } from 'react-router-dom';
import TaskIcon from './TaskIcon';
import './FocusTaskCard.css';

const FocusTaskCard = ({ task, onSkip }) => {
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

  return (
    <div className={`focus-task-card ${priorityClass}`}>
      <div className="focus-task-header">
        <TaskIcon type={task.type} size="medium" />
        <div className="focus-task-title-section">
          <h2 className="focus-task-title">{task.title}</h2>
          <span className={`focus-task-priority priority-${priorityClass}`}>
            {priorityLabel}
          </span>
        </div>
      </div>

      <div className="focus-task-body">
        <p className="focus-task-description">{task.description}</p>

        {task.totalItems > 1 && (() => {
          const remainingItems = task.remainingItems ?? (task.totalItems - (task.completedItems ?? 0));
          const progressPercentage = task.totalItems > 0 ? Math.round((remainingItems / task.totalItems) * 100) : 0;
          return (
            <div className="focus-task-progress">
              <div className="focus-task-progress-info">
                <span className="progress-text">
                  {remainingItems} متبقي
                </span>
                <span className="progress-percentage">{progressPercentage}%</span>
              </div>
              <div className="focus-task-progress-bar">
                <div
                  className="focus-task-progress-fill"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
            </div>
          );
        })()}

        {task.estimatedTime && (
          <div className="focus-task-meta">
            <span className="meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {task.estimatedTime}
            </span>
            {task.urgency !== 'no_deadline' && (
              <span className="meta-item urgency">
                {task.urgency === 'expired' ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    منتهي
                  </>
                ) : task.urgency === 'due_soon' ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 6V12L16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    قريب
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M16 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M8 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M3 10H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    لاحقاً
                  </>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="focus-task-actions">
        {task.actionUrl && task.actionUrl.startsWith('#') ? (
          <button
            onClick={() => {
              const sectionId = task.actionUrl.replace('#', '');
              const element = document.getElementById(sectionId);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Add a quick highlight animation so the user sees where to act
                element.classList.add('focus-scroll-highlight');
                window.setTimeout(() => {
                  element.classList.remove('focus-scroll-highlight');
                }, 1500);
              }
            }}
            className={`focus-task-action-btn action-primary ${priorityClass}`}
          >
            {task.actionLabel}
          </button>
        ) : (
          <Link
            to={task.actionUrl}
            className={`focus-task-action-btn action-primary ${priorityClass}`}
          >
            {task.actionLabel}
          </Link>
        )}
        {onSkip && (
          <button
            className="focus-task-action-btn action-skip"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSkip();
            }}
            title={task.priority === 'critical' ? 'غير متاح للمهام الحرجة' : 'عرض المهمة التالية مؤقتاً (لن يتم إخفاؤها نهائياً)'}
            disabled={task.priority === 'critical'}
          >
            {task.priority === 'critical' ? 'لا يمكن تخطيها' : 'عرض المهمة التالية'}
          </button>
        )}
      </div>
    </div>
  );
};

export default FocusTaskCard;
