export const responsablesHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mantenedor - Responsables</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f7fa; color: #333; }
    .container { max-width: 700px; margin: 0 auto; padding: 16px; }
    h1 { font-size: 1.3rem; margin-bottom: 6px; color: #1a1a2e; }
    .subtitle { color: #666; margin-bottom: 16px; font-size: 0.85rem; }
    .nav { display: flex; gap: 8px; margin-bottom: 16px; }
    .nav a { padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; }
    .nav a.active { background: #4472C4; color: #fff; }
    .nav a:not(.active) { background: #e0e0e0; color: #333; }
    .stats { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .stat { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 12px; flex: 1; min-width: 100px; text-align: center; }
    .stat-value { font-size: 1.3rem; font-weight: 700; color: #4472C4; }
    .stat-label { font-size: 0.7rem; color: #666; margin-top: 2px; }
    .search-box { width: 100%; padding: 12px 14px; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; margin-bottom: 12px; }
    .search-box:focus { outline: none; border-color: #4472C4; }
    .tabs { display: flex; gap: 4px; margin-bottom: 16px; flex-wrap: wrap; }
    .tab { padding: 8px 14px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 0.85rem; background: #fff; }
    .tab.active { background: #4472C4; color: #fff; border-color: #4472C4; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 12px; overflow: hidden; }
    .card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #4472C4; color: #fff; cursor: pointer; }
    .card-header .name { font-weight: 600; font-size: 0.95rem; }
    .card-header .email { font-size: 0.8rem; opacity: 0.85; }
    .card-header .count { font-size: 0.8rem; opacity: 0.8; }
    .card-body { display: none; padding: 0; }
    .card-body.open { display: block; }
    .center-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #f0f0f0; font-size: 0.85rem; gap: 8px; }
    .center-row:last-child { border-bottom: none; }
    .center-row .center-name { flex: 1; word-break: break-word; }
    .center-row .group-badge { background: #e8eef7; color: #4472C4; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; white-space: nowrap; }
    .btn-remove { background: #e74c3c; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer; white-space: nowrap; }
    .btn-remove:active { opacity: 0.7; }
    .unassigned { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 12px; }
    .unassigned-header { padding: 12px 16px; background: #e67e22; color: #fff; font-weight: 600; font-size: 0.95rem; cursor: pointer; display: flex; justify-content: space-between; }
    .unassigned-body { display: none; }
    .unassigned-body.open { display: block; }
    .assign-row { display: flex; align-items: center; padding: 10px 16px; border-bottom: 1px solid #f0f0f0; gap: 8px; flex-wrap: wrap; }
    .assign-row .center-name { flex: 1; min-width: 150px; font-size: 0.85rem; word-break: break-word; }
    .assign-row select { padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.8rem; max-width: 200px; }
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 100; align-items: center; justify-content: center; }
    .modal-overlay.show { display: flex; }
    .modal { background: #fff; border-radius: 12px; padding: 24px; width: 90%; max-width: 400px; }
    .modal h2 { font-size: 1.1rem; margin-bottom: 16px; }
    .modal input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95rem; margin-bottom: 12px; }
    .modal input:focus { outline: none; border-color: #4472C4; }
    .modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
    .modal-btns button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
    .modal-btns .btn-save { background: #4472C4; color: #fff; }
    .modal-btns .btn-cancel { background: #e0e0e0; color: #333; }
    .btn-add { padding: 8px 16px; border: none; border-radius: 6px; background: #27ae60; color: #fff; cursor: pointer; font-size: 0.85rem; margin-bottom: 12px; }
    .btn-add:active { opacity: 0.7; }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 10px 20px; border-radius: 6px; color: #fff; font-size: 0.85rem; z-index: 200; opacity: 0; transition: opacity 0.3s; }
    .toast.show { opacity: 1; }
    .toast-success { background: #27ae60; }
    .toast-error { background: #e74c3c; }
    .empty { text-align: center; padding: 30px; color: #999; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="nav">
      <a href="/admin">Centros de Gestion</a>
      <a href="/admin/responsables" class="active">Responsables</a>
    </div>

    <h1>Responsables por Centro</h1>
    <p class="subtitle">Gestiona la asignacion de responsables a centros de costo</p>

    <div class="stats">
      <div class="stat">
        <div class="stat-value" id="respCount">0</div>
        <div class="stat-label">Responsables</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="assignedCount" style="color:#27ae60">0</div>
        <div class="stat-label">Centros Asignados</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="unassignedCount" style="color:#e67e22">0</div>
        <div class="stat-label">Sin Responsable</div>
      </div>
    </div>

    <input type="text" class="search-box" id="searchInput" placeholder="Buscar centro o responsable..." oninput="render()" />

    <button class="btn-add" onclick="showAddModal()">+ Agregar Responsable</button>

    <div id="mainList"></div>
  </div>

  <div class="modal-overlay" id="addModal">
    <div class="modal">
      <h2 id="modalTitle">Agregar Responsable</h2>
      <input type="text" id="modalName" placeholder="Nombre completo" />
      <input type="email" id="modalEmail" placeholder="Email" />
      <div class="modal-btns">
        <button class="btn-cancel" onclick="closeModal()">Cancelar</button>
        <button class="btn-save" onclick="saveResponsable()">Guardar</button>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    var responsables = [];
    var centers = [];

    function showToast(msg, type) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast show toast-' + type;
      setTimeout(function() { t.className = 'toast'; }, 2000);
    }

    async function loadData() {
      try {
        var r1 = await fetch('/responsables');
        responsables = await r1.json();
        var r2 = await fetch('/responsables/centers');
        centers = await r2.json();
        render();
      } catch(e) {
        showToast('Error cargando datos', 'error');
      }
    }

    function render() {
      var q = (document.getElementById('searchInput').value || '').toLowerCase();

      var assigned = centers.filter(function(c) { return c.responsable_id; });
      var unassigned = centers.filter(function(c) { return !c.responsable_id; });

      document.getElementById('respCount').textContent = responsables.length;
      document.getElementById('assignedCount').textContent = assigned.length;
      document.getElementById('unassignedCount').textContent = unassigned.length;

      var html = '';

      if (unassigned.length > 0) {
        var filteredUnassigned = q ? unassigned.filter(function(c) {
          return c.center_code.toLowerCase().includes(q) || c.center_name.toLowerCase().includes(q);
        }) : unassigned;

        if (filteredUnassigned.length > 0) {
          html += '<div class="unassigned">';
          html += '<div class="unassigned-header" onclick="toggleSection(this)">';
          html += '<span>Sin Responsable (' + filteredUnassigned.length + ')</span>';
          html += '<span>&#9660;</span>';
          html += '</div>';
          html += '<div class="unassigned-body">';
          filteredUnassigned.forEach(function(c) {
            html += '<div class="assign-row">';
            html += '<span class="center-name">' + escapeHtml(c.center_code) + '</span>';
            html += '<select onchange="assignCenter(' + c.id + ', this.value)">';
            html += '<option value="">Seleccionar...</option>';
            responsables.forEach(function(r) {
              html += '<option value="' + r.id + '">' + escapeHtml(r.name) + '</option>';
            });
            html += '</select>';
            html += '</div>';
          });
          html += '</div></div>';
        }
      }

      responsables.forEach(function(resp) {
        var respCenters = centers.filter(function(c) { return c.responsable_id === resp.id; });
        if (q) {
          var matchResp = resp.name.toLowerCase().includes(q) || resp.email.toLowerCase().includes(q);
          var matchCenters = respCenters.filter(function(c) {
            return c.center_code.toLowerCase().includes(q) || c.center_name.toLowerCase().includes(q);
          });
          if (!matchResp && matchCenters.length === 0) return;
          if (!matchResp) respCenters = matchCenters;
        }

        html += '<div class="card">';
        html += '<div class="card-header" onclick="toggleSection(this)">';
        html += '<div><div class="name">' + escapeHtml(resp.name) + '</div>';
        html += '<div class="email">' + escapeHtml(resp.email) + '</div></div>';
        html += '<span class="count">' + respCenters.length + ' centros</span>';
        html += '</div>';
        html += '<div class="card-body">';
        if (respCenters.length === 0) {
          html += '<div class="empty">Sin centros asignados</div>';
        }
        respCenters.forEach(function(c) {
          html += '<div class="center-row">';
          html += '<span class="group-badge">' + escapeHtml(c.group_name) + '</span>';
          html += '<span class="center-name">' + escapeHtml(c.center_code) + '</span>';
          html += '<button class="btn-remove" onclick="event.stopPropagation(); unassignCenter(' + c.id + ')">Quitar</button>';
          html += '</div>';
        });
        html += '</div></div>';
      });

      if (!html) {
        html = '<div class="empty">No se encontraron resultados</div>';
      }

      document.getElementById('mainList').innerHTML = html;
    }

    function escapeHtml(s) {
      var d = document.createElement('div');
      d.textContent = s || '';
      return d.innerHTML;
    }

    function toggleSection(header) {
      var body = header.nextElementSibling;
      body.classList.toggle('open');
    }

    function showAddModal() {
      document.getElementById('modalName').value = '';
      document.getElementById('modalEmail').value = '';
      document.getElementById('modalTitle').textContent = 'Agregar Responsable';
      document.getElementById('addModal').classList.add('show');
    }

    function closeModal() {
      document.getElementById('addModal').classList.remove('show');
    }

    async function saveResponsable() {
      var name = document.getElementById('modalName').value.trim();
      var email = document.getElementById('modalEmail').value.trim();
      if (!name || !email) { showToast('Nombre y email son requeridos', 'error'); return; }
      try {
        var res = await fetch('/responsables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, email: email })
        });
        if (!res.ok) {
          var err = await res.json();
          showToast(err.message || 'Error', 'error');
          return;
        }
        closeModal();
        showToast('Responsable agregado', 'success');
        await loadData();
      } catch(e) {
        showToast('Error', 'error');
      }
    }

    async function assignCenter(centerId, responsableId) {
      if (!responsableId) return;
      try {
        await fetch('/responsables/centers/' + centerId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responsable_id: parseInt(responsableId) })
        });
        await loadData();
        showToast('Centro asignado', 'success');
      } catch(e) {
        showToast('Error', 'error');
      }
    }

    async function unassignCenter(centerId) {
      try {
        await fetch('/responsables/centers/' + centerId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responsable_id: null })
        });
        await loadData();
        showToast('Centro desasignado', 'success');
      } catch(e) {
        showToast('Error', 'error');
      }
    }

    loadData();
  </script>
</body>
</html>`;
