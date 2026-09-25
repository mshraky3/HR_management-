/**
 * Upload size limits shared by every upload screen.
 *
 * Files sent through the API are capped by Vercel's ~4.5 MB request limit;
 * the server (express-app/middleware/upload.js) enforces the same 4 MB.
 */

export const MAX_UPLOAD_MB = 4;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const fileTooLargeMessage = (fileName) =>
  `حجم الملف${fileName ? ` "${fileName}"` : ''} كبير جداً. الحد الأقصى هو ${MAX_UPLOAD_MB} ميجابايت — الرجاء ضغط الملف ثم المحاولة مرة أخرى.`;

/** The most useful text for a failed upload request. */
export const uploadErrorMessage = (error) => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.status === 413) return fileTooLargeMessage();
  return error?.message || 'تعذر رفع الملف';
};
