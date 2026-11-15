/**
 * Small pieces shared by AchievementsPanel and PartnershipsPanel: the optional file field of the forms,
 * the file column and row actions of the lists, and the image preview dialog.
 */
import { Checkbox, FormField, IconButton, Input, Modal } from '../../ui';
import { useNotification } from '../../contexts/NotificationContext';
import { MAX_UPLOAD_MB, MAX_UPLOAD_BYTES, fileTooLargeMessage } from '../../utils/uploadLimits';
import { ACCEPTED_FILES, canPreviewFile } from './recordHelpers';
import './BranchRecords.css';

/** Optional file input. When editing, shows the current file with a "delete current file" checkbox. */
export function RecordFileField({ currentName, file, onFileChange, removeCurrent, onRemoveChange, disabled }) {
  const { showWarning } = useNotification();

  const pick = (e) => {
    const picked = e.target.files?.[0] || null;
    // Catch the obvious mistakes now (the "all files" option of the picker lets anything through)
    if (picked && !/^(application\/pdf|image\/(jpe?g|png|gif))$/i.test(picked.type) && !/\.(pdf|jpe?g|png|gif)$/i.test(picked.name)) {
      showWarning('نوع الملف غير مدعوم. اختر ملف PDF أو صورة (JPG أو PNG أو GIF).');
      e.target.value = '';
      onFileChange(null);
      return;
    }
    if (picked && picked.size === 0) {
      showWarning('الملف المختار فارغ. اختر ملفاً آخر.');
      e.target.value = '';
      onFileChange(null);
      return;
    }
    if (picked && picked.size > MAX_UPLOAD_BYTES) {
      showWarning(fileTooLargeMessage(picked.name));
      e.target.value = '';
      onFileChange(null);
      return;
    }
    onFileChange(picked);
  };

  return (
    <>
      {currentName && (
        <FormField label="الملف الحالي">
          <Input value={currentName} disabled readOnly dir="auto" />
        </FormField>
      )}
      {currentName && (
        <Checkbox
          label="حذف الملف الحالي"
          checked={Boolean(removeCurrent) && !file}
          disabled={disabled || Boolean(file)}
          onChange={(e) => onRemoveChange(e.target.checked)}
        />
      )}
      <FormField
        label={currentName ? 'استبدال الملف (اختياري)' : 'الملف (اختياري)'}
        hint={`PDF أو JPG أو PNG أو GIF · الحد الأقصى ${MAX_UPLOAD_MB} ميجابايت`}
      >
        <input type="file" className="ui-file" accept={ACCEPTED_FILES} onChange={pick} disabled={disabled} />
      </FormField>
    </>
  );
}

/** The "file" cell of a row: the file name, or a muted "no file". */
export function RecordFileName({ row }) {
  if (!row.has_file) return <span className="br-muted">بدون ملف</span>;
  return <span className="br-file-name" title={row.file_name} dir="auto">{row.file_name}</span>;
}

/** Preview / download / edit / delete buttons of a row. */
export function RecordActions({ row, files, onEdit, onDelete }) {
  return (
    <span className="br-actions">
      {canPreviewFile(row) && (
        <IconButton icon="eye" label="معاينة" loading={files.previewLoading === row.id} onClick={() => files.openPreview(row)} />
      )}
      {row.has_file && (
        <IconButton icon="download" label="تحميل" loading={files.downloading === row.id} onClick={() => files.download(row)} />
      )}
      <IconButton icon="edit" label="تعديل" onClick={() => onEdit(row)} />
      <IconButton icon="trash" label="حذف" className="br-danger" onClick={() => onDelete(row)} />
    </span>
  );
}

/** Image preview (PDF files open in a new browser tab instead). */
export function RecordPreviewModal({ preview, onClose }) {
  return (
    <Modal open={Boolean(preview)} onClose={onClose} title={preview?.row.file_name} size="xl">
      {preview && <img className="br-preview" src={preview.url} alt={preview.row.file_name} />}
    </Modal>
  );
}
