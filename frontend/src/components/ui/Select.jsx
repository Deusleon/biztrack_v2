import { useState, useEffect, useRef } from 'react';

const Select = ({
  options = [],
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  name,
  required = false,
  error,
  helperText,
  disabled = false,
  searchable = false,
  multiple = false,
  className = '',
  size = 'md',
  dropdownClassName = '',
  title,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedValue = value || (multiple ? [] : '');

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // Filter options based on search term
  const filteredOptions = searchable
    ? options.filter((option) =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  // Handle selection
  const handleSelect = (option) => {
    let newValue;

    if (multiple) {
      newValue = selectedValue.includes(option.value)
        ? selectedValue.filter((v) => v !== option.value)
        : [...selectedValue, option.value];
    } else {
      newValue = option.value;
      setIsOpen(false);
      setSearchTerm('');
    }

    if (onChange) {
      onChange({ target: { value: newValue, name } });
    }
  };

  // Remove selected item (for multiple select)
  const removeSelected = (valueToRemove, e) => {
    e.stopPropagation();
    const newValue = selectedValue.filter((v) => v !== valueToRemove);
    if (onChange) {
      onChange({ target: { value: newValue, name } });
    }
  };

  // Clear all selections (for multiple select)
  const clearAll = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange({ target: { value: [], name } });
    }
  };

  // Get display value
  const getDisplayValue = () => {
    if (multiple) {
      if (selectedValue.length === 0) return placeholder;
      return `${selectedValue.length} selected`;
    }

    const selectedOption = options.find((opt) => opt.value === selectedValue);
    return selectedOption?.label || placeholder;
  };

  // Check if option is selected
  const isSelected = (value) => {
    return multiple ? selectedValue.includes(value) : selectedValue === value;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef} title={title}>
      {label && (
        <label className="block text-sm text-left font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Select trigger */}
      <div
        className={`
          w-full text-left ${size === 'sm' ? 'px-2.5 py-1' : 'px-4 py-2.5'}
          bg-white border rounded
          text-gray-900 text-sm
          cursor-pointer
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
          ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}
          ${isOpen ? 'ring-2 ring-primary border-transparent' : 'hover:border-gray-400'}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          {/* Display value or selected tags */}
          <div className="flex-1 truncate">
            {multiple && selectedValue.length > 0 ? (
              <div className="w-full flex flex-wrap gap-1">
                {selectedValue.slice(0, 2).map((val) => {
                  const option = options.find((opt) => opt.value === val);
                  return (
                    <span
                      key={val}
                      className="inline-flex items-center bg-primary-10 text-primary rounded px-2 py-0.5 text-xs font-medium"
                    >
                      {option?.label || val}
                      <button
                        type="button"
                        className="ml-1 hover:text-red-600"
                        onClick={(e) => removeSelected(val, e)}
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </span>
                  );
                })}
                {selectedValue.length > 2 && (
                  <span className="text-xs text-gray-500">
                    +{selectedValue.length - 2} more
                  </span>
                )}
              </div>
            ) : (
              <span
                className={
                  !selectedValue || (multiple && selectedValue.length === 0)
                    ? 'text-gray-400'
                    : 'text-gray-900'
                }
              >
                {getDisplayValue()}
              </span>
            )}
          </div>

          {/* Icons */}
          <div className="flex items-center ml-2 space-x-1">
            {multiple && selectedValue.length > 0 && (
              <button
                type="button"
                className="hover:text-red-600 transition-colors"
                onClick={clearAll}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
                isOpen ? 'transform rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Dropdown menu */}
      {isOpen && !disabled && (
        <div className={`absolute z-50 mt-1 w-full bg-white border border-gray-300 rounded shadow-lg overflow-hidden ${dropdownClassName}`}>
          {/* Search input */}
          {searchable && (
            <div className="p-2 border-b border-gray-200">
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search..."
                  className="w-full px-3 py-2 pl-9 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <svg
                  className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          )}

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className={`
                    ${size === 'sm' ? 'px-3 py-2' : 'px-4 py-2.5'} cursor-pointer flex items-center justify-between space-x-2
                    text-sm text-gray-900
                    transition-colors duration-150
                    hover:bg-primary-5
                    ${isSelected(option.value) ? 'bg-primary-10 text-primary font-medium' : ''}
                  `}
                  onClick={() => handleSelect(option)}
                >
                  <span>
                    {option.label}
                  </span>
                  {isSelected(option.value) && (
                    <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                No options found
              </div>
            )}
          </div>
        </div>
      )}

      {/* Helper text or error */}
      {helperText && !error && (
        <p className="mt-1 text-left ms-0.5 text-xs text-gray-500">{helperText}</p>
      )}

      {error && (
        <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default Select;
