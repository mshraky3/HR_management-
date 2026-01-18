/**
 * Task Progress Overview Component
 * Shows overall progress and category breakdowns
 */

import { useMemo, useState } from 'react';
import { calculateCategoryProgress, getCategoryLabel } from '../utils/taskPrioritizer';
import './TaskProgressOverview.css';

const TaskProgressOverview = ({ tasks }) => {
  const [collapsed, setCollapsed] = useState(true);
  const categoryProgress = useMemo(() => calculateCategoryProgress(tasks), [tasks]);

  // Progress colors: inverted (0% = all done, 100% = nothing done)
  const getProgressColor = (progress) => {
    if (progress <= 10) return 'progress-excellent'; // 90%+ done
    if (progress <= 30) return 'progress-good'; // 70%+ done
    if (progress <= 50) return 'progress-moderate'; // 50%+ done
    if (progress <= 70) return 'progress-low'; // 30%+ done
    return 'progress-critical'; // less than 30% done
  };

  // Milestone badges: inverted (0% = all done = best badge)
  const getMilestoneBadge = (progress) => {
    if (progress === 0) {
      // 100% done - show star badge
      return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
        </svg>
      );
    }
    if (progress <= 25) {
      // 75%+ done - show check badge
      return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.9"/>
          <path d="M7 12L10 15L17 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    if (progress <= 50) {
      // 50%+ done - show moderate badge
      return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.7"/>
          <path d="M7 12L10 15L17 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    if (progress <= 75) {
      // 25%+ done - show low badge
      return (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.5"/>
        </svg>
      );
    }
    // Less than 25% done - no badge
    return null;
  };

  const categories = ['setup', 'documents', 'transportation', 'employees', 'payroll', 'responses'];

  return (
    <div className={`task-progress-overview ${collapsed ? 'compact' : ''}`}>
      <div className="progress-overall">
        <div className="progress-header">
          <h2 className="progress-label">التقدم الإجمالي</h2>
          <div className="progress-header-right">
            <div className="progress-percentage-wrapper">
              <span className="progress-percentage">
                {categoryProgress.overall.progress}%
              </span>
              {getMilestoneBadge(categoryProgress.overall.progress) && (
                <span className="milestone-badge">
                  {getMilestoneBadge(categoryProgress.overall.progress)}
                </span>
              )}
            </div>
            <button
              className="progress-toggle-btn"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'عرض التفاصيل' : 'إخفاء التفاصيل'}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                className={collapsed ? '' : 'expanded'}
              >
                <path
                  d="M9 18L15 12L9 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{collapsed ? 'عرض التفاصيل' : 'إخفاء التفاصيل'}</span>
            </button>
          </div>
        </div>
        <div className="progress-bar-container">
          <div
            className={`progress-bar ${getProgressColor(categoryProgress.overall.progress)}`}
            style={{ width: `${categoryProgress.overall.progress}%` }}
          >
            <div className="progress-bar-fill"></div>
          </div>
        </div>
        <div className="progress-summary">
          <span className="summary-remaining">
            {categoryProgress.overall.remaining} متبقي
          </span>
        </div>
      </div>

      {!collapsed && (
        <div className="progress-details">
        {categories.map(category => {
          const progress = categoryProgress[category];
          if (progress.total === 0) return null;

          return (
            <div key={category} className="progress-item">
              <div className="progress-item-header">
                <span className="progress-item-label">
                  {getCategoryLabel(category)}
                </span>
                <span className="progress-item-value">
                  {progress.remaining} متبقي
                </span>
              </div>
              <div className="progress-bar-container small">
                <div
                  className={`progress-bar ${getProgressColor(progress.progress)}`}
                  style={{ width: `${progress.progress}%` }}
                >
                  <div className="progress-bar-fill"></div>
                </div>
              </div>
              <div className="progress-item-footer">
                <span className="progress-item-percentage">{progress.progress}%</span>
                <span className="progress-item-remaining">
                  {progress.remaining} متبقي
                </span>
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
};

export default TaskProgressOverview;
