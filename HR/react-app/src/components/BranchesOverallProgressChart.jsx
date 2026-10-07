/**
 * Overall progress of every branch (employee data 50% + branch documents 50%), as a ranked list of bars.
 * Used by the branch statistics page and the operations dashboard.
 */
import { useMemo } from 'react';
import { Card, Badge, MeterList } from '../ui';
import { calculateDocumentsCompletion, calculateOverallProgress } from '../utils/dataCompletionUtils';

const toneFor = (value) => (value >= 90 ? 'success' : value >= 70 ? 'primary' : value >= 50 ? 'warning' : 'danger');

const BranchesOverallProgressChart = ({
  statistics = [],
  documentsList = [],
  branchDocumentsMap = null,
  title = 'التقدم الإجمالي لجميع الفروع',
}) => {
  const documentsByBranch = useMemo(() => {
    if (branchDocumentsMap) return branchDocumentsMap;
    const map = {};
    (documentsList || []).forEach((doc) => {
      const id = doc.branch_id || doc.branchId;
      if (!map[id]) map[id] = [];
      map[id].push(doc);
    });
    return map;
  }, [documentsList, branchDocumentsMap]);

  const rows = useMemo(() => {
    const overall = (stat) => {
      const employees = Number(stat.completion_percentage) || 0;
      const docs = calculateDocumentsCompletion(documentsByBranch[stat.branch_id] || [], stat.branch_type);
      return calculateOverallProgress(employees, docs.percentage);
    };
    return (statistics || []).map((stat) => ({ stat, value: overall(stat) })).sort((a, b) => b.value - a.value);
  }, [statistics, documentsByBranch]);

  if (rows.length === 0) return null;

  const average = Math.round(rows.reduce((sum, r) => sum + r.value, 0) / rows.length);

  return (
    <Card
      title={title}
      subtitle="الأعلى أولاً · أخضر 90% فأكثر، أزرق 70%، أصفر 50%، أحمر أقل من ذلك"
      actions={(
        <>
          <Badge tone="info">المتوسط <bdi>{average}%</bdi></Badge>
          <Badge tone="neutral"><bdi>{rows.length}</bdi> فرع</Badge>
        </>
      )}
    >
      <MeterList
        items={rows.map(({ stat, value }) => ({
          key: stat.branch_id,
          label: stat.branch_name,
          value,
          note: `${value}%`,
          tone: toneFor(value),
        }))}
      />
    </Card>
  );
};

export default BranchesOverallProgressChart;
