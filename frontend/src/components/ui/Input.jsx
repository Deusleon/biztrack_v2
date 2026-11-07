import { forwardRef } from 'react';

const Input = forwardRef(({ 
  label, 
  error, 
  helperText, 
  className = '', 
  leftIcon,
  rightIcon,
  required = false,
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
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            {leftIcon}
          </div>
        )}
        
        <input
          ref={ref}
          className={`
            w-full px-4 py-2.5
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
            bg-white border rounded
            text-gray-900 text-sm
            placeholder-gray-400
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
            hover:border-gray-400
            ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}
            disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500
          `}
          {...props}
        />
        
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            {rightIcon}
          </div>
        )}
      </div>
      
      {helperText && !error && (
        <p className="mt-1 text-left ms-0.5 text-xs text-gray-500">{helperText}</p>
      )}
      
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
