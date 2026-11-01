// Gateway Interactive Map Script for ST25 VIETNAM
// Member-Only GPS & Full IslePilot ST25 Colored Zones (st25.islepilot.eu/map)
const IsleMap = {
  map: null,
  playerMarker: null,
  mapBounds: [[0, 0], [1000, 1000]],
  selectedSteamId: null,
  currentData: null,
  timerId: null,

  // Layer groups for each colored zone category
  aiZoneGroup: null,
  sanctuaryGroup: null,
  orangeZoneGroup: null,
  hotspotRedGroup: null,
  patrolPurpleGroup: null,
  migrationGroup: null,
  locationsGroup: null,
  gridLayerGroup: null,

  init() {
    if (this.map) return;
    this.initSelectedPlayer();
    this.initMap();
    this.createGrid();
    this.renderIslePilotZones();
    this.bindControls();
    this.startTracking();
  },

  initSelectedPlayer() {
    // 1. Check URL query ?steamId=
    const params = new URLSearchParams(window.location.search);
    const urlSteamId = params.get('steamId');
    if (urlSteamId) {
      this.selectedSteamId = urlSteamId;
      return;
    }

    // 2. Check localStorage
    try {
      const stored = localStorage.getItem('st25_steam_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u && u.steam_id) {
          this.selectedSteamId = u.steam_id;
          return;
        }
      }
    } catch (e) {}

    this.selectedSteamId = null;
  },

  initMap() {
    this.map = L.map('map-viewport', {
      preferCanvas: true,
      crs: L.CRS.Simple,
      minZoom: -1,
      maxZoom: 3,
      zoomSnap: 0.25,
      attributionControl: false
    });

    const imageOverlay = L.imageOverlay('assets/map/gateway.webp', this.mapBounds);
    imageOverlay.addTo(this.map);
    this.map.fitBounds(this.mapBounds);
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(this.resizeFrame);
        this.resizeFrame = requestAnimationFrame(() => this.map.invalidateSize({ pan: false }));
      });
      this.resizeObserver.observe(document.getElementById('map-viewport'));
    }

    // Initialize layer groups and add active ones to map
    this.gridLayerGroup = L.layerGroup().addTo(this.map);
    this.aiZoneGroup = L.layerGroup().addTo(this.map);
    this.sanctuaryGroup = L.layerGroup().addTo(this.map);
    this.orangeZoneGroup = L.layerGroup().addTo(this.map);
    this.hotspotRedGroup = L.layerGroup().addTo(this.map);
    this.patrolPurpleGroup = L.layerGroup().addTo(this.map);
    this.migrationGroup = L.layerGroup().addTo(this.map);
    this.locationsGroup = L.layerGroup().addTo(this.map);

    this.map.on('mousemove', (e) => {
      this.updateCoordinateDisplay(e.latlng);
    });
  },

  createGrid() {
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const step = 1000 / 12;

    for (let i = 0; i <= 12; i++) {
      const pos = i * step;
      // Vertical grid lines
      L.polyline([[0, pos], [1000, pos]], {
        color: 'rgba(245, 158, 11, 0.22)',
        weight: 1,
        dashArray: '4, 4'
      }).addTo(this.gridLayerGroup);

      // Horizontal grid lines
      L.polyline([[pos, 0], [pos, 1000]], {
        color: 'rgba(245, 158, 11, 0.22)',
        weight: 1,
        dashArray: '4, 4'
      }).addTo(this.gridLayerGroup);
    }

    // Grid labels (A1 at top-left, L12 at bottom-right)
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 12; c++) {
        const rowNumber = 12 - r;
        const cellName = `${cols[c]}${rowNumber}`;
        const centerLat = r * step + step / 2;
        const centerLng = c * step + step / 2;

        const labelIcon = L.divIcon({
          className: 'grid-cell-label',
          html: `<span style="font-size: 11px; color: rgba(255,255,255,0.22); font-weight:700;">${cellName}</span>`,
          iconSize: [40, 20],
          iconAnchor: [20, 10]
        });

        L.marker([centerLat, centerLng], { icon: labelIcon, interactive: false, keyboard: false }).addTo(this.gridLayerGroup);
      }
    }
  },

  renderIslePilotZones() {
    if (typeof IslePilotZonesData === 'undefined') return;

    // 1. Render Circular Zones
    (IslePilotZonesData.circles || []).forEach(zone => {
      const pos = IslePilotZonesData.worldToLatLng(zone.worldX, zone.worldY);
      let targetGroup = this.locationsGroup;

      if (zone.category === 'ai_zone') targetGroup = this.aiZoneGroup;
      else if (zone.category === 'sanctuary') targetGroup = this.sanctuaryGroup;
      else if (zone.category === 'orange_zone') targetGroup = this.orangeZoneGroup;
      else if (zone.category === 'hotspot_red') targetGroup = this.hotspotRedGroup;
      else if (zone.category === 'patrol_purple') targetGroup = this.patrolPurpleGroup;

      const circle = L.circle([pos.lat, pos.lng], {
        radius: zone.radius,
        color: zone.color,
        fillColor: zone.fillColor,
        fillOpacity: zone.fillOpacity || 0.25,
        weight: zone.weight || 2,
        dashArray: zone.dashArray || null
      }).addTo(targetGroup);

      // Center icon / dot for smaller circles
      if (zone.radius <= 20) {
        const dotIcon = L.divIcon({
          className: 'zone-center-pin',
          html: `<div style="background: ${zone.color}; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid #fff; box-shadow: 0 0 6px ${zone.color};"></div>`,
          iconSize: [8, 8],
          iconAnchor: [4, 4]
        });
        L.marker([pos.lat, pos.lng], { icon: dotIcon, interactive: false }).addTo(targetGroup);
      }

      circle.bindPopup(`
        <div style="font-family: inherit; color: #0f172a; max-width: 260px; padding: 2px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${zone.color};"></span>
            <strong style="color: #0f172a; font-size: 13px;">${zone.name}</strong>
          </div>
          <p style="font-size: 11px; color: #475569; line-height: 1.4; margin-bottom: 6px;">${zone.desc || ''}</p>
          <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">
            X: ${zone.worldX.toLocaleString()} | Y: ${zone.worldY.toLocaleString()}
          </div>
        </div>
      `);
    });

    // 2. Render Polygons (Mass Migration MMZ)
    (IslePilotZonesData.polygons || []).forEach(poly => {
      const latLngs = poly.points.map(pt => {
        const p = IslePilotZonesData.worldToLatLng(pt.x, pt.y);
        return [p.lat, p.lng];
      });

      const polygonLayer = L.polygon(latLngs, {
        color: poly.color,
        fillColor: poly.fillColor,
        fillOpacity: poly.fillOpacity || 0.22,
        weight: poly.weight || 2
      }).addTo(this.migrationGroup);

      polygonLayer.bindPopup(`
        <div style="font-family: inherit; color: #0f172a; padding: 2px;">
          <strong style="color: #0f172a; font-size: 13px;">${poly.name}</strong>
          <p style="font-size: 11px; color: #475569; margin-top: 4px;">${poly.desc || 'Vùng Di Cư Lớn của server ST25'}</p>
        </div>
      `);
    });

    // 3. Render 24 Landmark Locations (Địa danh Tiếng Việt Hài Hước)
    const selectLandmarkEl = document.getElementById('select-funny-landmark');
    if (selectLandmarkEl) {
      selectLandmarkEl.innerHTML = '<option value="">-- Khám phá 24 địa danh hài hước --</option>';
    }

    (IslePilotZonesData.locations || []).forEach(loc => {
      const pos = IslePilotZonesData.worldToLatLng(loc.worldX, loc.worldY);
      
      const locIcon = L.divIcon({
        className: 'location-landmark-pin',
        html: `
          <div style="background: rgba(15, 23, 42, 0.92); border: 2px solid #38bdf8; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(56, 189, 248, 0.6); cursor: pointer;">
            <span style="font-size: 11px; line-height: 1;">📍</span>
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      const m = L.marker([pos.lat, pos.lng], { icon: locIcon }).addTo(this.locationsGroup);

      // Tooltip on hover
      m.bindTooltip(`<b>${App.escapeHTML(loc.name)}</b>`, {
        direction: 'top',
        offset: [0, -12],
        className: 'map-landmark-tooltip'
      });

      // Humorous Vietnamese Popup
      const popupHtml = `
        <div style="font-family: inherit; color: #0f172a; max-width: 270px; padding: 2px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
            <span style="font-size: 16px;">📍</span>
            <strong style="color: #0f172a; font-size: 13.5px; line-height: 1.3;">${App.escapeHTML(loc.name)}</strong>
          </div>
          <div style="background: #f1f5f9; border-left: 3px solid #0284c7; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px;">
            <p style="font-size: 11.5px; color: #334155; line-height: 1.45; margin: 0; font-style: italic;">
              "${loc.desc || 'Địa danh kỳ thú trên đảo Gateway'}"
            </p>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #64748b; font-family: monospace;">
            <span>X: ${loc.worldX.toLocaleString()}</span>
            <span>Y: ${loc.worldY.toLocaleString()}</span>
          </div>
        </div>
      `;

      m.bindPopup(popupHtml);

      if (!this.landmarkMarkers) this.landmarkMarkers = {};
      this.landmarkMarkers[loc.name] = m;

      // Populate select dropdown
      if (selectLandmarkEl) {
        const opt = document.createElement('option');
        opt.value = loc.name;
        opt.textContent = loc.name;
        selectLandmarkEl.appendChild(opt);
      }
    });
  },

  updateCoordinateDisplay(latlng) {
    const coordsEl = document.getElementById('map-mouse-coords');
    const gridEl = document.getElementById('map-mouse-grid');
    if (!coordsEl || !gridEl) return;

    if (typeof IslePilotZonesData !== 'undefined') {
      const calib = IslePilotZonesData.calibration;
      const u = latlng.lng / 1000;
      const v = 1 - (latlng.lat / 1000);
      const gameX = Math.round(calib.originWorldX + (u - calib.originU) / calib.scaleU);
      const gameY = Math.round(calib.originWorldY + (v - calib.originV) / calib.scaleV);
      coordsEl.textContent = `X: ${gameX.toLocaleString()} | Y: ${gameY.toLocaleString()}`;
    }

    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const colIdx = Math.min(11, Math.max(0, Math.floor(latlng.lng / (1000 / 12))));
    const rowIdx = Math.min(11, Math.max(0, Math.floor((1000 - latlng.lat) / (1000 / 12))));
    const gridSquare = `${cols[colIdx]}${rowIdx + 1}`;
    gridEl.textContent = `Ô Lưới: ${gridSquare}`;
  },

  startTracking() {
    this.fetchData();
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => { if (!document.hidden) this.fetchData(); }, 4000);
  },

  async fetchData() {
    if (this.fetching) return;
    this.fetching = true;
    try {
      let url = ST25API.routes.playerMap;
      if (this.selectedSteamId) {
        url += `?steamId=${encodeURIComponent(this.selectedSteamId)}`;
      }

        const data = await App.readJSON(url);
        this.currentData = data;
        const signature = JSON.stringify(data);
        if (this.dataSignature !== signature) {
          this.dataSignature = signature;
          this.renderPlayerData(data);
        }
    } catch (err) {
      console.warn('Map tracking fetch error:', err);
    } finally {
      this.fetching = false;
    }
  },

  renderPlayerData(data) {
    const nameEl = document.getElementById('active-player-name');
    const steamEl = document.getElementById('active-player-steamid');
    const badgeEl = document.getElementById('player-live-badge');
    const speciesEl = document.getElementById('active-dino-species');
    const growthEl = document.getElementById('active-dino-growth');
    const healthTxtEl = document.getElementById('active-dino-health-txt');
    const healthBarEl = document.getElementById('active-dino-health-bar');
    const coordsEl = document.getElementById('active-dino-coords');
    const gridEl = document.getElementById('active-dino-grid');
    const focusBtn = document.getElementById('btn-focus-player');

    if (nameEl) nameEl.textContent = data.name || "Thành viên ST25";
    if (steamEl) steamEl.textContent = `SteamID: ${data.steamId || '---'}`;

    if (badgeEl) {
      if (data.online) {
        badgeEl.textContent = "TRỰC TUYẾN";
        badgeEl.className = "rule-badge badge-allow";
      } else {
        badgeEl.textContent = "NGOẠI TUYẾN";
        badgeEl.className = "rule-badge badge-orange";
      }
    }

    if (speciesEl) speciesEl.textContent = `${data.species || 'Chưa chọn'} (${data.gender || 'Đực'})`;
    if (growthEl) growthEl.textContent = data.growth || "0%";
    if (healthTxtEl) healthTxtEl.textContent = `${data.health ?? 100}%`;
    if (healthBarEl) healthBarEl.style.width = `${data.health ?? 100}%`;

    if (coordsEl) {
      coordsEl.textContent = `X: ${(data.x || 0).toLocaleString()} | Y: ${(data.y || 0).toLocaleString()}`;
    }
    if (gridEl) gridEl.textContent = data.grid || "F6";

    if (focusBtn) {
      focusBtn.disabled = !Number.isFinite(data.lat) || !Number.isFinite(data.lng);
    }

    // Render ONLY the active member's own marker. All other players are hidden!
    if (Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
      const playerIcon = L.divIcon({
        className: 'player-live-pin',
        html: `
          <div style="position: relative; width: 32px; height: 32px;">
            <div style="position: absolute; width: 100%; height: 100%; background: rgba(16, 185, 129, 0.45); border-radius: 50%; animation: pulse 1.5s infinite;"></div>
            <div style="position: absolute; width: 18px; height: 18px; top: 7px; left: 7px; background: #10b981; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 0 12px #10b981;"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const popupContent = `
        <div style="font-family: inherit; color: #0f172a; min-width: 200px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="font-size: 13px; color: #0f172a;">${data.name} (Bạn)</strong>
            <span style="font-size: 10px; background: #10b981; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight:700;">LIVE</span>
          </div>
          <div style="font-size: 12px; color: #0284c7; font-weight: 700; margin-bottom: 4px;">
            ${data.species} • ${data.growth}
          </div>
          <div style="font-size: 11px; color: #64748b; line-height: 1.4;">
            Máu: <strong>${data.health}%</strong> | Đói: <strong>${data.hunger}%</strong><br>
            Toạ độ: <strong>Ô ${data.grid}</strong><br>
            <span style="font-family: monospace; font-size: 10px;">X: ${data.x} | Y: ${data.y}</span>
          </div>
        </div>
      `;

      if (!this.playerMarker) {
        this.playerMarker = L.marker([data.lat, data.lng], { icon: playerIcon, zIndexOffset: 2000 }).addTo(this.map);
        this.playerMarker.bindPopup(popupContent);
      } else {
        this.playerMarker.setLatLng([data.lat, data.lng]);
        this.playerMarker.setPopupContent(popupContent);
      }
    } else if (this.playerMarker) {
      this.map.removeLayer(this.playerMarker);
      this.playerMarker = null;
    }
  },

  focusPlayer() {
    if (this.currentData && Number.isFinite(this.currentData.lat) && Number.isFinite(this.currentData.lng)) {
      this.map.setView([this.currentData.lat, this.currentData.lng], 1.75, { animate: true });
      if (this.playerMarker) {
        this.playerMarker.openPopup();
      }
    } else {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('Vị trí người chơi chưa sẵn sàng hoặc đang ngoại tuyến', 'warning');
      }
    }
  },

  bindControls() {
    // Focus player button
    const focusBtn = document.getElementById('btn-focus-player');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => this.focusPlayer());
    }

    // Layer Toggles
    const toggleLayer = (elemId, layerGroup) => {
      const el = document.getElementById(elemId);
      if (el && layerGroup) {
        el.addEventListener('change', (e) => {
          if (e.target.checked) this.map.addLayer(layerGroup);
          else this.map.removeLayer(layerGroup);
        });
      }
    };

    toggleLayer('chk-zone-ai', this.aiZoneGroup);
    toggleLayer('chk-zone-sanctuary', this.sanctuaryGroup);
    toggleLayer('chk-zone-orange', this.orangeZoneGroup);
    toggleLayer('chk-zone-hotspot', this.hotspotRedGroup);
    toggleLayer('chk-zone-patrol', this.patrolPurpleGroup);
    toggleLayer('chk-zone-migration', this.migrationGroup);
    toggleLayer('chk-zone-locations', this.locationsGroup);
    toggleLayer('chk-grid', this.gridLayerGroup);

    // Select Funny Landmark Dropdown Handler
    const selectLandmarkEl = document.getElementById('select-funny-landmark');
    if (selectLandmarkEl) {
      selectLandmarkEl.addEventListener('change', (e) => {
        const selectedName = e.target.value;
        if (!selectedName) return;

        const foundLoc = (IslePilotZonesData.locations || []).find(l => l.name === selectedName);
        if (foundLoc) {
          const pos = IslePilotZonesData.worldToLatLng(foundLoc.worldX, foundLoc.worldY);
          this.map.flyTo([pos.lat, pos.lng], 1.75, { duration: 0.8 });
          
          if (this.landmarkMarkers && this.landmarkMarkers[foundLoc.name]) {
            setTimeout(() => {
              this.landmarkMarkers[foundLoc.name].openPopup();
            }, 300);
          }
        }
      });
    }

    // Search Landmark / Zone
    const searchInput = document.getElementById('input-search-landmark');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query || typeof IslePilotZonesData === 'undefined') return;

        // Search locations first
        const foundLoc = (IslePilotZonesData.locations || []).find(l => l.name.toLowerCase().includes(query));
        if (foundLoc) {
          const pos = IslePilotZonesData.worldToLatLng(foundLoc.worldX, foundLoc.worldY);
          this.map.setView([pos.lat, pos.lng], 1.75, { animate: true });
          if (this.landmarkMarkers && this.landmarkMarkers[foundLoc.name]) {
            this.landmarkMarkers[foundLoc.name].openPopup();
          }
          return;
        }

        // Search circles
        const foundCircle = (IslePilotZonesData.circles || []).find(c => c.name.toLowerCase().includes(query));
        if (foundCircle) {
          const pos = IslePilotZonesData.worldToLatLng(foundCircle.worldX, foundCircle.worldY);
          this.map.setView([pos.lat, pos.lng], 1.75, { animate: true });
          return;
        }

        // Search polygons
        const foundPoly = (IslePilotZonesData.polygons || []).find(p => p.name.toLowerCase().includes(query));
        if (foundPoly && foundPoly.points.length > 0) {
          const pos = IslePilotZonesData.worldToLatLng(foundPoly.points[0].x, foundPoly.points[0].y);
          this.map.setView([pos.lat, pos.lng], 1.5, { animate: true });
        }
      });
    }

    // Load IslePilot Teleport Destinations & Bind Execute Button
    this.initTeleportControls();
  },

  async initTeleportControls() {
    const selectDest = document.getElementById('select-teleport-dest');
    const btnExecute = document.getElementById('btn-execute-teleport');
    const badgeStatus = document.getElementById('tp-status-badge');
    if (!selectDest || !btnExecute) return;

    try {
      const res = await App.readResponse(ST25API.routes.teleportDestinations);
      if (res.ok) {
        const locations = await res.json();
        if (Array.isArray(locations) && locations.length > 0) {
          selectDest.innerHTML = '<option value="">-- Chọn điểm đến --</option>' + 
            locations.map(loc => `<option value="${App.escapeHTML(loc.id)}">${App.escapeHTML(loc.name)} (${loc.cost > 0 ? loc.cost + ' Lúa' : 'Miễn phí'})</option>`).join('');
        } else {
          selectDest.innerHTML = '<option value="">-- Chưa có điểm TP --</option>';
        }
      } else {
        selectDest.innerHTML = '<option value="">-- Quyền TP bị khoá --</option>';
        if (badgeStatus) badgeStatus.textContent = 'Thiếu scope';
      }
    } catch (e) {
      selectDest.innerHTML = '<option value="">-- Lỗi tải TP --</option>';
    }

    btnExecute.addEventListener('click', async () => {
      const locationId = selectDest.value;
      if (!locationId) {
        if (typeof App !== 'undefined') App.showToast('Vui lòng chọn địa điểm muốn dịch chuyển!', 'warning');
        return;
      }

      if (!confirm('Bạn có chắc chắn muốn dịch chuyển nhân vật đến địa điểm này?')) return;

      btnExecute.disabled = true;
      btnExecute.textContent = 'Đang TP...';

      try {
        const tpRes = await fetch(ST25API.routes.teleportExecute, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId, steamId: this.selectedSteamId })
        });
        const tpData = await tpRes.json();

        if (tpRes.ok) {
          if (typeof App !== 'undefined') App.showToast(tpData.message || 'Dịch chuyển thành công!', 'success');
          setTimeout(() => this.fetchData(), 1500);
        } else {
          if (typeof App !== 'undefined') App.showToast(tpData.error || 'Dịch chuyển thất bại!', 'error');
        }
      } catch (err) {
        if (typeof App !== 'undefined') App.showToast('Lỗi mạng khi dịch chuyển!', 'error');
      } finally {
        btnExecute.disabled = false;
        btnExecute.textContent = 'Đi 🚀';
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('map-viewport')) {
    IsleMap.init();
  }
});
