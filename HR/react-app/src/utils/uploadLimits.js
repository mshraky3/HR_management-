/**
 * Upload size limits shared by every upload screen.
 *
 * Files up to MAX_API_UPLOAD_BYTES travel through the API (Vercel caps request
 * bodies at ~4.5 MB); larger ones, up to MAX_UPLOAD_BYTES, are sent straight
 * to R2 by utils/api.js. The server (express-app/middleware/upload.js)
 * enforces the same two limits.
 */

export const MAX_API_UPLOAD_BYTES = 4 * 1024 * 1024;

export const MAX_UPLOAD_MB = 15;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const fileTooLargeMessage = (fileName) =>
  `حجم الملف${fileName ? ` "${fileName}"` : ''} كبير جداً. الحد الأقصى هو ${MAX_UPLOAD_MB} ميجابايت — الرجاء ضغط الملف ثم المحاولة مرة أخرى.`;

/** The most useful text for a failed upload request. */
export const uploadErrorMessage = (error) => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.status === 413) return fileTooLargeMessage();
  return error?.message || 'تعذر رفع الملف';
};
