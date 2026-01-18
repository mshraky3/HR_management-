const PasswordModal = ({
  show,
  password,
  passwordError,
  generatingFile,
  onClose,
  onPasswordChange,
  onSubmit,
}) => {
  if (!show) return null;

  return (
    <div
      className="password-modal"
      onClick={() => {
        if (!generatingFile) {
          onClose();
        }
      }}
    >
      <div className="password-modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>إدخال كلمة المرور</h2>
        <p>يرجى إدخال كلمة مرور مستندات الفرع لإنشاء ملف الموظف</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="password-input-group">
            <label>كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              disabled={generatingFile}
              style={{ border: passwordError ? '2px solid var(--danger)' : '2px solid var(--border)' }}
              autoFocus
            />
            {passwordError && <div className="password-error">{passwordError}</div>}
          </div>
          <div className="password-modal-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={generatingFile}
              className="btn btn-secondary"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={generatingFile || !password.trim()}
              className="btn btn-primary"
            >
              {generatingFile ? (
                <>
                  <span className="spinner"></span>
                  جاري المعالجة...
                </>
              ) : (
                'إنشاء الملف'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordModal;
