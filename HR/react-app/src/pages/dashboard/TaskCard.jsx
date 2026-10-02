import { useState } from 'react';
import { Badge, Button, Icon } from '../../ui';

const SEVERITY_LABEL = { critical: 'عاجلة', important: 'مهمة', normal: '' };

const dueText = (due) => {
  if (!due) return null;
  const today = new Date(new Date().toDateString());
  const d = new Date(`${due}T00:00:00`);
  const days = Math.round((d - today) / 86400000);
  if (days < 0) return { text: `متأخرة ${Math.abs(days)} يوم`, tone: 'danger' };
  if (days === 0) return { text: 'تنتهي اليوم', tone: 'warning' };
  if (days <= 7) return { text: `باقي ${days} أيام`, tone: 'warning' };
  return { text: `الموعد ${due}`, tone: 'neutral' };
};

/**
 * TaskCard: one thing the branch has to do.
 * Shows what, how much is left, when it is due, and one clear action: open the page that fixes it,
 * or expand an inline panel (children) for tasks that are done right here.
 */
export default function TaskCard({ task, children, onComplete, completing }) {
  const [open, setOpen] = useState(false);
  const due = task.done ? null : dueText(task.due_at);
  const doneCount = Math.max(0, (task.total || 0) - (task.remaining || 0));
  const showProgress = !task.done && task.total > 1;
  const percent = task.total > 0 ? Math.round((doneCount / task.total) * 100) : 0;
  const expandable = Boolean(children);

  return (
    <article className={`ui-task is-${task.done ? 'done' : task.severity}${task.overdue ? ' is-overdue' : ''}`}>
      <div className="ui-task-main">
        <span className="ui-task-icon" aria-hidden="true">
          <Icon name={task.done ? 'check-circle' : task.severity === 'critical' ? 'alert' : 'flag'} size={22} />
        </span>
        <div className="ui-task-body">
          <div className="ui-task-head">
            <h3 className="ui-task-title">{task.title}</h3>
            <div className="ui-task-badges">
              {task.done && <Badge tone="success" dot>مكتملة</Badge>}
              {!task.done && SEVERITY_LABEL[task.severity] && <Badge tone={task.severity === 'critical' ? 'danger' : 'warning'}>{SEVERITY_LABEL[task.severity]}</Badge>}
              {due && <Badge tone={due.tone}>{due.text}</Badge>}
            </div>
          </div>
          {task.description && <p className="ui-task-desc">{task.description}</p>}
          {showProgress && (
            <div className="ui-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`تقدم المهمة ${percent}%`}>
              <span className="ui-progress-bar" style={{ width: `${percent}%` }} />
              <span className="ui-progress-text">{doneCount} من {task.total}</span>
            </div>
          )}
        </div>
        <div className="ui-task-actions">
          {expandable && (
            <Button variant={task.done ? 'secondary' : 'primary'} size="sm" iconEnd={open ? 'chevron-up' : 'chevron-down'} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? 'إخفاء' : task.link_label || 'عرض'}
            </Button>
          )}
          {!expandable && task.link && (
            <Button variant={task.done ? 'secondary' : 'primary'} size="sm" to={task.link}>{task.link_label || 'فتح'}</Button>
          )}
          {task.manual_task_id && onComplete && (
            <Button variant="success" size="sm" icon="check" loading={completing} onClick={() => onComplete(task)}>تم</Button>
          )}
        </div>
      </div>
      {expandable && open && <div className="ui-task-panel">{children}</div>}
    </article>
  );
}
