// DOIT API Client Utility

const API_BASE = '';

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_BASE}${url}`, config);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'API Request failed');
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${url}:`, err);
    throw err;
  }
}

export const api = {
  // Projects
  async getProjects() {
    return request('/api/projects');
  },
  
  async createProject(name, color) {
    return request('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, color })
    });
  },
  
  async deleteProject(id) {
    return request(`/api/projects/${id}`, {
      method: 'DELETE'
    });
  },

  // Tasks
  async getTasks(filters = {}) {
    const params = new URLSearchParams();
    if (filters.list) params.append('list', filters.list);
    if (filters.projectId) params.append('projectId', filters.projectId);
    if (filters.tagId) params.append('tagId', filters.tagId);
    if (filters.search) params.append('search', filters.search);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/tasks${queryStr}`);
  },

  async createTask(title, projectId = null, priority = 'medium', dueDate = null) {
    return request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title,
        project_id: projectId,
        priority,
        due_date: dueDate
      })
    });
  },

  async updateTask(id, data) {
    return request(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteTask(id) {
    return request(`/api/tasks/${id}`, {
      method: 'DELETE'
    });
  },

  async reorderTasks(reorders) {
    return request('/api/tasks/reorder', {
      method: 'PUT',
      body: JSON.stringify({ reorders })
    });
  },

  // Tags
  async getTags() {
    return request('/api/tags');
  },

  // Settings
  async getSettings() {
    return request('/api/settings');
  },

  async saveSetting(key, value) {
    return request('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ key, value })
    });
  }
};
