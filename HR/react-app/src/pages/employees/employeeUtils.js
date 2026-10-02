import { DATA_COMPLETION_STATUS } from '../../utils/employeeConstants';

export const fullName = (e) =>
  [e?.first_name, e?.second_name, e?.third_name, e?.fourth_name].filter(Boolean).join(' ');

export const isArchivedStatus = (status) => Boolean(status) && !['active', 'pending'].includes(status);

export const isDataComplete = (e) => e?.data_completion_status === DATA_COMPLETION_STATUS.COMPLETE;

/** Normalises text for Arabic-friendly matching: lower-case, strips tashkeel and unifies alef/ya/ta-marbuta. */
export function normalizeSearch(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
}

export const todayIso = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
