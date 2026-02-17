const ImagePreviewModal = ({ document, previewUrl, onClose }) => {
  if (!document || !previewUrl || !document.mime_type || !document.mime_type.startsWith('image/')) {
    return null;
  }

  return (
    <div className="image-preview-modal" onClick={onClose}>
      <div className="image-preview-content">
        <button onClick={onClose} className="image-preview-close">
          ×
        </button>
        <img src={previewUrl} alt={document.file_name} onClick={(e) => e.stopPropagation()} />
      </div>
    </div>
  );
};

export default ImagePreviewModal;
