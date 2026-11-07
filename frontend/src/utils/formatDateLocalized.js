import { t } from "./i18n";

export const formatDateLocalized = (isoDate, settings = {}) => {
    if (!isoDate) return "";

    // Convert to date
    const date = new Date(isoDate);
    date.setHours(date.getHours());

    const monthKeys = [
        "jan", "feb", "mar", "apr", "may", "jun",
        "jul", "aug", "sep", "oct", "nov", "dec"
    ];

    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    const monthFull = t(`months.${monthKeys[date.getMonth()]}`);
    const monthShort = monthFull.substring(0, 3); // e.g., "Jan"

    // Get date format from settings (default: 1 = DD-MM-YYYY)
    const dateFormat = settings.defaultDateFormat || 1;
    
    let formattedDate;
    switch (dateFormat) {
        case "1": // DD-MM-YYYY
            formattedDate = `${day}-${month}-${year}`;
            break;
        case "2": // MM-DD-YYYY
            formattedDate = `${month}-${day}-${year}`;
            break;
        case "3": // YYYY-MM-DD
            formattedDate = `${year}-${month}-${day}`;
            break;
        case "4": // DD-MMM-YYYY
            formattedDate = `${monthShort} ${day}, ${year}`;
            break;
        case "5": // DD-MMMM-YYYY
            formattedDate = `${monthFull} ${day}, ${year}`;
            break;
        default: // Default to DD-MM-YYYY
            formattedDate = `${day}-${month}-${year}`;
    }

    // Check if time should be shown (default: true)
    const showTime = settings.showDateWithTime !== false;
    
    if (!showTime) {
        return formattedDate;
    }

    // Get time format from settings (default: 12)
    const timeFormat = settings.defaultTimeFormat || "12";
    
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    let timeString;

    if (timeFormat === "24") {
        // 24-hour format
        const hours24 = hours.toString().padStart(2, "0");
        timeString = `${hours24}:${minutes}`;
    } else {
        // 12-hour format
        // Detect current language
        const currentLang = window.__auth_user?.preferred_language || localStorage.getItem("lang") || "en";
        
        if (currentLang === "sw") {
            // Swahili time system: add 6 hours
            let dayPeriod;

            if (hours >= 5 && hours < 12) {
                dayPeriod = t("day_period.morning");
            } else if (hours >= 12 && hours < 16) {
                dayPeriod = t("day_period.noon");
            } else if (hours >= 16 && hours < 20) {
                dayPeriod = t("day_period.evening");
            } else if (hours >= 20 && hours <= 23) {
                dayPeriod = t("day_period.night");
            } else if (hours >= 0 && hours < 5) {
                dayPeriod = t("day_period.midnight");
            }

            const hours12 = ((hours + 6) % 12) || 12;
            timeString = `${t("time_prefix", { defaultValue: "saa" })} ${hours12}:${minutes} ${dayPeriod}`;
        } else {
            // Standard 12-hour format (English and others)
            const hours12 = hours % 12 || 12;
            const period = hours >= 12 ? "PM" : "AM";
            timeString = `${hours12}:${minutes} ${period}`;
        }
    }

    return `${formattedDate}, ${timeString}`;
};

export const DATE_FORMATS = {
  1: "dd-MM-yyyy",    // dd_mm_yyyy
  2: "MM-dd-yyyy",    // mm_dd_yyyy
  3: "yyyy-MM-dd",    // yyyy_mm_dd
  4: "MMM dd, yyyy",   // dd_mmm_yyyy
  5: "MMMM dd, yyyy",  // dd_mmmm_yyyy
};