/**
 * Strips login secrets and lockout internals from account rows before they are sent
 * to anyone but the head office. Branch managers and operations managers must never
 * receive a password (their own or another branch's) in an API response.
 */

const SECRET_FIELDS = ['password', 'failed_attempts', 'locked_until', 'token_version', 'must_change_password'];

export function canSeeAccountSecrets(user) {
  return user?.role === 'main_manager';
}

export function omitAccountSecrets(row) {
  if (!row || typeof row !== 'object') return row;
  const clean = { ...row };
  for (const field of SECRET_FIELDS) delete clean[field];
  return clean;
}

/** Applies omitAccountSecrets to a row or a list unless the viewer is the main manager. */
export function sanitizeAccountsFor(user, rowOrRows) {
  if (canSeeAccountSecrets(user)) {
    // Even the head office does not need lockout internals.
    if (Array.isArray(rowOrRows)) return rowOrRows.map(stripInternals);
    return stripInternals(rowOrRows);
  }
  return Array.isArray(rowOrRows) ? rowOrRows.map(omitAccountSecrets) : omitAccountSecrets(rowOrRows);
}

function stripInternals(row) {
  if (!row || typeof row !== 'object') return row;
  const clean = { ...row };
  delete clean.failed_attempts;
  delete clean.token_version;
  return clean;
}
