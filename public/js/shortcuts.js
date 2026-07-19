// DOIT Keyboard Shortcuts Module

export function initShortcuts(callbacks = {}) {
  document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isEditing = activeEl && (
      activeEl.tagName === 'INPUT' || 
      activeEl.tagName === 'TEXTAREA' || 
      activeEl.isContentEditable
    );

    // 1. Focus Quick Add (Ctrl + N) - Global, always works
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      const taskInput = document.getElementById('task-title-input');
      if (taskInput) {
        taskInput.focus();
        taskInput.select();
      }
      return;
    }

    // 2. Open Global Search (Ctrl + K) - Global, always works
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (typeof callbacks.toggleSearch === 'function') {
        callbacks.toggleSearch();
      }
      return;
    }

    // 3. Toggle Sidebar (Ctrl + B) - Global
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      if (typeof callbacks.toggleSidebar === 'function') {
        callbacks.toggleSidebar();
      }
      return;
    }

    // 4. Toggle Theme (Ctrl + D) - Global
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (typeof callbacks.toggleTheme === 'function') {
        callbacks.toggleTheme();
      }
      return;
    }

    // 5. Esc - Close any modal or Details pane
    if (e.key === 'Escape') {
      if (typeof callbacks.closeAllOverlays === 'function') {
        callbacks.closeAllOverlays();
      }
      return;
    }

    // --- The following shortcuts ONLY trigger when NOT actively editing text ---
    if (isEditing) return;

    // 6. Help / Keyboard Shortcuts Guide (?)
    if (e.key === '?' || e.key === '/') {
      e.preventDefault();
      if (typeof callbacks.toggleShortcuts === 'function') {
        callbacks.toggleShortcuts();
      }
      return;
    }

    // 7. Toggle Completion (Spacebar) - If details panel is visible and a task is selected
    if (e.key === ' ' || e.code === 'Space') {
      const detailsForm = document.getElementById('details-form');
      if (detailsForm && !detailsForm.classList.contains('hidden')) {
        e.preventDefault();
        if (typeof callbacks.toggleActiveTaskStatus === 'function') {
          callbacks.toggleActiveTaskStatus();
        }
      }
    }

    // 8. Delete Selected Task (Delete key) - If details panel is visible and active
    if (e.key === 'Delete' || e.key === 'Del') {
      const detailsForm = document.getElementById('details-form');
      if (detailsForm && !detailsForm.classList.contains('hidden')) {
        e.preventDefault();
        if (typeof callbacks.deleteActiveTask === 'function') {
          callbacks.deleteActiveTask();
        }
      }
    }
  });
}
