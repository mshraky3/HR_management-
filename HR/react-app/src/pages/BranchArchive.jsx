import { PageHeader, Page, EmptyState } from '../ui';

export default function BranchArchive() {
  return (
    <Page>
      <PageHeader title="من غادروا الفرع" />
      <EmptyState icon="archive" title="قيد الإنشاء" />
    </Page>
  );
}
