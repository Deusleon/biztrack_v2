import { forwardRef } from 'react';

const Textarea = forwardRef(({
  label,
  error,
  helperText,
  className = '',
  required = false,
  rows = 3,
  ...props
}, ref) => {
  return (
    <div className={`${className}`}>
      {label && (
        <label className="block text-sm text-left font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        rows={rows}
        className={`
          w-full px-4 py-2.5
          bg-white border rounded
          text-gray-900 text-sm
          placeholder-gray-400
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
          hover:border-gray-400
          resize-none
          ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}
          disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500
        `}
        {...props}
      />

      {helperText && !error && (
        <p className="mt-1 text-xs text-left text-gray-500">{helperText}</p>
      )}

      {error && (
        <p className="mt-1 text-xs text-left text-red-500">{error}</p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';

export default Textarea;
