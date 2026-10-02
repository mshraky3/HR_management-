import { PageHeader, Page, EmptyState } from '../ui';

export default function YearCycle() {
  return (
    <Page>
      <PageHeader title="متابعة السنة الجديدة" />
      <EmptyState icon="list-check" title="قيد الإنشاء" />
    </Page>
  );
}
