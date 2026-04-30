/**
 * Triggers a browser file download from a Blob.
 * @param {Blob} blob - The file data.
 * @param {string} filename - The suggested download filename.
 */
export function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
