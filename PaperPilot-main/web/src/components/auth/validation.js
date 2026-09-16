/**
 * Field rules for the auth forms. These mirror api/app/validators.py so inline
 * feedback matches what the server will accept; the server remains the authority.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;
const NAME_RE = /^[A-Za-z\u00C0-\u024F' .-]+$/;
const NAME_MAX = 40;

export function nameError(value, label, { required = true } = {}) {
  const trimmed = (value || "").trim();
  if (!trimmed) return required ? `${label} is required.` : "";
  if (trimmed.length > NAME_MAX) return `${label} must be ${NAME_MAX} characters or fewer.`;
  if (!NAME_RE.test(trimmed)) return `${label} may only contain letters, spaces, hyphens, periods, and apostrophes.`;
  return "";
}

export function emailError(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "Email is required.";
  if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) return "Enter a valid email address.";
  return "";
}

export function usernameError(value) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "Username is required.";
  if (trimmed.length < 3) return "Username must be at least 3 characters.";
  if (trimmed.length > 20) return "Username must be 20 characters or fewer.";
  if (!USERNAME_RE.test(trimmed)) return "Use only letters, numbers, underscore, or period.";
  return "";
}

export function passwordError(value) {
  const password = value || "";
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter.";
  if (!/\d/.test(password)) return "Password must include at least one number.";
  return "";
}

export function phoneError(value, { required = false } = {}) {
  const trimmed = (value || "").trim();
  if (!trimmed) return required ? "Mobile number is required." : "";
  if (!/^\d+$/.test(trimmed)) return "Mobile number must contain numbers only.";
  if (trimmed.length !== 11) return "Mobile number must be exactly 11 digits. Example: 0912xxxxxxx";
  if (!trimmed.startsWith("09")) return "Mobile number must start with 09. Example: 0912xxxxxxx";
  return "";
}

export function confirmPasswordError(password, confirmValue) {
  if (!confirmValue) return "Confirm your password.";
  if (confirmValue !== password) return "Passwords do not match.";
  return "";
}

/** Strength hints shown under the password field while the user types. */
export function passwordChecks(value) {
  const password = value || "";
  return [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "One letter", met: /[A-Za-z]/.test(password) },
    { label: "One number", met: /\d/.test(password) },
  ];
}

/** Validates every register field at once. Returns a field -> message map. */
export function registerErrors(values) {
  const errors = {};
  const set = (field, message) => {
    if (message) errors[field] = message;
  };
  set("firstName", nameError(values.firstName, "First name"));
  set("middleName", nameError(values.middleName, "Middle name", { required: false }));
  set("lastName", nameError(values.lastName, "Last name"));
  set("username", usernameError(values.username));
  set("email", emailError(values.email));
  set("password", passwordError(values.password));
  set("confirmPassword", confirmPasswordError(values.password, values.confirmPassword));
  return errors;
}

/** Validates a single register field, used for live/blur feedback. */
export function registerFieldError(field, values) {
  switch (field) {
    case "firstName":
      return nameError(values.firstName, "First name");
    case "middleName":
      return nameError(values.middleName, "Middle name", { required: false });
    case "lastName":
      return nameError(values.lastName, "Last name");
    case "username":
      return usernameError(values.username);
    case "email":
      return emailError(values.email);
    case "password":
      return passwordError(values.password);
    case "confirmPassword":
      return confirmPasswordError(values.password, values.confirmPassword);
    default:
      return "";
  }
}
