import { toast } from "../lib/toast";
import { t } from "@/utils/i18n";

// Configuration
const MAX_DIGITS = 12;       // Maximum digits for integer part
const MAX_DECIMALS = 0;      // Maximum decimal places (default)

/**
 * Format number with currency based on settings
 * @param {number|string} value - The numeric value to format
 * @param {object} settings - Settings object with showCurrency, defaultCurrency, defaultCurrencyPosition, defaultDecimalPlaces
 * @param {number} maxDecimals - Override decimal places (optional)
 * @returns {string} - Formatted string with or without currency
 */
export const formatCurrency = (value, settings = {}, maxDecimals = null) => {
    const decimals = maxDecimals !== null ? maxDecimals : (settings?.defaultDecimalPlaces || MAX_DECIMALS);
    const formattedNumber = formatNumberWithCommas(value, decimals, true);
    
    if (!formattedNumber) return "";
    
    // If showCurrency is disabled, return just the number
    if (!settings?.showCurrency) {
        return formattedNumber;
    }
    
    const currency = settings.defaultCurrency;
    const position = settings.defaultCurrencyPosition || "before";
    
    // Position currency based on setting
    if (position === "after") {
        return `${formattedNumber} ${currency}`;
    } else {
        return `${currency} ${formattedNumber}`;
    }
};

// Format number with commas and enforce digit limits
// Set showWarnings to false to suppress toast warnings (for display/formatting contexts)
export const formatNumberWithCommas = (value, maxDecimals = undefined, allowNegative = false, showWarnings = false) => {
    if (value === undefined || value === null || value === "") return "";

    // Check for negative sign
    const isNegative = value.toString().startsWith("-");
    
    // Remove all non-digit characters except decimal point
    let numString = value.toString().replace(/[^0-9.]/g, "");

    // Parse as number to check if it has actual decimal value
    const numValue = parseFloat(numString);
    if (isNaN(numValue)) return "";

    // Split into integer and decimal parts
    const [integerPart, decimalPart] = numString.split(".");

    // Handle integer part
    let formattedInteger = integerPart;
    if (formattedInteger && formattedInteger.length > MAX_DIGITS) {
        formattedInteger = formattedInteger.substring(0, MAX_DIGITS);
        if (showWarnings) {
            toast.warning(t("max_digits_warning", { max: MAX_DIGITS }));
        }
    }

    // Handle decimal part based on maxDecimals parameter
    let formattedDecimal = "";
    
    if (maxDecimals !== undefined) {
        // If maxDecimals is explicitly specified, enforce exact decimal places
        const fixedValue = numValue.toFixed(maxDecimals);
        const [, fixedDecimalPart] = fixedValue.split(".");
        formattedDecimal = fixedDecimalPart || "";
    } else {
        // If maxDecimals is not specified, only show decimals if number has them
        if (decimalPart !== undefined && decimalPart !== "") {
            // Remove trailing zeros but keep at least one decimal if there was a decimal point
            formattedDecimal = decimalPart.replace(/0+$/, "") || "";
            if (formattedDecimal.length > MAX_DECIMALS) {
                formattedDecimal = formattedDecimal.substring(0, MAX_DECIMALS);
                if (showWarnings) {
                    toast.warning(t("max_decimals_exceeded", { max: MAX_DECIMALS }));
                }
            }
        }
    }

    // Add commas for thousands to integer part
    formattedInteger = formattedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    // Combine parts
    let result = formattedInteger;
    if (formattedDecimal && (maxDecimals !== undefined || maxDecimals === 0 || formattedDecimal !== "")) {
        result += `.${formattedDecimal}`;
    }

    // Add negative sign back if needed and allowed
    if (isNegative && allowNegative) {
        result = "-" + result;
    }

    return result;
};

// Validate number input with proper digit limits
// This function returns true for valid input, or an error message string for invalid input
// It does NOT show toast warnings - that's for the calling component to decide
export const validateNumberInput = (value, fieldName, maxDecimals = MAX_DECIMALS, _allowNegative = false) => {
    if (value === "" || value === undefined || value === null) return true;

    const numString = value.toString().replace(/,/g, "");
    const num = parseFloat(numString);

    if (isNaN(num)) {
        return t("must_be_a_number");
    }

    // Split into integer and decimal parts (handle negative)
    const absNumString = numString.replace("-", "");
    const parts = absNumString.split(".");
    const integerPart = parts[0];
    const decimalPart = parts[1] || "";

    // Check integer part digits
    if (integerPart.length > MAX_DIGITS) {
        return t("max_digits_error", { max: MAX_DIGITS });
    }

    // Check decimal places
    if (decimalPart.length > maxDecimals) {
        return t("max_decimals_error", { max: maxDecimals });
    }

    return true;
};

export const handleNumericInputChange = (e, field, fieldName, maxDecimals = MAX_DECIMALS, allowNegative = false) => {
    const rawInput = e.target.value;

    // Remove commas for processing
    const inputWithoutCommas = rawInput.replace(/,/g, "");

    // Handle empty input
    if (inputWithoutCommas === "" || (inputWithoutCommas === "-" && allowNegative)) {
        field.onChange(inputWithoutCommas);
        return;
    }

    // Check if trying to enter negative when not allowed
    if (!allowNegative && inputWithoutCommas.includes("-")) {
        toast.warning(t("invalid_number_warning", { field: t(fieldName) }));
        return;
    }

    // Check if trying to enter decimal when not allowed
    if ((maxDecimals === 0 || maxDecimals === '0' || maxDecimals === '') && inputWithoutCommas.includes(".")) {
        toast.warning(t("decimals_not_allowed"));
        return;
    }

    // Check if trying to exceed decimal places BEFORE regex validation
    const absValue = inputWithoutCommas.replace("-", "");
    const [integerPart, decimalPart] = absValue.split(".");
    
    if (decimalPart && decimalPart.length > maxDecimals) {
        toast.warning(t("max_decimals_exceeded", { max: maxDecimals }));
        return;
    }

    // Build regex pattern based on settings
    let pattern;
    if (allowNegative) {
        if (maxDecimals === 0) {
            pattern = /^-?[0-9]*$/; // Allow negative, no decimals
        } else {
            pattern = new RegExp(`^-?[0-9]*\\.?[0-9]{0,${maxDecimals}}$`); // Allow negative with decimals
        }
    } else {
        if (maxDecimals === 0) {
            pattern = /^[0-9]*$/; // No negative, no decimals
        } else {
            pattern = new RegExp(`^[0-9]*\\.?[0-9]{0,${maxDecimals}}$`); // No negative, with decimals
        }
    }

    const isValid = pattern.test(inputWithoutCommas);

    if (isValid) {
        const isNegative = inputWithoutCommas.startsWith("-");

        // If input ends with ".", format integer part and add dot
        if (rawInput.endsWith(".") && maxDecimals > 0) {
            const formattedIntegerWithCommas = integerPart.replace(
                /\B(?=(\d{3})+(?!\d))/g,
                ","
            );
            const result = isNegative ? `-${formattedIntegerWithCommas}.` : `${formattedIntegerWithCommas}.`;
            field.onChange(result);
            return;
        }

        // Format the value with commas (don't pass maxDecimals to keep natural formatting during input)
        const formattedValue = formatNumberWithCommas(inputWithoutCommas, undefined, allowNegative);
        field.onChange(formattedValue);
    } else {
        // Invalid input - show notification
        toast.warning(t("invalid_number_warning", { field: t(fieldName) }));
        return;
    }
};

// Helper function to format currency with negative sign after currency symbol
export const formatCurrencyWithNegative = (value, settings) => {
  if (!value && value !== 0) return "";
  
  const numValue = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  if (isNaN(numValue)) return "";
  
  const isNegative = numValue < 0;
  const absValue = Math.abs(numValue);
  const decimals = settings?.defaultDecimalPlaces || 2;
  
  // Format the absolute value with commas
  const formattedNumber = formatNumberWithCommas(absValue, decimals);
  
  // If showCurrency is disabled, return number with negative sign before
  if (!settings?.showCurrency) {
    return isNegative ? `-${formattedNumber}` : formattedNumber;
  }
  
  const currency = settings.defaultCurrency || "";
  const position = settings.defaultCurrencyPosition || "before";
  
  // Position currency and negative sign
  if (position === "after") {
    return isNegative ? `${formattedNumber} -${currency}` : `${formattedNumber} ${currency}`;
  } else {
    return isNegative ? `${currency} -${formattedNumber}` : `${currency} ${formattedNumber}`;
  }
};

// Remove formatting for submission
export const removeNumberFormatting = (value) => {
    if (!value) return null;
    const num = parseFloat(value.toString().replace(/,/g, ""));
    return isNaN(num) ? null : num;
};

export const validatePhoneNumber = (value) => {
  if (!value) return t("required_field");

  const onlyDigits = value.replace(/\D/g, "");

  if (!onlyDigits.startsWith("255")) {
    toast.warning(t("must_start_with_255"));
    return t("must_start_with_255");
  }

  if (onlyDigits.length !== 12) {
    // toast.warning(t("must_be_12_digits"));
    return t("12_digits_required");
  }

  return true;
};


export const handlePhoneInputChange = (e, field, _fieldName) => {
  let value = e.target.value;

  // Ondoa non-digits
  value = value.replace(/\D/g, "");

  // Hakikisha inaanza na '255'
  if (!value.startsWith("255")) {
    value = "255";
  }

  // Limit length to 12 digits
  if (value.length > 12) {
    toast.warning(t("must_be_12_digits"));
    value = value.substring(0, 12);
  }

  // Update field
  field.onChange(value);
};

/**
 * Cursor-position-aware numeric input handler with formatting.
 * Formats with commas while preserving cursor position during typing.
 * Supports decimals and handles deletion properly.
 * 
 * @param {Event} e - Input event
 * @param {Function} onChangeCallback - Callback receiving the formatted value
 * @param {Object} options - Options object
 * @param {number} options.maxDecimals - Maximum decimal places (default: 4)
 * @param {boolean} options.allowNegative - Allow negative values (default: false)
 * @param {number} options.maxDigits - Maximum integer digits (default: 12)
 * @returns {string} - The formatted value
 */
export const handleCursorAwareNumericInput = (e, onChangeCallback, options = {}) => {
  const {
    maxDecimals = 4,
    allowNegative = false,
    maxDigits = 12,
  } = options;

  const input = e.target;
  const rawValue = input.value;
  const cursorPos = input.selectionStart;

  // Handle empty input
  if (rawValue === "" || rawValue === null) {
    onChangeCallback("");
    return "";
  }

  // Handle just negative sign
  if (allowNegative && rawValue === "-") {
    onChangeCallback("-");
    return "-";
  }

  // Check if user typed a decimal point
  const hasDecimalPoint = rawValue.includes(".");

  // Remove all non-digit/non-decimal/non-negative characters (keep commas initially for cursor calc)
  let cleanValue = rawValue.replace(/[^0-9.-]/g, "");

  // Handle negative sign
  const isNegative = allowNegative && cleanValue.startsWith("-");
  cleanValue = cleanValue.replace(/-/g, "");

  // Handle multiple decimal points - only keep the first one
  const dotIndex = cleanValue.indexOf(".");
  if (dotIndex !== -1) {
    const beforeDot = cleanValue.substring(0, dotIndex);
    const afterDot = cleanValue.substring(dotIndex + 1).replace(/\./g, "");
    cleanValue = beforeDot + "." + afterDot;
  }

  // Split integer and decimal parts
  let [integerPart, decimalPart] = cleanValue.split(".");

  // Handle empty integer part (e.g., user typed ".5")
  if (integerPart === "") {
    integerPart = "0";
  }

  // Remove leading zeros (except for "0" alone or "0.xxx")
  if (integerPart.length > 1 && integerPart.startsWith("0")) {
    integerPart = integerPart.replace(/^0+/, "") || "0";
  }

  // Enforce max integer digits
  if (integerPart.length > maxDigits) {
    integerPart = integerPart.substring(0, maxDigits);
  }

  // Enforce max decimal places
  if (decimalPart !== undefined && decimalPart.length > maxDecimals) {
    decimalPart = decimalPart.substring(0, maxDecimals);
  }

  // Calculate how many commas were before cursor in original value
  const _commasBeforeCursor = (rawValue.substring(0, cursorPos).match(/,/g) || []).length;

  // Format integer part with commas
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // Build formatted value
  let formattedValue = formattedInteger;
  
  // Add decimal part if it exists OR if user typed a decimal point
  if (decimalPart !== undefined) {
    formattedValue += "." + decimalPart;
  } else if (hasDecimalPoint && maxDecimals > 0) {
    // User typed a decimal point but hasn't added digits after it yet
    formattedValue += ".";
  }

  // Add negative sign if needed
  if (isNegative) {
    formattedValue = "-" + formattedValue;
  }

  // Calculate new cursor position based on formatting changes
  const newCommasCount = (formattedValue.match(/,/g) || []).length;
  const oldCommasCount = (rawValue.match(/,/g) || []).length;
  
  // Count commas before cursor position in the new formatted value
  let newCursorPos = cursorPos;
  
  // If we added/removed commas, adjust cursor
  if (newCommasCount !== oldCommasCount) {
    // Count digits before cursor in original
    const digitsBeforeCursor = rawValue.substring(0, cursorPos).replace(/[^0-9]/g, "").length;
    
    // Find position in formatted value where we have same number of digits
    let digitCount = 0;
    newCursorPos = 0;
    for (let i = 0; i < formattedValue.length; i++) {
      if (/[0-9]/.test(formattedValue[i])) {
        digitCount++;
      }
      newCursorPos = i + 1;
      if (digitCount >= digitsBeforeCursor) {
        break;
      }
    }
  }
  
  // Account for decimal point position
  if (hasDecimalPoint && !rawValue.substring(0, cursorPos).includes(".") && 
      formattedValue.includes(".") && cursorPos > formattedValue.indexOf(".")) {
    // Cursor was after where decimal is now, no adjustment needed
  }
  
  // Make sure cursor doesn't go out of bounds
  newCursorPos = Math.max(0, Math.min(newCursorPos, formattedValue.length));

  // Update the value
  onChangeCallback(formattedValue);

  // Restore cursor position after React re-renders
  requestAnimationFrame(() => {
    if (input && document.activeElement === input) {
      input.setSelectionRange(newCursorPos, newCursorPos);
    }
  });

  return formattedValue;
};

/**
 * Get the raw numeric value from a formatted string, returning it as a string.
 * Useful for maintaining decimal precision during input.
 * 
 * @param {string} value - Formatted value with commas
 * @returns {string} - Clean numeric string without commas
 */
export const getRawNumericString = (value) => {
  if (!value) return "";
  return value.toString().replace(/,/g, "");
};

