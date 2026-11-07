// reusable password validator
export function passwordValidation(value) {
  if (!value) return false;
  // pattern ya special characters unazotaka tu
  value = value.trim();
  const specialChars = /[!@#$%&?\*]/;
  const hasMinLength = value.length >= 6;
  const hasNumber = /\d/.test(value);
  const hasSpecialChar = specialChars.test(value);

  return hasMinLength && hasNumber && hasSpecialChar;
}

export function nameValidation(value) {
  if (!value) return false;
  // pattern ya special characters unazotaka tu
  value = value.trim();
  const hasMinLength = value.length >= 6;

  return hasMinLength;
}
