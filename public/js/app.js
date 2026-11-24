(function (global) {
  'use strict';

  const { MEMBERS, WORK_PACKAGES, DOC_COMPARISON } = global.EdgeTrackerSeed;
  const { ProjectStore } = global.EdgeTrackerStore;
  const {
    getTodayIsoDate,
    addDaysToIsoDate,
    diffDays,
    formatShortTurkishDate,
    formatTimestampTurkish,
    formatRemainingDaysLabel,
  } = global.EdgeTrackerDates;

  function safeGroupBy(items, keyFn) {
    if (typeof Object.groupBy === 'function') {
      return Object.groupBy(items, keyFn);
    }
    const out = Object.create(null);
    items.forEach((item, idx) => {
      const k = String(keyFn(item, idx));
      if (!Object.hasOwn(out, k)) out[k] = [];
      out[k].push(item);
    });
    return out;
  }

  function safeToSorted(items, cmpFn) {
    if (typeof items.toSorted === 'function') {
      return items.toSorted(cmpFn);
    }
    return items.slice().sort(cmpFn);
  }

  const STATUS_COLUMNS = [
    { id: 'yapilacak', label: 'Yapılacak', pillClass: 'pill-muted' },
    { id: 'yapiliyor', label: 'Yapılıyor', pillClass: 'pill-accent' },
    { id: 'incelemede', label: 'İncelemede / Test', pillClass: 'pill-warn' },
    { id: 'tamamlandi', label: 'Tamamlandı', pillClass: 'pill-ok' },
  ];

  const store = new ProjectStore();
  let selectedDepTaskId = 'G-1.1';
  let activeDetailTaskId = null;

  const els = {};

  function cacheElements() {
    els.persistenceBadge = document.getElementById('persistence-badge');
    els.activeMemberSelect = document.getElementById('active-member-select');
    els.projectStartInput = document.getElementById('project-start-date');
    els.btnNewTask = document.getElementById('btn-new-task');
    els.btnSyncModal = document.getElementById('btn-sync-modal');
    els.btnExportPdf = document.getElementById('btn-export-pdf');
    els.countdownSummary = document.getElementById('countdown-summary');
    els.kpiWeightedPct = document.getElementById('kpi-weighted-pct');
    els.kpiTaskCount = document.getElementById('kpi-task-count');
    els.overallProgress = document.getElementById('overall-progress');
    els.kpiIpBreakdown = document.getElementById('kpi-ip-breakdown');
    els.kpiDaysLeft = document.getElementById('kpi-days-left');
    els.kpiCurrentMonth = document.getElementById('kpi-current-month');
    els.timelineProgress = document.getElementById('timeline-progress');
    els.kpiDeadlineDate = document.getElementById('kpi-deadline-date');
    els.hypothesisStatusList = document.getElementById('hypothesis-status-list');
    els.kpiPendingRequests = document.getElementById('kpi-pending-requests');
    els.kpiRequestsNote = document.getElementById('kpi-requests-note');
    els.btnJumpRequests = document.getElementById('btn-jump-requests');
    els.teamCardsGrid = document.getElementById('team-cards-grid');
    els.tabReqCount = document.getElementById('tab-req-count');
    els.filterSearch = document.getElementById('filter-search');
    els.filterMember = document.getElementById('filter-member');
    els.filterIp = document.getElementById('filter-ip');
    els.filterExec = document.getElementById('filter-exec');
    els.btnClearFilters = document.getElementById('btn-clear-filters');
    els.kanbanBoard = document.getElementById('kanban-board');
    els.depsGraphContainer = document.getElementById('deps-graph-container');
    els.depsInspector = document.getElementById('deps-inspector');
    els.ipProgressCards = document.getElementById('ip-progress-cards');
    els.ganttContainer = document.getElementById('gantt-container');
    els.requestsList = document.getElementById('requests-list');
    els.activityLogList = document.getElementById('activity-log-list');
    els.btnResetDefault = document.getElementById('btn-reset-default');
    els.docComparisonGrid = document.getElementById('doc-comparison-grid');
    els.workloadBalanceTable = document.getElementById('workload-balance-table');
    els.budgetTableContainer = document.getElementById('budget-table-container');
    els.detailDialog = document.getElementById('task-detail-dialog');
    els.detailTaskCode = document.getElementById('detail-task-code');
    els.detailDialogTitle = document.getElementById('detail-dialog-title');
    els.detailDialogBody = document.getElementById('detail-dialog-body');
    els.newTaskDialog = document.getElementById('new-task-dialog');
    els.newTaskForm = document.getElementById('new-task-form');
    els.btnCancelNewTask = document.getElementById('btn-cancel-new-task');
    els.ntDeps = document.getElementById('nt-deps');
    els.syncDialog = document.getElementById('sync-dialog');
    els.syncConfigForm = document.getElementById('sync-config-form');
    els.syncUrlInput = document.getElementById('sync-url-input');
    els.btnDisconnectCloud = document.getElementById('btn-disconnect-cloud');
    els.shareLinkOutput = document.getElementById('share-link-output');
    els.btnCopyShareLink = document.getElementById('btn-copy-share-link');
    els.syncStatusMsg = document.getElementById('sync-status-msg');
    els.liveAnnouncer = document.getElementById('live-announcer');
  }

  function announce(msg) {
    if (els.liveAnnouncer) els.liveAnnouncer.textContent = msg;
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, val] of Object.entries(props)) {
      if (val === undefined || val === null) continue;
      if (key === 'className') {
        node.className = val;
      } else if (key === 'dataset') {
        for (const [dk, dv] of Object.entries(val)) {
          node.dataset[dk] = dv;
        }
      } else if (key === 'style' && typeof val === 'object') {
        for (const [sk, sv] of Object.entries(val)) {
          node.style.setProperty(sk, sv);
        }
      } else if (key.startsWith('on') && typeof val === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key in node && key !== 'list') {
        node[key] = val;
      } else {
        node.setAttribute(key, String(val));
      }
    }
    const arr = Array.isArray(children) ? children : [children];
    for (const child of arr) {
      if (child === undefined || child === null || child === false) continue;
      node.append(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
    }
    return node;
  }

  function getMember(id) {
    return MEMBERS.find((m) => m.id === id) || MEMBERS[0];
  }

  function getTaskMap(tasks) {
    return new Map(tasks.map((t) => [t.id, t]));
  }

  function getBlockingDeps(task, taskMap) {
    return (task.dependsOn || []).filter((depId) => {
      const dep = taskMap.get(depId);
      return dep && dep.status !== 'tamamlandi';
    });
  }

  function getTaskScheduleInfo(task, state) {
    const startIso = addDaysToIsoDate(state.projectStartDate, task.startDay);
    const endIso = addDaysToIsoDate(state.projectStartDate, task.startDay + task.durationDays);
    const todayIso = getTodayIsoDate();
    const daysLeft = diffDays(todayIso, endIso);
    const remainingLabel = formatRemainingDaysLabel(daysLeft, task.status);
    return { startIso, endIso, daysLeft, remainingLabel };
  }

  function computeWeightedProgress(tasks) {
    const byIp = safeGroupBy(tasks, (t) => String(t.ipNo));
    let weightedSum = 0;
    const ipStats = WORK_PACKAGES.map((wp) => {
      const group = byIp[String(wp.ipNo)] ?? [];
      const total = group.length;
      const done = group.filter((t) => t.status === 'tamamlandi').length;
      const active = group.filter((t) => t.status === 'yapiliyor' || t.status === 'incelemede').length;
      const strictRatio = total > 0 ? done / total : 0;
      weightedSum += strictRatio * wp.weight;
      return {
        ...wp,
        total,
        done,
        active,
        pct: Math.round(strictRatio * 100),
      };
    });
    const doneCount = tasks.filter((t) => t.status === 'tamamlandi').length;
    return {
      weightedPct: Math.round(weightedSum),
      doneCount,
      totalCount: tasks.length,
      ipStats,
    };
  }

  function renderAll() {
    const state = store.state;
    els.activeMemberSelect.value = state.activeMemberId || 'all';
    els.projectStartInput.value = state.projectStartDate || '2026-11-24';

    updatePersistenceBadge();
    renderOverview(state);
    renderTeamCards(state);
    renderKanban(state);
    renderDependencies(state);
    renderTimeline(state);
    renderRequestsAndLog(state);
    renderDocsAndBalance(state);

    if (els.detailDialog.open && activeDetailTaskId) {
      renderDetailDialogContent(activeDetailTaskId);
    }
  }

  function updatePersistenceBadge() {
    if (store.storageMode === 'cloud+local') {
      els.persistenceBadge.textContent = 'Kayıt: Canlı Ortak Bulut + Tarayıcı';
      els.persistenceBadge.className = 'pill pill-ok';
    } else if (store.storageMode === 'disk+local') {
      els.persistenceBadge.textContent = 'Kayıt: Disk + Tarayıcı (Kalıcı)';
      els.persistenceBadge.className = 'pill pill-ok';
    } else {
      els.persistenceBadge.textContent = 'Kayıt: Tarayıcı (localStorage)';
      els.persistenceBadge.className = 'pill pill-accent';
    }
  }

  function renderOverview(state) {
    const { weightedPct, doneCount, totalCount, ipStats } = computeWeightedProgress(state.tasks);
    els.kpiWeightedPct.textContent = `%${weightedPct}`;
    els.kpiTaskCount.textContent = `${doneCount} / ${totalCount} görev tamam`;
    els.overallProgress.value = weightedPct;

    const activeIps = ipStats.filter((ip) => ip.active > 0).map((ip) => `İP ${ip.ipNo}`);
    els.kpiIpBreakdown.textContent = activeIps.length
      ? `Aktif iş paketleri: ${activeIps.join(', ')}`
      : 'Henüz aktif İP yok — görevleri "Yapılıyor"a alın.';

    const todayIso = getTodayIsoDate();
    const endIso = addDaysToIsoDate(state.projectStartDate, state.totalDurationDays);
    const elapsedDays = Math.max(0, diffDays(state.projectStartDate, todayIso));
    const remainingProjectDays = diffDays(todayIso, endIso);
    const currentMonth = Math.min(7, Math.max(1, Math.floor(elapsedDays / 30) + 1));
    const timePct = Math.min(100, Math.max(0, Math.round((elapsedDays / state.totalDurationDays) * 100)));

    els.kpiDaysLeft.textContent =
      remainingProjectDays >= 0 ? `${remainingProjectDays} gün` : `${Math.abs(remainingProjectDays)} gün aşıldı`;
    els.kpiCurrentMonth.textContent = `Ay ${currentMonth} / 7`;
    els.timelineProgress.value = timePct;
    els.kpiDeadlineDate.textContent = `Başlangıç: ${formatShortTurkishDate(state.projectStartDate)} → Hedef Bitiş: ${formatShortTurkishDate(endIso)}`;

    els.countdownSummary.replaceChildren(
      el('span', { className: 'pill pill-accent' }, `Bugün: ${formatShortTurkishDate(todayIso)}`),
      el('span', { className: 'pill pill-muted' }, `7 Aylık Bitiş: ${formatShortTurkishDate(endIso)} (${remainingProjectDays >= 0 ? `${remainingProjectDays} gün kaldı` : 'süre doldu'})`),
    );

    const hypDefs = [
      { id: 'H1', label: 'H1 · Görev Atama' },
      { id: 'H2', label: 'H2 · Veri Aktarım Sırası' },
      { id: 'H3', label: 'H3 · Güvenli Yeniden Bağlantı' },
    ];
    const hypNodes = hypDefs.map((h) => {
      const related = state.tasks.filter((t) => t.hypothesis === h.id);
      const hDone = related.filter((t) => t.status === 'tamamlandi').length;
      const pct = related.length ? Math.round((hDone / related.length) * 100) : 0;
      return el('li', {}, [
        el('span', {}, h.label),
        el('strong', { className: pct === 100 ? 'pill pill-ok' : 'pill pill-muted' }, `${hDone}/${related.length} (%${pct})`),
      ]);
    });
    els.hypothesisStatusList.replaceChildren(...hypNodes);

    const pendingReqs = state.requests.filter((r) => r.status === 'pending');
    els.kpiPendingRequests.textContent = String(pendingReqs.length);
    els.tabReqCount.textContent = String(pendingReqs.length);
    els.tabReqCount.hidden = pendingReqs.length === 0;
    els.kpiRequestsNote.textContent =
      pendingReqs.length > 0
        ? `${pendingReqs.length} adet onay bekleyen atama/isteme talebi var.`
        : 'Şu anda onay bekleyen devir veya görev isteme talebi yok.';
  }

  function renderTeamCards(state) {
    const taskMap = getTaskMap(state.tasks);
    const activeUser = state.activeMemberId;

    const cards = MEMBERS.map((member) => {
      const owned = state.tasks.filter((t) => t.ownerId === member.id);
      const inProgress = owned.filter((t) => t.status === 'yapiliyor' || t.status === 'incelemede');
      const done = owned.filter((t) => t.status === 'tamamlandi');
      const todoUnblocked = safeToSorted(
        owned.filter((t) => t.status === 'yapilacak' && getBlockingDeps(t, taskMap).length === 0),
        (a, b) => a.startDay - b.startDay,
      );
      const totalHours = owned.reduce((sum, t) => sum + Number(t.effortHours || 0), 0);
      const incomingPending = state.requests.filter((r) => r.status === 'pending' && r.toMemberId === member.id).length;

      const whereChildren = [];
      if (inProgress.length > 0) {
        whereChildren.push(el('strong', {}, 'Şu An Çalıştığı Yer'));
        for (const task of inProgress.slice(0, 2)) {
          const sched = getTaskScheduleInfo(task, state);
          whereChildren.push(
            el(
              'button',
              {
                type: 'button',
                className: 'member-active-btn',
                onClick: () => openTaskDetail(task.id),
              },
              [
                el('span', {}, `${task.id} · ${task.title}`),
                el('span', { className: `pill ${sched.remainingLabel.tone === 'overdue' ? 'pill-danger' : 'pill-accent'}` }, sched.remainingLabel.text),
              ],
            ),
          );
        }
      } else if (todoUnblocked.length > 0) {
        const nextTask = todoUnblocked[0];
        const sched = getTaskScheduleInfo(nextTask, state);
        whereChildren.push(el('strong', {}, 'Başlamaya Hazır Sıradaki Görev'));
        whereChildren.push(
          el(
            'button',
            {
              type: 'button',
              className: 'member-active-btn',
              onClick: () => openTaskDetail(nextTask.id),
            },
            [
              el('span', {}, `${nextTask.id} · ${nextTask.title}`),
              el('span', { className: 'pill pill-muted' }, sched.remainingLabel.text),
            ],
          ),
        );
      } else {
        whereChildren.push(el('strong', {}, 'Durum'));
        whereChildren.push(
          el(
            'span',
            { className: 'muted-text' },
            done.length === owned.length ? 'Tüm atanmış görevler tamamlandı.' : 'Önkoşul görevlerin tamamlanması bekleniyor.',
          ),
        );
      }

      return el(
        'article',
        {
          className: `member-card ${activeUser === member.id ? 'is-active-user' : ''}`,
          style: { '--member-color': member.color },
        },
        [
          el('div', { className: 'member-head' }, [
            el('div', { className: 'avatar-circle', 'aria-hidden': 'true' }, member.initials),
            el('div', {}, [
              el('h3', {}, member.name),
              el('p', { className: 'member-role' }, member.role),
            ]),
          ]),
          el('div', { className: 'member-metrics' }, [
            el('span', { className: 'pill pill-ok' }, `Tamam: ${done.length}/${owned.length}`),
            el('span', { className: 'pill pill-accent' }, `Aktif: ${inProgress.length}`),
            el('span', { className: 'pill pill-muted' }, `Yük: ${totalHours} saat`),
            incomingPending > 0 ? el('span', { className: 'pill pill-warn' }, `${incomingPending} gelen talep`) : null,
          ]),
          el('div', { className: 'member-where' }, whereChildren),
        ],
      );
    });

    els.teamCardsGrid.replaceChildren(...cards);
  }

  function getFilteredTasks(state) {
    const q = els.filterSearch.value.trim().toLocaleLowerCase('tr-TR');
    const memberFilter = els.filterMember.value;
    const ipFilter = els.filterIp.value;
    const execFilter = els.filterExec.value;

    return state.tasks.filter((t) => {
      if (memberFilter !== 'all' && t.ownerId !== memberFilter) return false;
      if (ipFilter !== 'all' && String(t.ipNo) !== ipFilter) return false;
      if (execFilter !== 'all' && t.executionType !== execFilter) return false;
      if (q) {
        const hay = `${t.id} ${t.title} ${t.description} ${t.deliverable || ''} ${t.hypothesis || ''}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderKanban(state) {
    const taskMap = getTaskMap(state.tasks);
    const filtered = safeToSorted(getFilteredTasks(state), (a, b) => a.startDay - b.startDay);
    const grouped = safeGroupBy(filtered, (t) => t.status);
    const pendingReqsByTask = safeGroupBy(
      state.requests.filter((r) => r.status === 'pending'),
      (r) => r.taskId,
    );

    const colElements = STATUS_COLUMNS.map((col) => {
      const colTasks = grouped[col.id] ?? [];
      const listItems = colTasks.map((task) => {
        const owner = getMember(task.ownerId);
        const blockers = getBlockingDeps(task, taskMap);
        const sched = getTaskScheduleInfo(task, state);
        const pendingReqs = pendingReqsByTask[task.id] ?? [];
        const activeUser = state.activeMemberId;

        const quickButtons = [];
        if (task.status !== 'yapiliyor') {
          quickButtons.push(
            el(
              'button',
              {
                type: 'button',
                className: 'btn btn-secondary btn-xs',
                onClick: () => moveTaskStatus(task.id, 'yapiliyor'),
              },
              'Yapılıyor’a Al',
            ),
          );
        }
        if (task.status !== 'tamamlandi') {
          quickButtons.push(
            el(
              'button',
              {
                type: 'button',
                className: 'btn btn-ok btn-xs',
                onClick: () => moveTaskStatus(task.id, 'tamamlandi'),
              },
              'Tamamlandı',
            ),
          );
        }
        if (activeUser !== 'all' && activeUser !== task.ownerId && task.status !== 'tamamlandi') {
          quickButtons.push(
            el(
              'button',
              {
                type: 'button',
                className: 'btn btn-ghost btn-xs',
                onClick: () => createClaimRequest(task.id, activeUser),
              },
              'Görevi İste',
            ),
          );
        }
        quickButtons.push(
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn-ghost btn-xs',
              onClick: () => openTaskDetail(task.id),
            },
            'Detay / Devir',
          ),
        );

        return el('li', {}, [
          el(
            'article',
            {
              className: `task-card ${blockers.length > 0 && task.status !== 'tamamlandi' ? 'is-blocked' : ''}`,
              style: { '--owner-color': owner.color },
            },
            [
              el('div', { className: 'task-card-top' }, [
                el('span', { className: 'task-id-group' }, [
                  el('span', {}, task.id),
                  el('span', { className: 'pill pill-muted' }, `İP ${task.ipNo}`),
                ]),
                el(
                  'span',
                  {
                    className: 'pill',
                    style: { background: owner.bgSoft, color: owner.color },
                  },
                  owner.shortName,
                ),
              ]),
              el('h4', {}, task.title),
              el('div', { className: 'task-meta-row' }, [
                el(
                  'span',
                  { className: `badge-mini ${task.executionType === 'paralel' ? 'badge-parallel' : 'badge-serial'}` },
                  task.executionType === 'paralel' ? 'Paralel' : 'Sıralı',
                ),
                el(
                  'span',
                  {
                    className: `pill ${
                      sched.remainingLabel.tone === 'done'
                        ? 'pill-ok'
                        : sched.remainingLabel.tone === 'overdue'
                          ? 'pill-danger'
                          : sched.remainingLabel.tone === 'urgent'
                            ? 'pill-warn'
                            : 'pill-muted'
                    }`,
                  },
                  sched.remainingLabel.text,
                ),
                task.hypothesis ? el('span', { className: 'pill pill-muted' }, task.hypothesis) : null,
              ]),
              blockers.length > 0 && task.status !== 'tamamlandi'
                ? el('div', { className: 'badge-mini badge-blocked' }, `Beklenen önkoşul: ${blockers.join(', ')}`)
                : null,
              pendingReqs.length > 0
                ? el(
                    'div',
                    { className: 'badge-mini badge-request' },
                    pendingReqs[0].type === 'reassign'
                      ? `Atama talebi → ${getMember(pendingReqs[0].toMemberId).shortName}`
                      : `${getMember(pendingReqs[0].requestedBy).shortName} bu görevi istedi`,
                  )
                : null,
              task.dependsOn && task.dependsOn.length
                ? el('div', { className: 'task-deps-line' }, `Bağlı: ${task.dependsOn.join(', ')}`)
                : null,
              el('div', { className: 'task-card-footer' }, [
                el('div', { className: 'task-actions-row' }, quickButtons),
              ]),
            ],
          ),
        ]);
      });

      return el('section', { className: 'kanban-col', 'aria-label': `${col.label} sütunu` }, [
        el('div', { className: 'kanban-col-header' }, [
          el('h3', {}, col.label),
          el('span', { className: `pill ${col.pillClass}` }, String(colTasks.length)),
        ]),
        el(
          'ul',
          { className: 'kanban-list' },
          listItems.length ? listItems : [el('li', { className: 'muted-text' }, 'Bu sütunda görev yok.')],
        ),
      ]);
    });

    els.kanbanBoard.replaceChildren(...colElements);
  }

  function renderDependencies(state) {
    const tasks = safeToSorted(state.tasks, (a, b) => a.ipNo - b.ipNo || a.startDay - b.startDay);
    const taskMap = getTaskMap(tasks);
    if (!taskMap.has(selectedDepTaskId) && tasks.length > 0) {
      selectedDepTaskId = tasks[0].id;
    }

    const byIp = safeGroupBy(tasks, (t) => String(t.ipNo));
    const colW = 210;
    const colGap = 48;
    const nodeW = 190;
    const nodeH = 74;
    const rowGap = 20;
    const padX = 24;
    const padY = 48;

    const maxRows = Math.max(1, ...WORK_PACKAGES.map((wp) => (byIp[String(wp.ipNo)] ?? []).length));
    const svgW = padX * 2 + WORK_PACKAGES.length * colW + (WORK_PACKAGES.length - 1) * colGap;
    const svgH = padY + maxRows * (nodeH + rowGap) + 32;

    const positions = new Map();
    WORK_PACKAGES.forEach((wp, colIdx) => {
      const colTasks = byIp[String(wp.ipNo)] ?? [];
      colTasks.forEach((task, rowIdx) => {
        const x = padX + colIdx * (colW + colGap);
        const y = padY + rowIdx * (nodeH + rowGap);
        positions.set(task.id, { x, y, task });
      });
    });

    const selectedTask = taskMap.get(selectedDepTaskId);
    const upstreamSet = new Set(selectedTask?.dependsOn || []);
    const downstreamSet = new Set(tasks.filter((t) => (t.dependsOn || []).includes(selectedDepTaskId)).map((t) => t.id));

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(svgW));
    svg.setAttribute('height', String(svgH));
    svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'İş paketleri ve görev bağımlılık ağı');

    WORK_PACKAGES.forEach((wp, colIdx) => {
      const x = padX + colIdx * (colW + colGap);
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', '24');
      label.setAttribute('font-size', '13');
      label.setAttribute('font-weight', '700');
      label.setAttribute('fill', '#334155');
      label.textContent = `İP ${wp.ipNo} (Ay ${wp.monthRange[0]}–${wp.monthRange[1]})`;
      svg.appendChild(label);
    });

    for (const task of tasks) {
      const targetPos = positions.get(task.id);
      if (!targetPos) continue;
      for (const depId of task.dependsOn || []) {
        const srcPos = positions.get(depId);
        if (!srcPos) continue;
        const x1 = srcPos.x + nodeW;
        const y1 = srcPos.y + nodeH / 2;
        const x2 = targetPos.x;
        const y2 = targetPos.y + nodeH / 2;
        const dx = Math.max(36, (x2 - x1) * 0.5);

        const isUpstreamEdge = task.id === selectedDepTaskId;
        const isDownstreamEdge = depId === selectedDepTaskId;

        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', isUpstreamEdge ? '#d97706' : isDownstreamEdge ? '#15803d' : '#cbd5e1');
        path.setAttribute('stroke-width', isUpstreamEdge || isDownstreamEdge ? '2.8' : '1.5');
        svg.appendChild(path);
      }
    }

    for (const [taskId, pos] of positions.entries()) {
      const { x, y, task } = pos;
      const owner = getMember(task.ownerId);
      const isSelected = taskId === selectedDepTaskId;
      const isUpstream = upstreamSet.has(taskId);
      const isDownstream = downstreamSet.has(taskId);

      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${task.id} ${task.title}, Sorumlu: ${owner.shortName}`);
      g.style.cursor = 'pointer';

      const selectNode = () => {
        selectedDepTaskId = task.id;
        renderDependencies(store.state);
      };
      g.addEventListener('click', selectNode);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectNode();
        }
      });

      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(nodeW));
      rect.setAttribute('height', String(nodeH));
      rect.setAttribute('rx', '10');
      rect.setAttribute(
        'fill',
        task.status === 'tamamlandi'
          ? '#f0fdf4'
          : isSelected
            ? '#f0fdfa'
            : isUpstream
              ? '#fffbeb'
              : isDownstream
                ? '#ecfdf5'
                : '#ffffff',
      );
      rect.setAttribute(
        'stroke',
        isSelected ? '#0f766e' : isUpstream ? '#d97706' : isDownstream ? '#15803d' : owner.borderColor,
      );
      rect.setAttribute('stroke-width', isSelected ? '3' : '1.5');
      g.appendChild(rect);

      const topText = document.createElementNS(svgNS, 'text');
      topText.setAttribute('x', String(x + 10));
      topText.setAttribute('y', String(y + 20));
      topText.setAttribute('font-size', '11');
      topText.setAttribute('font-weight', '700');
      topText.setAttribute('fill', owner.color);
      topText.textContent = `${task.id} · ${owner.shortName} · ${task.executionType === 'paralel' ? 'Paralel' : 'Sıralı'}`;
      g.appendChild(topText);

      const titleText = document.createElementNS(svgNS, 'text');
      titleText.setAttribute('x', String(x + 10));
      titleText.setAttribute('y', String(y + 40));
      titleText.setAttribute('font-size', '11.5');
      titleText.setAttribute('font-weight', '600');
      titleText.setAttribute('fill', '#0f172a');
      titleText.textContent = task.title.length > 26 ? `${task.title.slice(0, 25)}…` : task.title;
      g.appendChild(titleText);

      const statusLabelMap = {
        yapilacak: 'Yapılacak',
        yapiliyor: 'Yapılıyor',
        incelemede: 'İncelemede',
        tamamlandi: '✓ Tamamlandı',
      };
      const subText = document.createElementNS(svgNS, 'text');
      subText.setAttribute('x', String(x + 10));
      subText.setAttribute('y', String(y + 59));
      subText.setAttribute('font-size', '10.5');
      subText.setAttribute('fill', task.status === 'tamamlandi' ? '#15803d' : '#475569');
      subText.textContent = `${statusLabelMap[task.status] || task.status} · ${task.durationDays}g`;
      g.appendChild(subText);

      svg.appendChild(g);
    }

    els.depsGraphContainer.replaceChildren(svg);

    if (selectedTask) {
      const owner = getMember(selectedTask.ownerId);
      const upstreamTasks = (selectedTask.dependsOn || []).map((id) => taskMap.get(id)).filter(Boolean);
      const downstreamTasks = tasks.filter((t) => (t.dependsOn || []).includes(selectedTask.id));
      const parallelPeers = tasks.filter(
        (t) =>
          t.id !== selectedTask.id &&
          t.startDay < selectedTask.startDay + selectedTask.durationDays &&
          t.startDay + t.durationDays > selectedTask.startDay,
      );

      const makeChipList = (list, emptyText) => {
        if (!list.length) return el('p', { className: 'muted-text' }, emptyText);
        return el(
          'ul',
          { className: 'dep-chip-list' },
          list.map((t) =>
            el('li', {}, [
              el(
                'button',
                {
                  type: 'button',
                  className: 'dep-chip-btn',
                  onClick: () => {
                    selectedDepTaskId = t.id;
                    renderDependencies(store.state);
                  },
                },
                `${t.id} (${getMember(t.ownerId).shortName})`,
              ),
            ]),
          ),
        );
      };

      els.depsInspector.replaceChildren(
        el('div', { className: 'task-card-top' }, [
          el('span', { className: 'pill pill-accent' }, `${selectedTask.id} · İP ${selectedTask.ipNo}`),
          el('span', { className: 'pill', style: { background: owner.bgSoft, color: owner.color } }, owner.name),
        ]),
        el('h3', {}, selectedTask.title),
        el('p', { className: 'muted-text' }, selectedTask.parallelNote || selectedTask.description),
        el('div', {}, [
          el('strong', { style: { fontSize: '0.8rem' } }, 'Önkoşulları (Bu bitmeden başlayamaz):'),
          makeChipList(upstreamTasks, 'Önkoşulu yok — doğrudan başlayabilir.'),
        ]),
        el('div', {}, [
          el('strong', { style: { fontSize: '0.8rem' } }, 'Açtığı Görevler (Buna bağlı sonraki adımlar):'),
          makeChipList(downstreamTasks, 'Son aşama — başka bir görevi kilitlemiyor.'),
        ]),
        el('div', {}, [
          el('strong', { style: { fontSize: '0.8rem' } }, 'Aynı Dönemde Paralel Yürüyenler:'),
          makeChipList(parallelPeers.slice(0, 6), 'Çakışan paralel görev yok.'),
        ]),
        el(
          'button',
          {
            type: 'button',
            className: 'btn btn-primary btn-sm',
            onClick: () => openTaskDetail(selectedTask.id),
          },
          'Görevi Yönet / Devir Talebi Aç',
        ),
      );
    }
  }

  function renderTimeline(state) {
    const { ipStats } = computeWeightedProgress(state.tasks);

    const ipCards = ipStats.map((ip) =>
      el('article', { className: 'ip-card' }, [
        el('div', { className: 'task-card-top' }, [
          el('span', { className: 'pill pill-accent' }, `İP ${ip.ipNo} · Ay ${ip.monthRange[0]}–${ip.monthRange[1]}`),
          el('span', { className: 'pill pill-muted' }, `Ağırlık: %${ip.weight}`),
        ]),
        el('h3', {}, ip.title),
        el('div', { className: 'kpi-value-row' }, [
          el('strong', {}, `%${ip.pct} tamamlandı`),
          el('span', { className: 'muted-text' }, `${ip.done}/${ip.total} görev`),
        ]),
        el('progress', { value: ip.pct, max: 100 }),
        el('p', { className: 'kpi-note' }, `Ölçüt: ${ip.successCriterion}`),
        el('details', {}, [
          el('summary', { style: { fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' } }, 'Risk B-Planı'),
          el('p', { className: 'kpi-note', style: { marginBlockStart: '0.35rem' } }, ip.riskSummary),
        ]),
      ]),
    );
    els.ipProgressCards.replaceChildren(...ipCards);

    const sortedTasks = safeToSorted(state.tasks, (a, b) => a.startDay - b.startDay || a.ipNo - b.ipNo);
    const rows = sortedTasks.map((task) => {
      const owner = getMember(task.ownerId);
      const sched = getTaskScheduleInfo(task, state);
      const leftPct = Math.min(98, Math.max(0, (task.startDay / state.totalDurationDays) * 100));
      const widthPct = Math.max(4, Math.min(100 - leftPct, (task.durationDays / state.totalDurationDays) * 100));

      return el('tr', {}, [
        el('td', {}, el('strong', {}, task.id)),
        el('td', {}, task.title),
        el('td', {}, el('span', { className: 'pill', style: { background: owner.bgSoft, color: owner.color } }, owner.shortName)),
        el('td', {}, formatShortTurkishDate(sched.startIso)),
        el('td', {}, sched.remainingLabel.text),
        el('td', { style: { minInlineSize: '260px' } }, [
          el('div', { className: 'gantt-track' }, [
            el(
              'button',
              {
                type: 'button',
                className: 'gantt-bar',
                style: {
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  background: task.status === 'tamamlandi' ? '#15803d' : owner.color,
                  border: '0',
                },
                onClick: () => openTaskDetail(task.id),
              },
              `${task.id} (${task.durationDays}g)`,
            ),
          ]),
        ]),
      ]);
    });

    const table = el('table', { className: 'gantt-table' }, [
      el('caption', { className: 'visually-hidden' }, '7 aylık proje görev zaman çizelgesi'),
      el('thead', {}, [
        el('tr', {}, [
          el('th', { scope: 'col' }, 'Kod'),
          el('th', { scope: 'col' }, 'Görev'),
          el('th', { scope: 'col' }, 'Sorumlu'),
          el('th', { scope: 'col' }, 'Başlangıç'),
          el('th', { scope: 'col' }, 'Kalan Süre'),
          el('th', { scope: 'col' }, '7 Aylık Dağılım (Ay 1 → Ay 7)'),
        ]),
      ]),
      el('tbody', {}, rows),
    ]);

    els.ganttContainer.replaceChildren(table);
  }

  function renderRequestsAndLog(state) {
    const taskMap = getTaskMap(state.tasks);
    const sortedReqs = safeToSorted(state.requests, (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    if (sortedReqs.length === 0) {
      els.requestsList.replaceChildren(
        el('p', { className: 'muted-text' }, 'Henüz hiç atama veya görev isteme talebi oluşturulmamış.'),
      );
    } else {
      const reqCards = sortedReqs.map((req) => {
        const task = taskMap.get(req.taskId);
        const fromM = getMember(req.fromMemberId);
        const toM = getMember(req.toMemberId);
        const requester = getMember(req.requestedBy);
        const isPending = req.status === 'pending';

        const statusText =
          req.status === 'pending'
            ? 'Onay Bekliyor'
            : req.status === 'approved'
              ? 'Onaylandı (Devredildi)'
              : 'Reddedildi';

        const headline =
          req.type === 'reassign'
            ? `${fromM.shortName}, ${req.taskId} görevini ${toM.shortName} kişisine atamak istiyor`
            : `${requester.shortName}, ${fromM.shortName} üzerindeki ${req.taskId} görevini istiyor`;

        const actionBtns = isPending
          ? el('div', { className: 'status-btn-group' }, [
              el(
                'button',
                {
                  type: 'button',
                  className: 'btn btn-ok btn-sm',
                  onClick: () => resolveRequest(req.id, 'approved'),
                },
                'Onayla ve Devret',
              ),
              el(
                'button',
                {
                  type: 'button',
                  className: 'btn btn-danger-ghost btn-sm',
                  onClick: () => resolveRequest(req.id, 'rejected'),
                },
                'Reddet',
              ),
            ])
          : null;

        return el('article', { className: `request-card ${isPending ? 'is-pending' : ''}` }, [
          el('div', { className: 'task-card-top' }, [
            el('span', { className: `pill ${isPending ? 'pill-warn' : req.status === 'approved' ? 'pill-ok' : 'pill-muted'}` }, statusText),
            el('span', { className: 'activity-time' }, formatTimestampTurkish(req.createdAt)),
          ]),
          el('strong', {}, headline),
          task ? el('div', { className: 'muted-text' }, `Görev: ${task.title}`) : null,
          req.note ? el('p', { style: { margin: '0', fontSize: '0.84rem' } }, `Not: "${req.note}"`) : null,
          actionBtns,
        ]);
      });
      els.requestsList.replaceChildren(...reqCards);
    }

    const logItems = state.activityLog.map((entry) => {
      const actor = entry.actorId ? getMember(entry.actorId).shortName : 'Sistem';
      return el('li', { className: 'activity-item' }, [
        el('div', { className: 'task-card-top' }, [
          el('strong', {}, actor),
          el('span', { className: 'activity-time' }, formatTimestampTurkish(entry.timestamp)),
        ]),
        el('span', {}, entry.message),
      ]);
    });
    els.activityLogList.replaceChildren(...logItems);
  }

  function renderDocsAndBalance(state) {
    const diffCards = DOC_COMPARISON.differences.map((d) =>
      el('article', { className: 'diff-card' }, [
        el('h3', {}, d.topic),
        el('div', { className: 'diff-col' }, [el('strong', {}, '2. Belge (Sizin Taslak): '), el('span', {}, d.originalDoc)]),
        el('div', { className: 'diff-col' }, [el('strong', {}, '1. Belge / Uygulama: '), el('span', {}, d.advisorDoc)]),
      ]),
    );
    els.docComparisonGrid.replaceChildren(...diffCards);

    const totalAllHours = state.tasks.reduce((s, t) => s + Number(t.effortHours || 0), 0) || 1;
    const balanceRows = MEMBERS.map((m) => {
      const owned = state.tasks.filter((t) => t.ownerId === m.id);
      const hours = owned.reduce((s, t) => s + Number(t.effortHours || 0), 0);
      const pct = Math.round((hours / totalAllHours) * 100);
      return el('tr', {}, [
        el('td', {}, el('strong', { style: { color: m.color } }, m.name)),
        el('td', {}, `${owned.length} görev`),
        el('td', {}, `${hours} saat (%${pct})`),
        el('td', {}, m.role),
      ]);
    });
    els.workloadBalanceTable.replaceChildren(
      el('table', { className: 'clean-table' }, [
        el('thead', {}, el('tr', {}, [el('th', { scope: 'col' }, 'Ekip Üyesi'), el('th', { scope: 'col' }, 'Görev'), el('th', { scope: 'col' }, 'Efor Payı'), el('th', { scope: 'col' }, 'Ana Sorumluluk Alanı')])),
        el('tbody', {}, balanceRows),
      ]),
    );

    const budgetRows = DOC_COMPARISON.budgetItems.map((b) =>
      el('tr', {}, [
        el('td', {}, b.item),
        el('td', {}, b.qty),
        el('td', {}, `${b.amount.toLocaleString('tr-TR')} TL`),
      ]),
    );
    budgetRows.push(
      el('tr', {}, [
        el('td', {}, el('strong', {}, 'Toplam Talep')),
        el('td', {}, el('strong', {}, 'Üst sınır: 12.000 TL')),
        el('td', {}, el('strong', {}, `${DOC_COMPARISON.budgetTotal.toLocaleString('tr-TR')} TL`)),
      ]),
    );
    els.budgetTableContainer.replaceChildren(
      el('table', { className: 'clean-table' }, [
        el('thead', {}, el('tr', {}, [el('th', { scope: 'col' }, 'Kalem'), el('th', { scope: 'col' }, 'Miktar'), el('th', { scope: 'col' }, 'Tutar')])),
        el('tbody', {}, budgetRows),
      ]),
    );
  }

  function moveTaskStatus(taskId, nextStatus) {
    const labelMap = {
      yapilacak: 'Yapılacak',
      yapiliyor: 'Yapılıyor',
      incelemede: 'İncelemede / Test',
      tamamlandi: 'Tamamlandı',
    };
    const state = store.state;
    const target = state.tasks.find((t) => t.id === taskId);
    if (!target || target.status === nextStatus) return;

    const actorId = state.activeMemberId === 'all' ? target.ownerId : state.activeMemberId;
    store.update(
      (draft) => {
        const t = draft.tasks.find((item) => item.id === taskId);
        if (t) t.status = nextStatus;
      },
      {
        actorId,
        type: 'status',
        message: `${taskId} (${target.title}) görevi "${labelMap[nextStatus]}" sütununa taşındı.`,
      },
    );
    announce(`${taskId} ${labelMap[nextStatus]} durumuna taşındı.`);
  }

  function createReassignRequest(taskId, toMemberId, note) {
    const state = store.state;
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || task.ownerId === toMemberId) return;

    const actorId = state.activeMemberId === 'all' ? task.ownerId : state.activeMemberId;
    store.update(
      (draft) => {
        draft.requests.unshift({
          id: `REQ-${Date.now()}`,
          type: 'reassign',
          taskId,
          fromMemberId: task.ownerId,
          toMemberId,
          requestedBy: actorId,
          note: note || '',
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      },
      {
        actorId,
        type: 'request',
        message: `${taskId} için ${getMember(toMemberId).shortName} kişisine atama talebi oluşturuldu.`,
      },
    );
    announce(`${taskId} için atama talebi oluşturuldu.`);
  }

  function createClaimRequest(taskId, requesterId, note = '') {
    const state = store.state;
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || task.ownerId === requesterId) return;

    store.update(
      (draft) => {
        draft.requests.unshift({
          id: `REQ-${Date.now()}`,
          type: 'claim',
          taskId,
          fromMemberId: task.ownerId,
          toMemberId: requesterId,
          requestedBy: requesterId,
          note: note || `${getMember(requesterId).shortName} bu görevi devralmak istiyor.`,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      },
      {
        actorId: requesterId,
        type: 'request',
        message: `${getMember(requesterId).shortName}, ${getMember(task.ownerId).shortName} kişisinden ${taskId} görevini istedi.`,
      },
    );
    announce(`${taskId} için görev isteme talebi gönderildi.`);
  }

  function resolveRequest(requestId, resolution) {
    const state = store.state;
    const req = state.requests.find((r) => r.id === requestId);
    if (!req || req.status !== 'pending') return;

    const actorId = state.activeMemberId === 'all' ? req.toMemberId : state.activeMemberId;
    const nextOwner = getMember(req.toMemberId);

    store.update(
      (draft) => {
        const targetReq = draft.requests.find((r) => r.id === requestId);
        if (!targetReq) return;
        targetReq.status = resolution;
        targetReq.resolvedAt = new Date().toISOString();

        if (resolution === 'approved') {
          const task = draft.tasks.find((t) => t.id === targetReq.taskId);
          if (task) {
            task.ownerId = targetReq.toMemberId;
          }
        }
      },
      {
        actorId,
        type: 'request_resolved',
        message:
          resolution === 'approved'
            ? `${req.taskId} görevinin devir/isteme talebi onaylandı — yeni sorumlu: ${nextOwner.shortName}.`
            : `${req.taskId} görevinin devir/isteme talebi reddedildi.`,
      },
    );
    announce(resolution === 'approved' ? 'Talep onaylandı.' : 'Talep reddedildi.');
  }

  function openTaskDetail(taskId) {
    activeDetailTaskId = taskId;
    renderDetailDialogContent(taskId);
    if (!els.detailDialog.open) {
      els.detailDialog.showModal();
    }
  }

  function renderDetailDialogContent(taskId) {
    const state = store.state;
    const taskMap = getTaskMap(state.tasks);
    const task = taskMap.get(taskId);
    if (!task) return;

    const owner = getMember(task.ownerId);
    const sched = getTaskScheduleInfo(task, state);
    const blockers = getBlockingDeps(task, taskMap);
    const dependents = state.tasks.filter((t) => (t.dependsOn || []).includes(task.id));

    els.detailTaskCode.textContent = `${task.id} · İP ${task.ipNo} · ${task.hypothesis || 'Genel'}`;
    els.detailDialogTitle.textContent = task.title;

    const statusBtns = STATUS_COLUMNS.map((col) =>
      el(
        'button',
        {
          type: 'button',
          className: `btn btn-sm ${task.status === col.id ? 'btn-primary' : 'btn-secondary'}`,
          onClick: () => moveTaskStatus(task.id, col.id),
        },
        col.label,
      ),
    );

    const reassignSelect = el(
      'select',
      { id: 'reassign-to-select', name: 'toMemberId' },
      MEMBERS.filter((m) => m.id !== task.ownerId).map((m) => el('option', { value: m.id }, m.name)),
    );
    const reassignNote = el('input', {
      type: 'text',
      id: 'reassign-note-input',
      placeholder: 'Kısa sebep / devir notu (isteğe bağlı)',
    });
    const reassignForm = el(
      'form',
      {
        className: 'form-row',
        onSubmit: (e) => {
          e.preventDefault();
          createReassignRequest(task.id, reassignSelect.value, reassignNote.value.trim());
          reassignNote.value = '';
        },
      },
      [
        el('div', { className: 'form-row two-col' }, [
          el('div', { className: 'field' }, [
            el('label', { for: 'reassign-to-select' }, 'Kime Atama Talebi Açılacak?'),
            reassignSelect,
          ]),
          el('div', { className: 'field' }, [
            el('label', { for: 'reassign-note-input' }, 'Not'),
            reassignNote,
          ]),
        ]),
        el('div', { className: 'status-btn-group' }, [
          el('button', { type: 'submit', className: 'btn btn-secondary btn-sm' }, 'Başkasına Atama Talebi Oluştur'),
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              onClick: () => {
                const requesterId = state.activeMemberId !== 'all' ? state.activeMemberId : reassignSelect.value;
                if (requesterId === task.ownerId) {
                  announce('Zaten bu görevin sorumlusunuz.');
                  return;
                }
                createClaimRequest(task.id, requesterId, reassignNote.value.trim());
                reassignNote.value = '';
              },
            },
            state.activeMemberId !== 'all' && state.activeMemberId !== task.ownerId
              ? `${getMember(state.activeMemberId).shortName} Olarak Bu Görevi İste`
              : 'Seçili Kişi Adına Görevi İste',
          ),
        ]),
      ],
    );

    const directOwnerSelect = el(
      'select',
      { id: 'direct-owner-select' },
      MEMBERS.map((m) => el('option', { value: m.id, selected: m.id === task.ownerId }, m.name)),
    );
    directOwnerSelect.addEventListener('change', () => {
      const nextId = directOwnerSelect.value;
      store.update(
        (draft) => {
          const t = draft.tasks.find((item) => item.id === task.id);
          if (t) t.ownerId = nextId;
        },
        {
          actorId: state.activeMemberId === 'all' ? nextId : state.activeMemberId,
          type: 'reassign_direct',
          message: `${task.id} sorumlusu doğrudan ${getMember(nextId).shortName} olarak güncellendi.`,
        },
      );
    });

    els.detailDialogBody.replaceChildren(
      el('div', { className: 'task-meta-row' }, [
        el('span', { className: 'pill', style: { background: owner.bgSoft, color: owner.color } }, `Sorumlu: ${owner.name}`),
        el('span', { className: 'pill pill-muted' }, `${formatShortTurkishDate(sched.startIso)} → ${formatShortTurkishDate(sched.endIso)}`),
        el('span', { className: 'pill pill-accent' }, sched.remainingLabel.text),
        el('span', { className: `badge-mini ${task.executionType === 'paralel' ? 'badge-parallel' : 'badge-serial'}` }, task.executionType === 'paralel' ? 'Paralel Yürütülebilir' : 'Sıralı (Kritik Yol)'),
      ]),
      el('p', { style: { margin: '0' } }, task.description),
      task.deliverable ? el('p', { className: 'muted-text' }, `Beklenen Çıktı: ${task.deliverable}`) : null,
      el('section', { className: 'detail-section' }, [
        el('h2', {}, 'Durumu Taşı'),
        el('div', { className: 'status-btn-group' }, statusBtns),
      ]),
      el('section', { className: 'detail-section' }, [
        el('h2', {}, 'Bağımlılıklar'),
        el('p', { className: 'muted-text' }, `Önkoşullar: ${task.dependsOn?.length ? task.dependsOn.join(', ') : 'Yok'}${blockers.length ? ` (Beklenen: ${blockers.join(', ')})` : ''}`),
        el('p', { className: 'muted-text' }, `Bu görevi bekleyenler: ${dependents.length ? dependents.map((d) => d.id).join(', ') : 'Yok'}`),
      ]),
      el('section', { className: 'detail-section' }, [
        el('h2', {}, 'Başkasına Atama Talebi / Görev İsteme'),
        reassignForm,
        el('div', { className: 'field', style: { marginBlockStart: '0.35rem' } }, [
          el('label', { for: 'direct-owner-select' }, 'Veya Hızlı Sorumlu Değiştir (Ekip İçi Kararla)'),
          directOwnerSelect,
        ]),
      ]),
    );
  }

  function setupTabs() {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const panels = new Map([
      ['tab-board', document.getElementById('panel-board')],
      ['tab-deps', document.getElementById('panel-deps')],
      ['tab-timeline', document.getElementById('panel-timeline')],
      ['tab-requests', document.getElementById('panel-requests')],
      ['tab-docs', document.getElementById('panel-docs')],
    ]);

    const selectTab = (targetTab, shouldFocus = false) => {
      for (const tab of tabs) {
        const active = tab === targetTab;
        tab.setAttribute('aria-selected', String(active));
        tab.setAttribute('tabindex', active ? '0' : '-1');
        const panel = panels.get(tab.id);
        if (panel) {
          panel.hidden = !active;
          if (active) {
            panel.setAttribute('tabindex', '0');
          } else {
            panel.removeAttribute('tabindex');
          }
        }
      }
      targetTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (shouldFocus) targetTab.focus();
    };

    for (const tab of tabs) {
      tab.addEventListener('click', () => selectTab(tab, false));
      tab.addEventListener('keydown', (e) => {
        const idx = tabs.indexOf(tab);
        let nextIdx = null;
        if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') nextIdx = 0;
        else if (e.key === 'End') nextIdx = tabs.length - 1;
        if (nextIdx !== null) {
          e.preventDefault();
          selectTab(tabs[nextIdx], true);
        }
      });
    }

    return selectTab;
  }

  function setupDialogs() {
    for (const dialog of [els.detailDialog, els.newTaskDialog, els.syncDialog]) {
      dialog.addEventListener('close', () => {
        dialog.returnValue = '';
      });

      if (!('closedBy' in HTMLDialogElement.prototype)) {
        const outside = (e) => {
          const r = dialog.getBoundingClientRect();
          return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        };
        let pressedOutside = false;
        dialog.addEventListener('pointerdown', (e) => {
          pressedOutside = outside(e);
        });
        dialog.addEventListener('pointerup', (e) => {
          if (pressedOutside && outside(e)) dialog.close();
        });
      }
    }
  }

  function populateNewTaskDeps() {
    const options = store.state.tasks.map((t) => el('option', { value: t.id }, `${t.id} · ${t.title}`));
    els.ntDeps.replaceChildren(...options);
  }

  async function bootstrap() {
    cacheElements();
    const selectTab = setupTabs();
    setupDialogs();

    store.subscribe(() => renderAll());
    await store.init();

    els.activeMemberSelect.addEventListener('change', () => {
      const val = els.activeMemberSelect.value;
      store.update((draft) => {
        draft.activeMemberId = val;
      });
    });

    els.projectStartInput.addEventListener('change', () => {
      const val = els.projectStartInput.value;
      if (!val) return;
      store.update(
        (draft) => {
          draft.projectStartDate = val;
        },
        {
          actorId: store.state.activeMemberId === 'all' ? 'sila' : store.state.activeMemberId,
          type: 'schedule',
          message: `Proje başlangıç tarihi ${formatShortTurkishDate(val)} olarak güncellendi.`,
        },
      );
    });

    for (const ctrl of [els.filterSearch, els.filterMember, els.filterIp, els.filterExec]) {
      ctrl.addEventListener('input', () => renderKanban(store.state));
      ctrl.addEventListener('change', () => renderKanban(store.state));
    }
    els.btnClearFilters.addEventListener('click', () => {
      els.filterSearch.value = '';
      els.filterMember.value = 'all';
      els.filterIp.value = 'all';
      els.filterExec.value = 'all';
      renderKanban(store.state);
    });

    els.btnJumpRequests.addEventListener('click', () => {
      const reqTab = document.getElementById('tab-requests');
      if (reqTab) selectTab(reqTab, true);
    });

    els.btnNewTask.addEventListener('click', () => {
      populateNewTaskDeps();
      els.newTaskForm.reset();
      if (store.state.activeMemberId !== 'all') {
        document.getElementById('nt-owner').value = store.state.activeMemberId;
      }
      els.newTaskDialog.showModal();
    });

    els.btnCancelNewTask.addEventListener('click', () => {
      els.newTaskDialog.close('cancel');
    });

    els.newTaskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(els.newTaskForm);
      const title = String(formData.get('title') || '').trim();
      if (title.length < 4) return;

      const ipNo = Number(formData.get('ipNo') || 1);
      const ownerId = String(formData.get('ownerId') || 'sila');
      const executionType = String(formData.get('executionType') || 'paralel');
      const hypothesis = String(formData.get('hypothesis') || 'Genel');
      const startDay = Math.max(0, Math.min(209, Number(formData.get('startDay') || 0)));
      const durationDays = Math.max(1, Math.min(120, Number(formData.get('durationDays') || 14)));
      const effortHours = Math.max(1, Math.min(100, Number(formData.get('effortHours') || 12)));
      const description = String(formData.get('description') || '').trim() || 'Ekip tarafından eklenen özel görev.';
      const dependsOn = Array.from(els.ntDeps.selectedOptions).map((opt) => opt.value);

      const existingInIp = store.state.tasks.filter((t) => t.ipNo === ipNo).length;
      const newId = `G-${ipNo}.${existingInIp + 1}`;
      const actorId = store.state.activeMemberId === 'all' ? ownerId : store.state.activeMemberId;

      store.update(
        (draft) => {
          draft.tasks.push({
            id: newId,
            ipNo,
            title,
            description,
            ownerId,
            coOwnerIds: [],
            status: 'yapilacak',
            executionType,
            parallelNote: executionType === 'paralel' ? 'Diğer görevlerle paralel yürütülebilir.' : 'Sıralı görev.',
            dependsOn,
            startDay,
            durationDays,
            effortHours,
            priority: 'normal',
            hypothesis,
            deliverable: 'Ekip içi görev çıktısı',
          });
        },
        {
          actorId,
          type: 'create',
          message: `Yeni görev oluşturuldu ve ${getMember(ownerId).shortName} kişisine atandı: ${newId} (${title}).`,
        },
      );
      els.newTaskDialog.close('created');
      announce(`${newId} görevi oluşturuldu.`);
    });

    els.btnExportPdf.addEventListener('click', () => {
      global.EdgeTrackerPdf.exportTasksReportPdf(store.state, {
        MEMBERS,
        getTaskScheduleInfo,
      });
      announce('Görev özeti PDF dosyası indirildi.');
    });

    function refreshSyncDialogFields(statusText = '') {
      els.syncUrlInput.value = store.cloudUrl || '';
      els.shareLinkOutput.value = store.buildShareUrl();
      if (statusText) els.syncStatusMsg.textContent = statusText;
    }

    els.btnSyncModal.addEventListener('click', () => {
      refreshSyncDialogFields(store.cloudUrl ? 'Canlı bulut bağlantısı aktif.' : 'Henüz bulut adresi bağlı değil.');
      els.syncDialog.showModal();
    });

    els.syncConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawUrl = els.syncUrlInput.value.trim();
      const saved = await store.setCloudSyncUrl(rawUrl);
      if (!saved) {
        refreshSyncDialogFields('Geçerli bir https:// URL girin.');
        return;
      }
      refreshSyncDialogFields('Bağlandı! Aşağıdaki linki arkadaşlarınıza atabilirsiniz.');
      announce('Canlı bulut senkronizasyonu bağlandı.');
    });

    els.btnDisconnectCloud.addEventListener('click', async () => {
      await store.setCloudSyncUrl('');
      refreshSyncDialogFields('Bulut bağlantısı kaldırıldı (yerel mod).');
    });

    els.btnCopyShareLink.addEventListener('click', async () => {
      const link = els.shareLinkOutput.value;
      try {
        await navigator.clipboard.writeText(link);
        els.syncStatusMsg.textContent = 'Link panoya kopyalandı!';
      } catch {
        els.shareLinkOutput.select();
        els.syncStatusMsg.textContent = 'Linki seçip Cmd+C ile kopyalayın.';
      }
    });

    els.btnResetDefault.addEventListener('click', async () => {
      if (window.confirm('Tüm görev durumlarını ve talepleri varsayılan TÜBİTAK 2209-A planına döndürmek istediğinize emin misiniz?')) {
        await store.resetToDefault();
        announce('Plan varsayılan duruma sıfırlandı.');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})(window);
