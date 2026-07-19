// DOIT Main Application Controller
import { api } from './api.js';
import { initTheme, toggleTheme } from './theme.js';
import { initShortcuts } from './shortcuts.js';

// Application State
const state = {
  tasks: [],
  projects: [],
  tags: [],
  activeFilter: { type: 'list', value: 'all' }, // type: 'list'|'project'|'tag', value: id or string
  selectedTask: null,
  searchQuery: '',
  autoSaveTimer: null,
  notifiedCache: new Set() // Tracks triggered notification keys in-session
};

// DOM Cache
const dom = {
  sidebar: document.getElementById('sidebar'),
  projectList: document.getElementById('project-list'),
  tagCloud: document.getElementById('tag-cloud'),
  taskList: document.getElementById('task-list'),
  emptyState: document.getElementById('empty-state'),
  currentListTitle: document.getElementById('current-list-title'),
  dailyProgressSubtitle: document.getElementById('daily-progress-subtitle'),
  headerProgressBar: document.getElementById('header-progress-bar'),
  headerProgressPercent: document.getElementById('header-progress-percent'),
  
  // Forms
  quickAddForm: document.getElementById('quick-add-form'),
  taskTitleInput: document.getElementById('task-title-input'),
  quickAddProject: document.getElementById('quick-add-project'),
  quickAddPriority: document.getElementById('quick-add-priority'),
  quickAddDate: document.getElementById('quick-add-date'),

  // Details
  detailsPanel: document.getElementById('details-panel'),
  detailsContent: document.getElementById('details-content'),
  detailsEmptyState: document.getElementById('details-empty-state'),
  detailsForm: document.getElementById('details-form'),
  detailTitle: document.getElementById('detail-title'),
  detailProject: document.getElementById('detail-project'),
  detailDueDate: document.getElementById('detail-due-date'),
  detailReminder: document.getElementById('detail-reminder'),
  detailRecurring: document.getElementById('detail-recurring'),
  detailTagsContainer: document.getElementById('detail-tags-container'),
  detailTagsInput: document.getElementById('detail-tags-input'),
  detailDescription: document.getElementById('detail-description'),
  deleteTaskBtn: document.getElementById('delete-task-btn'),
  closeDetailsBtn: document.getElementById('close-details-btn'),
  autoSaveIndicator: document.getElementById('auto-save-indicator'),

  // Project creator inline panel
  addProjectBtn: document.getElementById('add-project-btn'),
  projectInputContainer: document.getElementById('project-input-container'),
  projectNameInput: document.getElementById('project-name-input'),
  saveProjectBtn: document.getElementById('save-project-btn'),
  cancelProjectBtn: document.getElementById('cancel-project-btn'),
  projectColorPicker: document.getElementById('project-color-picker'),

  // Modals
  searchModal: document.getElementById('search-modal'),
  searchTriggerBtn: document.getElementById('search-trigger-btn'),
  globalSearchInput: document.getElementById('global-search-input'),
  closeSearchBtn: document.getElementById('close-search-btn'),
  searchResultsList: document.getElementById('search-results-list'),
  
  shortcutsModal: document.getElementById('shortcuts-modal'),
  helpBtn: document.getElementById('help-btn'),
  closeShortcutsBtn: document.getElementById('close-shortcuts-btn'),
  menuBtn: document.getElementById('menu-btn')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  // Init Theme and Keyboard Shortcuts
  await initTheme();
  
  initShortcuts({
    toggleSearch,
    toggleSidebar,
    toggleShortcuts,
    toggleTheme,
    closeAllOverlays,
    toggleActiveTaskStatus,
    deleteActiveTask
  });

  // Request browser notification permissions
  if ('Notification' in window && Notification.permission === 'default') {
    // Request silently or wait for user click. Let's register it.
    Notification.requestPermission();
  }

  // Setup Event Listeners
  setupEventListeners();

  // Load Initial Data
  await refreshData();
  
  // Background loop for reminders checking (every 15 seconds)
  setInterval(checkReminders, 15000);
});

// Setup DOM Event Handlers
function setupEventListeners() {
  // Mobile Navigation toggle
  dom.menuBtn.addEventListener('click', () => {
    dom.sidebar.classList.toggle('active');
  });

  // Nav filter button click handlers
  document.querySelectorAll('.nav-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filterValue = btn.getAttribute('data-filter');
      
      document.querySelectorAll('.nav-filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.project-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.activeFilter = { type: 'list', value: filterValue };
      refreshTaskList();
      
      // Close sidebar in mobile view
      dom.sidebar.classList.remove('active');
    });
  });

  // Create Project Inline controls
  dom.addProjectBtn.addEventListener('click', () => {
    dom.projectInputContainer.classList.remove('hidden');
    dom.projectNameInput.focus();
  });

  dom.cancelProjectBtn.addEventListener('click', () => {
    dom.projectInputContainer.classList.add('hidden');
    dom.projectNameInput.value = '';
  });

  // Color picker dot selections
  dom.projectColorPicker.addEventListener('click', (e) => {
    if (e.target.classList.contains('color-dot')) {
      dom.projectColorPicker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      e.target.classList.add('active');
    }
  });

  dom.saveProjectBtn.addEventListener('click', async () => {
    const name = dom.projectNameInput.value.trim();
    if (!name) return;

    const activeColorDot = dom.projectColorPicker.querySelector('.color-dot.active');
    const color = activeColorDot ? activeColorDot.getAttribute('data-color') : '#3b82f6';

    try {
      await api.createProject(name, color);
      dom.projectNameInput.value = '';
      dom.projectInputContainer.classList.add('hidden');
      await refreshData();
    } catch (err) {
      alert(err.message || 'Failed to create project');
    }
  });

  // Create Task Form Submit
  dom.quickAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = dom.taskTitleInput.value.trim();
    if (!title) return;

    const projectId = dom.quickAddProject.value ? parseInt(dom.quickAddProject.value) : null;
    const priority = dom.quickAddPriority.value;
    const dueDate = dom.quickAddDate.value || null;

    try {
      const newTask = await api.createTask(title, projectId, priority, dueDate);
      dom.taskTitleInput.value = '';
      dom.quickAddDate.value = '';
      
      await refreshData();
      
      // Auto open newly created task in details panel
      selectTask(newTask);
    } catch (err) {
      console.error(err);
      alert('Failed to add task.');
    }
  });

  // Search Modal Toggles
  dom.searchTriggerBtn.addEventListener('click', toggleSearch);
  dom.closeSearchBtn.addEventListener('click', () => dom.searchModal.classList.add('hidden'));
  dom.globalSearchInput.addEventListener('input', debounce(executeSearch, 300));
  dom.searchModal.addEventListener('click', (e) => {
    if (e.target === dom.searchModal) dom.searchModal.classList.add('hidden');
  });

  // Help Shortcuts Modal
  dom.helpBtn.addEventListener('click', toggleShortcuts);
  dom.closeShortcutsBtn.addEventListener('click', () => dom.shortcutsModal.classList.add('hidden'));
  dom.shortcutsModal.addEventListener('click', (e) => {
    if (e.target === dom.shortcutsModal) dom.shortcutsModal.classList.add('hidden');
  });

  // Details Panel Closing
  dom.closeDetailsBtn.addEventListener('click', () => {
    closeDetailsPanel();
  });

  // Details Fields Auto-saves (Instant on change/blur)
  dom.detailProject.addEventListener('change', () => saveActiveTaskField('project_id', dom.detailProject.value ? parseInt(dom.detailProject.value) : null));
  dom.detailDueDate.addEventListener('change', () => saveActiveTaskField('due_date', dom.detailDueDate.value || null));
  dom.detailReminder.addEventListener('change', () => saveActiveTaskField('reminder_time', dom.detailReminder.value || null));
  dom.detailRecurring.addEventListener('change', () => saveActiveTaskField('recurring', dom.detailRecurring.value));

  // Details Title & Notes (Debounced keyups)
  dom.detailTitle.addEventListener('input', () => {
    showSavingIndicator(true);
    debounceAutoSave(() => saveActiveTaskField('title', dom.detailTitle.value.trim()));
  });

  dom.detailDescription.addEventListener('input', () => {
    showSavingIndicator(true);
    debounceAutoSave(() => saveActiveTaskField('description', dom.detailDescription.value));
  });

  // Priority Button Selection Click Handlers
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const priority = btn.getAttribute('data-priority');
      saveActiveTaskField('priority', priority);
    });
  });

  // Tags Entry details
  dom.detailTagsInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newTag = dom.detailTagsInput.value.trim();
      if (!newTag || !state.selectedTask) return;

      const currentTags = [...state.selectedTask.tags];
      if (!currentTags.includes(newTag)) {
        currentTags.push(newTag);
        
        showSavingIndicator(true);
        try {
          const updated = await api.updateTask(state.selectedTask.id, { tags: currentTags });
          state.selectedTask = updated;
          renderTaskTags();
          dom.detailTagsInput.value = '';
          await refreshData();
        } catch (err) {
          console.error(err);
        } finally {
          showSavingIndicator(false);
        }
      }
    }
  });

  // Delete Task Button
  dom.deleteTaskBtn.addEventListener('click', deleteActiveTask);
}

// Fetch lists & update UI components
async function refreshData() {
  try {
    state.projects = await api.getProjects();
    state.tasks = await api.getTasks();
    state.tags = await api.getTags();

    renderProjects();
    renderTagsCloud();
    refreshTaskList();
    populateDropdowns();
  } catch (err) {
    console.error('Data refresh failed:', err);
  }
}

// Populate Project selector dropdowns
function populateDropdowns() {
  const currentQuickProject = dom.quickAddProject.value;
  const currentDetailProject = dom.detailProject.value;

  // Clear dropdown options except first
  dom.quickAddProject.innerHTML = '<option value="">Inbox</option>';
  dom.detailProject.innerHTML = '<option value="">Inbox</option>';

  state.projects.forEach(project => {
    if (project.name.toLowerCase() === 'inbox') return; // Inbox already created as default

    const option = `<option value="${project.id}">${project.name}</option>`;
    dom.quickAddProject.insertAdjacentHTML('beforeend', option);
    dom.detailProject.insertAdjacentHTML('beforeend', option);
  });

  dom.quickAddProject.value = currentQuickProject || "";
  dom.detailProject.value = currentDetailProject || "";
}

// Render Sidebar Projects List
function renderProjects() {
  dom.projectList.innerHTML = '';
  
  state.projects.forEach(project => {
    const total = project.total_tasks || 0;
    const completed = project.completed_tasks || 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const activeClass = (state.activeFilter.type === 'project' && state.activeFilter.value === project.id) ? 'active' : '';

    const li = document.createElement('li');
    li.className = `project-item ${activeClass}`;
    li.innerHTML = `
      <span class="project-dot" style="background-color: ${project.color}"></span>
      <span class="project-name">${project.name}</span>
      ${total > 0 ? `<span class="project-progress-circle" title="${completed}/${total} tasks completed">${pct}%</span>` : ''}
    `;

    // Click to filter by project
    li.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.project-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
      
      li.classList.add('active');
      state.activeFilter = { type: 'project', value: project.id };
      refreshTaskList();
      dom.sidebar.classList.remove('active');
    });

    dom.projectList.appendChild(li);
  });
}

// Render Sidebar Tag Cloud
function renderTagsCloud() {
  dom.tagCloud.innerHTML = '';
  if (state.tags.length === 0) {
    dom.tagCloud.innerHTML = '<span class="text-muted" style="font-size: 12px; padding-left: 6px;">No tags yet</span>';
    return;
  }

  state.tags.forEach(tag => {
    const activeClass = (state.activeFilter.type === 'tag' && state.activeFilter.value === tag.name) ? 'active' : '';
    
    const btn = document.createElement('button');
    btn.className = `tag-btn ${activeClass}`;
    btn.textContent = `#${tag.name}`;
    
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.project-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
      
      btn.classList.add('active');
      state.activeFilter = { type: 'tag', value: tag.name };
      refreshTaskList();
      dom.sidebar.classList.remove('active');
    });

    dom.tagCloud.appendChild(btn);
  });
}

// Render Task List based on active filters
async function refreshTaskList() {
  // Query backend with filters
  const apiFilters = {};
  if (state.activeFilter.type === 'list') {
    apiFilters.list = state.activeFilter.value;
  } else if (state.activeFilter.type === 'project') {
    apiFilters.projectId = state.activeFilter.value;
  } else if (state.activeFilter.type === 'tag') {
    apiFilters.tagId = state.tags.find(t => t.name === state.activeFilter.value)?.id;
  }

  try {
    const filteredTasks = await api.getTasks(apiFilters);
    
    // Clear list
    dom.taskList.innerHTML = '';

    // Set Title
    let title = 'All Tasks';
    if (state.activeFilter.type === 'list') {
      title = state.activeFilter.value.charAt(0).toUpperCase() + state.activeFilter.value.slice(1) + ' Tasks';
    } else if (state.activeFilter.type === 'project') {
      title = state.projects.find(p => p.id === state.activeFilter.value)?.name || 'Project';
    } else if (state.activeFilter.type === 'tag') {
      title = `#${state.activeFilter.value}`;
    }
    dom.currentListTitle.textContent = title;

    // Set subtitle completed count
    const totalCount = filteredTasks.length;
    const completedCount = filteredTasks.filter(t => t.status === 'completed').length;
    dom.dailyProgressSubtitle.textContent = `${completedCount} of ${totalCount} tasks completed`;
    
    // Progress calculation
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    dom.headerProgressBar.style.width = `${progressPct}%`;
    dom.headerProgressPercent.textContent = `${progressPct}%`;

    // Render Empty State if no tasks
    if (filteredTasks.length === 0) {
      dom.emptyState.classList.remove('hidden');
      return;
    }
    dom.emptyState.classList.add('hidden');

    // Group tasks: Overdue group if filtering on all/today/upcoming
    const overdueTasks = [];
    const regularTasks = [];

    const todayStr = new Date().toISOString().split('T')[0];

    filteredTasks.forEach(task => {
      if (task.status === 'pending' && task.due_date && task.due_date < todayStr && state.activeFilter.value !== 'overdue') {
        overdueTasks.push(task);
      } else {
        regularTasks.push(task);
      }
    });

    if (overdueTasks.length > 0) {
      dom.taskList.insertAdjacentHTML('beforeend', '<div class="task-group-header">Overdue</div>');
      overdueTasks.forEach(task => renderTaskItem(task));
    }

    if (regularTasks.length > 0 && overdueTasks.length > 0) {
      dom.taskList.insertAdjacentHTML('beforeend', '<div class="task-group-header">Tasks</div>');
    }

    regularTasks.forEach(task => renderTaskItem(task));

    // Rebind drag & drop events
    setupDragAndDrop();

  } catch (err) {
    console.error('Failed to load filtered tasks:', err);
  }
}

// Render a single task card in DOM
function renderTaskItem(task) {
  const isCompleted = task.status === 'completed';
  const checkedAttr = isCompleted ? 'checked' : '';
  const completedClass = isCompleted ? 'completed' : '';
  const activeClass = (state.selectedTask && state.selectedTask.id === task.id) ? 'active' : '';

  // Priority color block
  const priorityClass = task.priority || 'medium';

  // Format Project indicator
  const projectName = task.project_name || 'Inbox';
  const projectColor = task.project_color || '#3b82f6';

  // Format Due Date Indicator
  let dueHtml = '';
  if (task.due_date) {
    const todayStr = new Date().toISOString().split('T')[0];
    const tomStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    
    let dueLabel = task.due_date;
    let dueClass = '';
    
    if (task.due_date === todayStr) {
      dueLabel = 'Today';
      dueClass = 'today';
    } else if (task.due_date === tomStr) {
      dueLabel = 'Tomorrow';
    } else if (task.due_date < todayStr && !isCompleted) {
      dueClass = 'overdue';
    }

    dueHtml = `
      <span class="task-due-badge ${dueClass}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        ${dueLabel}
        ${task.reminder_time ? `@ ${task.reminder_time}` : ''}
      </span>
    `;
  }

  // Tags badge
  let tagsHtml = '';
  if (task.tags && task.tags.length > 0) {
    tagsHtml = `<div class="task-tags-row">` + 
      task.tags.map(t => `<span class="task-tag-pill">#${t}</span>`).join('') + 
      `</div>`;
  }

  // Recurrence indicator
  const recurHtml = (task.recurring && task.recurring !== 'none') ? `
    <svg class="recurring-icon" title="Repeats ${task.recurring}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 4 23 10 17 10"></polyline>
      <polyline points="1 20 1 14 7 14"></polyline>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
  ` : '';

  const li = document.createElement('li');
  li.className = `task-item ${completedClass} ${activeClass}`;
  li.draggable = true;
  li.dataset.id = task.id;
  li.innerHTML = `
    <div class="task-priority-indicator ${priorityClass}"></div>
    
    <label class="checkbox-container" aria-label="Complete task">
      <input type="checkbox" ${checkedAttr}>
      <span class="checkmark"></span>
    </label>
    
    <div class="task-content">
      <span class="task-item-title">${escapeHtml(task.title)}</span>
      <div class="task-meta-row">
        <span class="task-project-tag">
          <span class="project-dot" style="background-color: ${projectColor}"></span>
          ${projectName}
        </span>
        ${dueHtml}
        ${recurHtml}
        ${tagsHtml}
      </div>
    </div>

    <div class="drag-handle" title="Drag to reorder">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="12" r="1"></circle>
        <circle cx="9" cy="5" r="1"></circle>
        <circle cx="9" cy="19" r="1"></circle>
        <circle cx="15" cy="12" r="1"></circle>
        <circle cx="15" cy="5" r="1"></circle>
        <circle cx="15" cy="19" r="1"></circle>
      </svg>
    </div>
  `;

  // Checkbox Event
  const checkbox = li.querySelector('input[type="checkbox"]');
  checkbox.addEventListener('change', async (e) => {
    e.stopPropagation();
    const status = checkbox.checked ? 'completed' : 'pending';
    
    // Add quick strikeout class for instantaneous feedback
    if (checkbox.checked) {
      li.classList.add('completed');
    } else {
      li.classList.remove('completed');
    }

    try {
      const updated = await api.updateTask(task.id, { status });
      // If we checked it and it was recurring, the active task might have changed (e.g. its date advanced)
      if (task.recurring && task.recurring !== 'none') {
        await refreshData();
        // Keep active detail selection on the pending task (which has the advanced date)
        if (state.selectedTask && state.selectedTask.id === task.id) {
          selectTask(updated);
        }
      } else {
        await refreshData();
        // Update selection if details panel matches
        if (state.selectedTask && state.selectedTask.id === task.id) {
          state.selectedTask = updated;
          selectTask(updated);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update status.');
      checkbox.checked = !checkbox.checked;
      li.classList.toggle('completed');
    }
  });

  // Task Card Click (to open details panel)
  li.addEventListener('click', (e) => {
    // Prevent opening detail view when checking checkboxes or dragging
    if (e.target.closest('.checkbox-container') || e.target.closest('.drag-handle')) return;
    
    document.querySelectorAll('.task-item').forEach(el => el.classList.remove('active'));
    li.classList.add('active');
    
    selectTask(task);
  });

  dom.taskList.appendChild(li);
}

// Select task and fill the right detail form
function selectTask(task) {
  state.selectedTask = task;
  
  // Hide empty state and show form
  dom.detailsEmptyState.classList.add('hidden');
  dom.detailsForm.classList.remove('hidden');
  dom.detailsPanel.classList.remove('hidden');

  // Fill in active fields
  dom.detailTitle.value = task.title;
  dom.detailProject.value = task.project_id || "";
  dom.detailDueDate.value = task.due_date || "";
  dom.detailReminder.value = task.reminder_time || "";
  dom.detailRecurring.value = task.recurring || "none";
  dom.detailDescription.value = task.description || "";

  // Priority Button highlight
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-priority') === task.priority) {
      btn.classList.add('active');
    }
  });

  // Render Tags
  renderTaskTags();
}

// Renders tag pills inside Details Panel
function renderTaskTags() {
  dom.detailTagsContainer.innerHTML = '';
  if (!state.selectedTask || !state.selectedTask.tags) return;

  state.selectedTask.tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'detail-tag-pill';
    span.innerHTML = `
      <span>#${tag}</span>
      <button type="button" aria-label="Remove Tag">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;

    span.querySelector('button').addEventListener('click', async () => {
      const updatedTags = state.selectedTask.tags.filter(t => t !== tag);
      showSavingIndicator(true);
      try {
        const updated = await api.updateTask(state.selectedTask.id, { tags: updatedTags });
        state.selectedTask = updated;
        renderTaskTags();
        await refreshData();
      } catch (err) {
        console.error(err);
      } finally {
        showSavingIndicator(false);
      }
    });

    dom.detailTagsContainer.appendChild(span);
  });
}

// Close the details panel
function closeDetailsPanel() {
  dom.detailsPanel.classList.add('hidden');
  dom.detailsForm.classList.add('hidden');
  dom.detailsEmptyState.classList.remove('hidden');
  document.querySelectorAll('.task-item').forEach(el => el.classList.remove('active'));
  state.selectedTask = null;
}

// Generic details editor field save
async function saveActiveTaskField(field, value) {
  if (!state.selectedTask) return;
  
  showSavingIndicator(true);
  try {
    const updated = await api.updateTask(state.selectedTask.id, { [field]: value });
    state.selectedTask = updated;
    await refreshData();
  } catch (err) {
    console.error(err);
  } finally {
    showSavingIndicator(false);
  }
}

// Delete Active Task
async function deleteActiveTask() {
  if (!state.selectedTask) return;
  if (!confirm('Are you sure you want to delete this task?')) return;

  try {
    await api.deleteTask(state.selectedTask.id);
    closeDetailsPanel();
    await refreshData();
  } catch (err) {
    console.error(err);
    alert('Failed to delete task.');
  }
}

// Toggle status (shortcuts hook)
async function toggleActiveTaskStatus() {
  if (!state.selectedTask) return;
  const newStatus = state.selectedTask.status === 'completed' ? 'pending' : 'completed';
  
  showSavingIndicator(true);
  try {
    const updated = await api.updateTask(state.selectedTask.id, { status: newStatus });
    if (state.selectedTask.recurring && state.selectedTask.recurring !== 'none') {
      await refreshData();
      closeDetailsPanel();
    } else {
      state.selectedTask = updated;
      selectTask(updated);
      await refreshData();
    }
  } catch (err) {
    console.error(err);
  } finally {
    showSavingIndicator(false);
  }
}

// UI indicator display during DB changes
function showSavingIndicator(isSaving) {
  if (isSaving) {
    dom.autoSaveIndicator.textContent = 'Saving...';
    dom.autoSaveIndicator.classList.add('saving');
  } else {
    dom.autoSaveIndicator.textContent = 'Saved';
    dom.autoSaveIndicator.classList.remove('saving');
  }
}

// Keyboard toggle handlers
function toggleSidebar() {
  dom.sidebar.classList.toggle('active');
}

function toggleSearch() {
  dom.searchModal.classList.toggle('hidden');
  if (!dom.searchModal.classList.contains('hidden')) {
    dom.globalSearchInput.value = '';
    dom.searchResultsList.innerHTML = '<div class="search-empty-state"><p>Search tasks, notes, or priorities instantly</p></div>';
    setTimeout(() => dom.globalSearchInput.focus(), 50);
  }
}

function toggleShortcuts() {
  dom.shortcutsModal.classList.toggle('hidden');
}

function closeAllOverlays() {
  dom.searchModal.classList.add('hidden');
  dom.shortcutsModal.classList.add('hidden');
  dom.sidebar.classList.remove('active');
  closeDetailsPanel();
}

// Global search execution
async function executeSearch() {
  const query = dom.globalSearchInput.value.trim();
  if (!query) {
    dom.searchResultsList.innerHTML = '<div class="search-empty-state"><p>Search tasks, notes, or priorities instantly</p></div>';
    return;
  }

  try {
    const results = await api.getTasks({ search: query });
    dom.searchResultsList.innerHTML = '';

    if (results.length === 0) {
      dom.searchResultsList.innerHTML = '<div class="search-empty-state"><p>No matching tasks found</p></div>';
      return;
    }

    results.forEach(task => {
      const completedClass = task.status === 'completed' ? 'completed' : '';
      const projName = task.project_name || 'Inbox';
      
      const item = document.createElement('div');
      item.className = `search-result-item ${completedClass}`;
      item.innerHTML = `
        <span class="result-title">${escapeHtml(task.title)}</span>
        <span class="result-project">${projName}</span>
      `;

      item.addEventListener('click', () => {
        dom.searchModal.classList.add('hidden');
        selectTask(task);
        // Highlight active task in list if it's currently rendered
        const taskCard = document.querySelector(`.task-item[data-id="${task.id}"]`);
        if (taskCard) {
          document.querySelectorAll('.task-item').forEach(el => el.classList.remove('active'));
          taskCard.classList.add('active');
          taskCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      dom.searchResultsList.appendChild(item);
    });
  } catch (err) {
    console.error(err);
  }
}

// --- Drag and Drop Tasks Reordering ---
let dragSourceEl = null;

function setupDragAndDrop() {
  const items = dom.taskList.querySelectorAll('.task-item');
  
  items.forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);
  });
}

function handleDragStart(e) {
  dragSourceEl = this;
  this.classList.add('dragging');
  
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.id);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  return false;
}

async function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();

  if (dragSourceEl !== this) {
    // Determine sibling ordering positioning
    const itemsArray = [...dom.taskList.querySelectorAll('.task-item')];
    const dragIndex = itemsArray.indexOf(dragSourceEl);
    const dropIndex = itemsArray.indexOf(this);

    if (dragIndex < dropIndex) {
      this.after(dragSourceEl);
    } else {
      this.before(dragSourceEl);
    }

    // Capture updated indices
    const updatedItems = [...dom.taskList.querySelectorAll('.task-item')];
    const reorders = updatedItems.map((item, index) => ({
      id: parseInt(item.dataset.id),
      order_index: index + 1
    }));

    try {
      await api.reorderTasks(reorders);
      // Update local state indices silently
      reorders.forEach(r => {
        const found = state.tasks.find(t => t.id === r.id);
        if (found) found.order_index = r.order_index;
      });
      // Sort state tasks array in memory
      state.tasks.sort((a, b) => a.order_index - b.order_index);
    } catch (err) {
      console.error('Failed to save drag order:', err);
      // Fallback refresh data to reset list positions
      await refreshData();
    }
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
}

// Background scan checking for pending tasks with reminders due
function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const currentHourMin = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  state.tasks.forEach(task => {
    if (task.status === 'pending' && task.due_date === todayStr && task.reminder_time === currentHourMin) {
      const cacheKey = `${task.id}_${task.due_date}_${task.reminder_time}`;
      if (!state.notifiedCache.has(cacheKey)) {
        state.notifiedCache.add(cacheKey);

        new Notification("DOIT Reminder", {
          body: `Reminder: "${task.title}" is due now!`,
          icon: '/favicon.ico',
          tag: `task-${task.id}`
        });
      }
    }
  });
}

// Debounce & Helper utilities
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function debounceAutoSave(func) {
  clearTimeout(state.autoSaveTimer);
  state.autoSaveTimer = setTimeout(func, 600);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
