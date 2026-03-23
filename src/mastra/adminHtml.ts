export const adminHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mantenedor - Centros de Gesti\u00f3n</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 16px; }
    h1 { font-size: 1.3rem; margin-bottom: 6px; color: #1a1a2e; }
    .subtitle { color: #666; margin-bottom: 16px; font-size: 0.85rem; }
    .stats { display: flex; gap: 12px; margin-bottom: 16px; }
    .stat { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 12px; flex: 1; text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #4472C4; }
    .stat-label { font-size: 0.75rem; color: #666; margin-top: 2px; }
    .search-box { width: 100%; padding: 12px 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; margin-bottom: 12px; }
    .search-box:focus { outline: none; border-color: #4472C4; }
    .group { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 12px; overflow: hidden; }
    .group-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #4472C4; color: #fff; font-weight: 600; font-size: 0.95rem; cursor: pointer; }
    .group-header .group-count { font-size: 0.8rem; opacity: 0.8; }
    .group-body { display: none; }
    .group-body.open { display: block; }
    .center-item { display: flex; align-items: center; padding: 14px 16px; border-bottom: 1px solid #f0f0f0; gap: 12px; cursor: pointer; -webkit-tap-highlight-color: rgba(68,114,196,0.1); }
    .center-item:last-child { border-bottom: none; }
    .center-item:active { background: #f0f4ff; }
    .center-item label { flex: 1; font-size: 0.9rem; line-height: 1.3; cursor: pointer; word-break: break-word; }
    .toggle { position: relative; width: 50px; min-width: 50px; height: 28px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle .slider { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #ccc; border-radius: 28px; transition: 0.3s; cursor: pointer; }
    .toggle .slider:before { content: ''; position: absolute; height: 22px; width: 22px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s; }
    .toggle input:checked + .slider { background: #27ae60; }
    .toggle input:checked + .slider:before { transform: translateX(22px); }
    .btn-group-toggle { padding: 6px 12px; border: 1px solid rgba(255,255,255,0.5); background: transparent; color: #fff; border-radius: 4px; font-size: 0.75rem; cursor: pointer; }
    .btn-group-toggle:active { background: rgba(255,255,255,0.2); }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 10px 20px; border-radius: 6px; color: #fff; font-size: 0.85rem; z-index: 1000; opacity: 0; transition: opacity 0.3s; }
    .toast.show { opacity: 1; }
    .toast-success { background: #27ae60; }
    .toast-error { background: #e74c3c; }
    .empty { text-align: center; padding: 30px; color: #999; font-size: 0.9rem; }
    .actions-bar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
    .btn-action { padding: 8px 16px; border: none; border-radius: 6px; font-size: 0.85rem; cursor: pointer; }
    .btn-action.primary { background: #4472C4; color: #fff; }
    .btn-action.secondary { background: #e0e0e0; color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <a href="/admin" style="padding:8px 16px;border-radius:6px;text-decoration:none;font-size:0.85rem;background:#4472C4;color:#fff;">Centros de Gestion</a>
      <a href="/admin/responsables" style="padding:8px 16px;border-radius:6px;text-decoration:none;font-size:0.85rem;background:#e0e0e0;color:#333;">Responsables</a>
    </div>

    <h1>Centros de Gesti\u00f3n</h1>
    <p class="subtitle">Toca el switch para activar o desactivar cada centro en el reporte</p>

    <div class="stats">
      <div class="stat">
        <div class="stat-value" id="totalCount">0</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="activeCount" style="color:#27ae60">0</div>
        <div class="stat-label">Activos</div>
      </div>
    </div>

    <input type="text" class="search-box" id="searchInput" placeholder="Buscar centro..." oninput="filterCenters()" />

    <div class="actions-bar">
      <button class="btn-action primary" onclick="selectAll(true)">Activar todos</button>
      <button class="btn-action secondary" onclick="selectAll(false)">Desactivar todos</button>
    </div>

    <div id="centersList"></div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    var allCenters = [];

    function showToast(msg, type) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast show toast-' + type;
      setTimeout(function() { t.className = 'toast'; }, 2000);
    }

    async function loadCenters() {
      try {
        var res = await fetch('/cost-centers');
        allCenters = await res.json();
        renderGroups(allCenters);
        updateStats();
      } catch (e) {
        showToast('Error cargando', 'error');
      }
    }

    function updateStats() {
      document.getElementById('totalCount').textContent = allCenters.length;
      document.getElementById('activeCount').textContent = allCenters.filter(function(c) { return c.active; }).length;
    }

    function getGroup(name) {
      var m = name.match(/^\\(([^)]+)\\)/);
      return m ? m[1] : 'OTROS';
    }

    function renderGroups(centers) {
      var groups = {};
      centers.forEach(function(c) {
        var g = getGroup(c.name);
        if (!groups[g]) groups[g] = [];
        groups[g].push(c);
      });

      var container = document.getElementById('centersList');
      var html = '';
      var sortedKeys = Object.keys(groups).sort();

      sortedKeys.forEach(function(groupName) {
        var items = groups[groupName];
        var activeInGroup = items.filter(function(c) { return c.active; }).length;
        html += '<div class="group">';
        html += '<div class="group-header" onclick="toggleGroup(this)">';
        html += '<span>' + groupName + ' <span class="group-count">(' + activeInGroup + '/' + items.length + ' activos)</span></span>';
        html += '<button class="btn-group-toggle" onclick="event.stopPropagation(); toggleGroupAll(\\'' + groupName + '\\')">Toggle</button>';
        html += '</div>';
        html += '<div class="group-body">';
        items.forEach(function(c) {
          html += '<div class="center-item" onclick="toggleItem(event, ' + c.id + ', ' + c.active + ')">';
          html += '<label>' + c.name + '</label>';
          html += '<div class="toggle">';
          html += '<input type="checkbox" ' + (c.active ? 'checked' : '') + ' data-id="' + c.id + '" />';
          html += '<span class="slider"></span>';
          html += '</div>';
          html += '</div>';
        });
        html += '</div></div>';
      });

      if (centers.length === 0) {
        html = '<div class="empty">No se encontraron centros</div>';
      }

      container.innerHTML = html;
    }

    function toggleGroup(header) {
      var body = header.nextElementSibling;
      body.classList.toggle('open');
    }

    async function toggleItem(event, id, currentActive) {
      event.preventDefault();
      event.stopPropagation();
      try {
        await fetch('/cost-centers/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !currentActive })
        });
        allCenters = allCenters.map(function(c) {
          if (c.id === id) c.active = !currentActive;
          return c;
        });
        renderGroups(filterBySearch(allCenters));
        updateStats();
        reopenGroups();
      } catch (e) {
        showToast('Error', 'error');
      }
    }

    var openGroupNames = {};

    function reopenGroups() {
      var headers = document.querySelectorAll('.group-header');
      headers.forEach(function(h) {
        var name = h.querySelector('span').textContent.split(' (')[0].trim();
        if (openGroupNames[name]) {
          h.nextElementSibling.classList.add('open');
        }
      });
    }

    var origToggleGroup = toggleGroup;
    toggleGroup = function(header) {
      var body = header.nextElementSibling;
      var name = header.querySelector('span').textContent.split(' (')[0].trim();
      body.classList.toggle('open');
      openGroupNames[name] = body.classList.contains('open');
    };

    async function toggleGroupAll(groupName) {
      var groupCenters = allCenters.filter(function(c) { return getGroup(c.name) === groupName; });
      var allActive = groupCenters.every(function(c) { return c.active; });
      var newState = !allActive;
      for (var i = 0; i < groupCenters.length; i++) {
        var c = groupCenters[i];
        if (c.active !== newState) {
          await fetch('/cost-centers/' + c.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: newState })
          });
          c.active = newState;
        }
      }
      renderGroups(filterBySearch(allCenters));
      updateStats();
      openGroupNames[groupName] = true;
      reopenGroups();
      showToast(groupName + (newState ? ' activados' : ' desactivados'), 'success');
    }

    async function selectAll(active) {
      try {
        for (var i = 0; i < allCenters.length; i++) {
          if (allCenters[i].active !== active) {
            await fetch('/cost-centers/' + allCenters[i].id, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ active: active })
            });
            allCenters[i].active = active;
          }
        }
        renderGroups(filterBySearch(allCenters));
        updateStats();
        reopenGroups();
        showToast(active ? 'Todos activados' : 'Todos desactivados', 'success');
      } catch (e) {
        showToast('Error', 'error');
      }
    }

    function filterBySearch(centers) {
      var q = document.getElementById('searchInput').value.toLowerCase();
      if (!q) return centers;
      return centers.filter(function(c) { return c.name.toLowerCase().includes(q); });
    }

    function filterCenters() {
      renderGroups(filterBySearch(allCenters));
      reopenGroups();
    }

    loadCenters();
  </script>
</body>
</html>`;
