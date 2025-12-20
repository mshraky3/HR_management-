const GenerateFileSection = ({ generatingFile, onGenerate, disabled }) => (
  <div className="generate-file-section">
    <button
      type="button"
      onClick={onGenerate}
      disabled={generatingFile || disabled}
      className="btn btn-primary btn-lg generate-file-button"
    >
      {generatingFile ? (
        <>
          <span className="spinner"></span>
          جاري إنشاء الملف...
        </>
      ) : (
        <>
          <img
            src="https://img.icons8.com/material-rounded/24/document.png"
            alt="مستند"
            style={{ width: '20px', height: '20px', verticalAlign: 'middle', marginLeft: '8px' }}
          />
          إنشاء ملف الموظف (PDF)
        </>
      )}
    </button>
  </div>
);

export default GenerateFileSection;
