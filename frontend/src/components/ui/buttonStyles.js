// Shared look of every button: used by <Button> and <ActionLink> so a link that looks like a button is identical.
export const BUTTON_BASE =
  "inline-flex items-center justify-center font-medium rounded transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";

export const BUTTON_VARIANTS = {

  primary:
    "bg-primary text-white hover:opacity-90 focus-visible:ring-primary",
  lightPrimary:
    "bg-primary-20 text-primary hover:bg-primary-30 focus-visible:ring-primary",
  secondary:
    "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus-visible:ring-gray-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
  lightDanger:
    "bg-red-200 text-red-700 hover:bg-red-300 focus-visible:ring-red-500",
  success:
    "bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500",
  lightSuccess:
    "bg-green-200 text-green-600 hover:bg-green-300 focus-visible:ring-green-500",
  ghost:
    "bg-gray-200 text-gray-600 hover:bg-gray-300 focus-visible:ring-gray-500",
  outline:
    "bg-transparent text-gray-700 border border-gray-300 hover:bg-gray-50 focus-visible:ring-gray-400",
  link: "bg-primary-20 text-primary hover:bg-primary-30 focus-visible:ring-primary p-3",
};

export const BUTTON_SIZES = {

  xs: "text-xs px-2.5 py-1 gap-1.5",
  sm: "text-sm px-3 py-1.5 gap-1.5",
  md: "text-sm px-4 py-2.5 gap-2",
  lg: "text-base px-5 py-2.5 gap-2",
};
