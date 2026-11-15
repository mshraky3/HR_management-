/**
 * Shared logic of the two healthcare-centre record panels (achievements and partnerships):
 * list loading, healthcare branch list, file preview / download, small date and error helpers.
 * Components live in RecordParts.jsx (kept apart so this file can export plain functions and hooks).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { branchesAPI } from '../../utils/api';
import { downloadFile } from '../../utils/downloadFile';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';

export const HEALTHCARE = 'healthcare_center';
export const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.gif';

/** The Gregorian field arrives as an ISO string; the first 10 characters are the calendar day. */
export const isoDay = (value) => (value ? String(value).slice(0, 10) : '');

/** Whole days from today to a YYYY-MM-DD day (negative = past), or null. */
export const daysUntilDay = (value) => {
  const day = isoDay(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
};

/** Arabic message of a failed request; also reads the JSON error of a failed blob (download) request. */
export const errorText = async (error, fallback) => {
  const data = error?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } catch {
      // not JSON: fall through to the fallback
    }
    return fallback;
  }
  return data?.message || fallback;
};

export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Loads a record list; the latest request wins, a failure shows the server's Arabic message. */
export function useRecordList(api, filters) {
  const { showError } = useNotification();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  const filterKey = JSON.stringify(filters);

  const reload = useCallback(async () => {
    const mine = ++latest.current;
    setLoading(true);
    setFailed(false);
    try {
      const response = await api.getAll(JSON.parse(filterKey));
      if (mine !== latest.current) return;
      setRows(response.data?.success ? (response.data.data || []) : []);
    } catch (error) {
      if (mine !== latest.current) return;
      setRows([]);
      setFailed(true);
      showError(await errorText(error, 'فشل تحميل السجلات'));
    } finally {
      if (mine === latest.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, filterKey]);

  useEffect(() => { reload(); }, [reload]);

  return { rows, loading, failed, reload };
}

/** Healthcare branches the caller may work with (operations managers: only their assigned ones). */
export function useHealthcareBranches(enabled) {
  const { isBranchOperationsManager, user } = useAuth();
  const isOps = isBranchOperationsManager();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));

  const assigned = useMemo(
    () => (Array.isArray(user?.assigned_branches) ? user.assigned_branches.map((id) => parseInt(id, 10)).filter(Number.isFinite) : []),
    [user?.assigned_branches],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await branchesAPI.getAll({ is_active: true });
        if (cancelled) return;
        const all = response.data?.success ? (response.data.data || []) : [];
        setList(all.filter((b) => b.branch_type === HEALTHCARE && (!isOps || assigned.includes(parseInt(b.id, 10)))));
      } catch (error) {
        console.error('Error loading branches:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, isOps, assigned]);

  const branches = useMemo(
    () => [...list].sort((a, b) => (a.branch_name || '').localeCompare(b.branch_name || '', 'ar')),
    [list],
  );
  return { branches, loading };
}

export const canPreviewFile = (row) => Boolean(
  row?.has_file && row.mime_type && (row.mime_type.startsWith('image/') || row.mime_type === 'application/pdf'),
);

/** Preview (PDF in a new tab, image in a modal) and download of a record's file. */
export function useRecordFiles(api) {
  const { showError, showWarning } = useNotification();
  const [downloading, setDownloading] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(null);
  const [preview, setPreview] = useState(null); // { row, url }

  const download = async (row) => {
    try {
      setDownloading(row.id);
      const response = await api.download(row.id);
      let filename = row.file_name || `file_${row.id}`;
      const disposition = response.headers?.['content-disposition'];
      if (disposition) {
        const match = disposition.match(/filename="?(.+)"?/i);
        if (match) {
          try { filename = decodeURIComponent(match[1].replace(/"/g, '')); } catch { /* keep the stored name */ }
        }
      }
      if (!(response.data instanceof Blob)) throw new Error('Invalid response format');
      downloadFile(response.data, filename);
    } catch (error) {
      showError(`فشل تحميل الملف: ${await errorText(error, 'تعذر تحميل الملف')}`);
    } finally {
      setDownloading(null);
    }
  };

  const openPreview = async (row) => {
    if (!localStorage.getItem('token')) { showWarning('يرجى تسجيل الدخول مرة أخرى'); return; }
    try {
      setPreviewLoading(row.id);
      const response = await api.download(row.id);
      if (!(response.data instanceof Blob)) throw new Error('Invalid response format');
      const url = URL.createObjectURL(response.data);
      if (row.mime_type?.startsWith('image/')) {
        setPreview({ row, url });
      } else {
        const win = window.open(url, '_blank');
        if (!win) showWarning('يرجى السماح للنافذة المنبثقة بفتح ملف PDF');
        setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      }
    } catch (error) {
      showError(`فشل عرض الملف: ${await errorText(error, 'تعذر عرض الملف')}`);
    } finally {
      setPreviewLoading(null);
    }
  };

  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  return { downloading, previewLoading, preview, download, openPreview, closePreview };
}
