/**
 * One request, as shown on both sides: the branch (what I asked and what I was answered) and head office
 * (what a branch asked and my answer). `who` is the other party's label and name.
 */
import { Badge, Icon } from '../../ui';
import { formatDate } from '../../utils/dateConverters';
import { statusMeta } from './constants';

function Attachment({ label, name, url }) {
  if (!name) return null;
  return (
    <div className="rq-fact">
      <dt>{label}</dt>
      <dd>
        <a href={url} target="_blank" rel="noopener noreferrer" className="rq-attachment"><Icon name="link" size={14} /> <bdi>{name}</bdi></a>
      </dd>
    </div>
  );
}

export default function RequestCard({ request, whoLabel, who, employeeAction, actions }) {
  const meta = statusMeta(request.status);
  return (
    <article className="rq-card">
      <header className="rq-head">
        <h3>{request.request_name}</h3>
        <Badge tone={meta.tone} dot>{meta.label}</Badge>
      </header>

      <p className="rq-text">{request.request_text}</p>

      <dl className="rq-facts">
        <div className="rq-fact"><dt>{whoLabel}</dt><dd>{who}</dd></div>
        {request.employee_name && (
          <div className="rq-fact">
            <dt>الموظف المعني</dt>
            <dd>{request.employee_name}{employeeAction}</dd>
          </div>
        )}
        <div className="rq-fact"><dt>تاريخ الإرسال</dt><dd>{formatDate(request.created_at)}</dd></div>
        <Attachment label="المرفق" name={request.attachment_name} url={request.attachment_url} />
      </dl>

      {request.response_text && (
        <div className="rq-reply">
          <strong>الرد</strong>
          <p>{request.response_text}</p>
          <dl className="rq-facts">
            <Attachment label="المرفق مع الرد" name={request.response_attachment_name} url={request.response_attachment_url} />
            {request.responded_at && <div className="rq-fact"><dt>بتاريخ</dt><dd>{formatDate(request.responded_at)}</dd></div>}
          </dl>
        </div>
      )}

      {actions && <footer className="rq-actions">{actions}</footer>}
    </article>
  );
}
