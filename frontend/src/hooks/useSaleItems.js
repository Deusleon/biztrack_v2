import { useState, useCallback, useEffect } from "react";
import { formatNumberWithCommas, removeNumberFormatting } from "@/utils/numberUtils";

/**
 * Custom hook to manage sale item rows with live calculations
 * @param {Object} options
 * @param {boolean} options.discountEnabled - Whether discount column is visible
 * @param {boolean} options.vatEnabled - Whether VAT column is visible
 * @param {number} options.vatRate - VAT rate percentage (e.g., 18)
 * @param {Object} options.settings - Store settings
 * @returns {Object} Sale items state and handlers
 */
export const useSaleItems = ({ discountEnabled = false, vatEnabled = false, vatRate = 0, settings = {} }) => {
  // Get decimal places from settings
  const decimalPlaces = settings?.defaultDecimalPlaces !== undefined ? settings.defaultDecimalPlaces : 0;
  
  // Get discount configuration
  const discountType = settings?.defaultDiscountType || "amount"; // "amount" or "percentage"
  const discountMode = settings?.defaultDiscountMode || "unit"; // "unit" or "volume"
  
  // Volume discount state (for "volume" mode)
  const [volumeDiscount, setVolumeDiscount] = useState(0);

  const createEmptyRow = useCallback((id = null) => ({
    id: id || Date.now().toString() + Math.random().toString(36).substr(2, 5),
    selected: false,
    productId: null,
    productName: "",
    unit: "",
    quantityLeft: 0,
    quantity: "", // Start at 1
    price: "",
    discount: discountType === "percentage" ? "0%" : formatNumberWithCommas(0, decimalPlaces),
    vat: "",
    total: "",
    rawPrice: 0,
    rawDiscount: 0,
    rawQuantity: 0, // Start at 1
    rawVat: 0,
    rawTotal: 0,
    barcode: "",
  }), [discountType, decimalPlaces]);

  const [items, setItems] = useState([createEmptyRow()]);

  // Recalculate a single row's totals
  const recalculateRow = useCallback((item, _currentVolumeDiscount = volumeDiscount) => {
    const qty = removeNumberFormatting(item.rawQuantity) ?? 0;
    const price = removeNumberFormatting(item.rawPrice) ?? 0;
    
    // Calculate line subtotal (qty * price)
    const _lineSubtotal = qty * price;
    
    // Calculate discount based on mode and type
    let discountAmount = 0;
    if (discountEnabled && discountMode === "unit") {
      // Per-unit discount mode - use row-level discount
      const rowDiscount = removeNumberFormatting(item.rawDiscount) || 0;
      if (discountType === "percentage") {
        // Percentage discount per unit
        discountAmount = (price * rowDiscount) / 100;
      } else {
        // Amount discount per unit
        discountAmount = rowDiscount;
      }
    }
    // Volume discount is handled at the summary level, not per row

    const afterDiscount = qty * (price - discountAmount);
    
    // Calculate VAT
    let vatAmount = 0;
    if (vatEnabled && vatRate > 0) {
      vatAmount = (afterDiscount * vatRate) / 100;
    }
    
    const total = afterDiscount + vatAmount;

    return {
      ...item,
      vat: formatNumberWithCommas(vatAmount, decimalPlaces),
      rawVat: vatAmount,
      total: formatNumberWithCommas(total, decimalPlaces),
      rawTotal: total,
      rawDiscountAmount: discountAmount, // Store calculated discount amount
    };
  }, [discountEnabled, discountMode, discountType, vatEnabled, vatRate, volumeDiscount, decimalPlaces]);

  // Add a new empty row
  const addRow = useCallback(() => {
    setItems((prev) => [...prev, createEmptyRow()]);
  }, [createEmptyRow]);

  // Delete selected rows
  const deleteSelectedRows = useCallback(() => {
    setItems((prev) => {
      const remaining = prev.filter((item) => !item.selected);
      // Always keep at least one row
      return remaining.length > 0 ? remaining : [createEmptyRow()];
    });
  }, [createEmptyRow]);

  // Toggle selection for a row
  const toggleRowSelection = useCallback((rowId) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === rowId ? { ...item, selected: !item.selected } : item
      )
    );
  }, []);

  // Toggle select all
  const toggleSelectAll = useCallback((selectAll) => {
    setItems((prev) => prev.map((item) => ({ ...item, selected: selectAll })));
  }, []);

  // Update a field in a specific row
  const updateItem = useCallback((rowId, field, value) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== rowId) return item;

        const updated = { ...item, [field]: value };

        // Handle raw value updates
        if (field === "quantity" || field === "rawQuantity") {
          const n = removeNumberFormatting(value);
          updated.rawQuantity = n == null ? 0 : n;
          if (field === "rawQuantity") updated.quantity = String(value);
        } else if (field === "price" || field === "rawPrice") {
          const n = removeNumberFormatting(value);
          updated.rawPrice = n == null ? 0 : n;
          if (field === "rawPrice") updated.price = formatNumberWithCommas(updated.rawPrice, decimalPlaces);
        } else if (field === "discount" || field === "rawDiscount") {
          const n = removeNumberFormatting(value);
          updated.rawDiscount = n == null ? 0 : n;
          if (field === "rawDiscount") updated.discount = String(value);
        }

        return recalculateRow(updated);
      })
    );
  }, [recalculateRow, decimalPlaces]);

  // Set product data for a row (from autocomplete selection)
  const setProductForRow = useCallback((rowId, product) => {
    let newRowAdded = false;
    
    setItems((prev) => {
      const updatedItems = prev.map((item) => {
        if (item.id !== rowId) return item;

        const priceValue = product.price || 0;
        const updated = {
          ...item,
          productId: product.id,
          productName: product.name,
          barcode: product.barcode || "",
          unit: product.unit || "",
          quantityLeft: product.currentStock || 0,
          rawPrice: priceValue,
          price: formatNumberWithCommas(priceValue, decimalPlaces),
          rawQuantity: 1, // Set to 1 when product is selected
          quantity: "1",
          discount: settings?.defaultDiscountType === "amount" ? formatNumberWithCommas(0, decimalPlaces) : "0%",
          rawDiscount: 0,
        };

        return recalculateRow(updated);
      });
      
      // Only add a new empty row if there is no empty row at the end already
      const lastItem = updatedItems[updatedItems.length - 1];
      const hasEmptyRowAtEnd = lastItem && !lastItem.productId;
      
      if (!hasEmptyRowAtEnd) {
        newRowAdded = true;
        return [...updatedItems, createEmptyRow()];
      }
      
      return updatedItems;
    });
    
    return newRowAdded;
  }, [recalculateRow, decimalPlaces, settings, createEmptyRow]);

  // Clear product from a row
  const clearProductFromRow = useCallback((rowId) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== rowId) return item;
        return createEmptyRow(rowId);
      })
    );
  }, [createEmptyRow]);

  // Reset all items
  const resetItems = useCallback(() => {
    setItems([createEmptyRow()]);
  }, [createEmptyRow]);

  // Load items from a saved cart (for cart persistence)
  const loadItems = useCallback((cartItems) => {
    if (!cartItems || cartItems.length === 0) {
      setItems([createEmptyRow()]);
      return;
    }
    const loaded = cartItems.map((ci) => {
      const row = {
        id: ci.id || Date.now().toString() + Math.random().toString(36).substr(2, 5),
        selected: false,
        productId: ci.product_id || ci.productId || null,
        productName: ci.product_name || ci.productName || "",
        unit: ci.unit || "",
        status: ci.status || "",
        quantityLeft: removeNumberFormatting(ci.currentStock || ci.quantityLeft || 0),
        quantity: String(ci.quantity || 1),
        price: formatNumberWithCommas(ci.price || 0, decimalPlaces),
        discount: formatNumberWithCommas(ci.discount || 0, decimalPlaces),
        vat: formatNumberWithCommas(0, decimalPlaces),
        total: formatNumberWithCommas(0, decimalPlaces),
        rawPrice: removeNumberFormatting(ci.price || 0),
        rawDiscount: removeNumberFormatting(ci.discount || 0),
        rawQuantity: removeNumberFormatting(ci.quantity || 1),
        rawVat: 0,
        rawTotal: 0,
        barcode: ci.barcode || "",
      };
      return recalculateRow(row);
    });
    setItems([...loaded, createEmptyRow()]);
  }, [recalculateRow, createEmptyRow, decimalPlaces]);

  // Add product by barcode (for barcode scanner)
  const addProductByBarcode = useCallback((barcode, productsArray) => {
    if (!barcode || !productsArray || productsArray.length === 0) return false;

    const product = productsArray.find(
      (p) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase()
    );

    if (!product) return false;

    setItems((prev) => {
      // Check if product already exists in cart
      const existingIndex = prev.findIndex((item) => item.productId === product.id);

      if (existingIndex >= 0) {
        // Increment quantity by 1
        return prev.map((item, idx) => {
          if (idx !== existingIndex) return item;
          const newQty = (removeNumberFormatting(item.rawQuantity) || 0) + 1;
          const updated = {
            ...item,
            rawQuantity: newQty,
            quantity: String(newQty),
          };
          return recalculateRow(updated);
        });
      } else {
        // Find first empty row (no product selected)
        const emptyIndex = prev.findIndex((item) => !item.productId);
        const priceValue = product.price || 0;

        const newItem = recalculateRow({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          selected: false,
          productId: product.id,
          productName: product.name,
          barcode: product.barcode || "",
          quantityLeft: product.currentStock || 0,
          rawPrice: priceValue,
          price: formatNumberWithCommas(priceValue, decimalPlaces),
          rawQuantity: 1,
          quantity: "1",
          discount: formatNumberWithCommas(0, decimalPlaces),
          rawDiscount: 0,
          vat: formatNumberWithCommas(0, decimalPlaces),
          rawVat: 0,
          total: formatNumberWithCommas(0, decimalPlaces),
          rawTotal: 0,
        });

        if (emptyIndex >= 0) {
          // Replace empty row
          return prev.map((item, idx) => (idx === emptyIndex ? newItem : item));
        } else {
          // Add new row
          return [...prev, newItem];
        }
      }
    });

    return true;
  }, [recalculateRow, decimalPlaces]);

  // Calculate totals
  const hasSelectedRows = items.some((item) => item.selected);
  const allSelected = items.length > 0 && items.every((item) => item.selected);

  // Subtotal: sum of (qty * price) for all items
  const subtotal = items.reduce((sum, item) => {
    const qty = removeNumberFormatting(item.rawQuantity) || 0;
    const price = removeNumberFormatting(item.rawPrice) || 0;
    return sum + qty * price;
  }, 0);

  // Calculate total discount based on mode
  let totalDiscount = 0;
  if (discountEnabled) {
    if (discountMode === "volume") {
      // Volume discount applies to entire cart
      const discountValue = removeNumberFormatting(volumeDiscount) || 0;
      if (discountType === "percentage") {
        totalDiscount = (subtotal * discountValue) / 100;
      } else {
        totalDiscount = discountValue;
      }
    } else {
      // Per-unit discount - sum of all row discounts
      totalDiscount = items.reduce((sum, item) => {
        return sum + (removeNumberFormatting(item.rawDiscountAmount * item.rawQuantity) || 0);
      }, 0);
    }
  }

  // Total VAT - for volume discount mode, calculate on discounted subtotal;
  // for unit discount mode, row-level VAT already reflects per-unit discount
  let totalVat = 0;
  if (vatEnabled && vatRate > 0) {
    if (discountEnabled && discountMode === "volume" && totalDiscount > 0) {
      totalVat = ((subtotal - totalDiscount) * vatRate) / 100;
    } else {
      totalVat = items.reduce((sum, item) => sum + (removeNumberFormatting(item.rawVat) || 0), 0);
    }
  }

  // Grand total
  const grandTotal = subtotal - totalDiscount + totalVat;

  // Update volume discount (for volume mode)
  const updateVolumeDiscount = useCallback((value) => {
    setVolumeDiscount(removeNumberFormatting(value) || 0);
  }, []);

  // Recalculate all rows when settings change
  useEffect(() => {
    setItems((prev) => prev.map((item) => recalculateRow(item)));
  }, [discountEnabled, vatEnabled, vatRate, recalculateRow]);

  return {
    items,
    setItems,
    addRow,
    deleteSelectedRows,
    toggleRowSelection,
    toggleSelectAll,
    updateItem,
    setProductForRow,
    clearProductFromRow,
    resetItems,
    loadItems,
    addProductByBarcode,
    hasSelectedRows,
    allSelected,
    subtotal,
    totalDiscount,
    totalVat,
    grandTotal,
    // Volume discount
    volumeDiscount,
    updateVolumeDiscount,
    // Settings info
    discountMode,
    discountType,
  };
};
