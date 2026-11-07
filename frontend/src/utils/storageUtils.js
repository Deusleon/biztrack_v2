export const saveState = (key, state) => {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem(key, serializedState);
  } catch (err) {
    console.error('Error saving state:', err);
  }
};

export const loadState = (key) => {
  try {
    const serializedState = localStorage.getItem(key);
    return serializedState ? JSON.parse(serializedState) : null;
  } catch (err) {
    console.error('Error loading state:', err);
    return null;
  }
};

export const clearState = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.error('Error clearing state:', err);
  }
};