(function (global) {
  'use strict';

  const A4_W_PX = 1240;
  const A4_H_PX = 1754;
  const A4_W_PT = 595.28;
  const A4_H_PT = 841.89;
  const MARGIN_X = 76;
  const CONTENT_W = A4_W_PX - MARGIN_X * 2;

  function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function buildPdfFromJpegPages(jpegPages, widthPx, heightPx) {
    const encoder = new TextEncoder();
    const chunks = [];
    let byteOffset = 0;
    const objOffsets = [0]; // index 0 unused (free object 0)

    function pushBytes(u8) {
      chunks.push(u8);
      byteOffset += u8.length;
    }

    function pushText(str) {
      pushBytes(encoder.encode(str));
    }

    function beginObj(objNum) {
      objOffsets[objNum] = byteOffset;
      pushText(`${objNum} 0 obj\n`);
    }

    function endObj() {
      pushText('\nendobj\n');
    }

    pushText('%PDF-1.4\n');
    pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    const pageCount = jpegPages.length;
    const pageObjIds = [];
    for (let i = 0; i < pageCount; i += 1) {
      pageObjIds.push(3 + i * 3);
    }

    // 1: Catalog
    beginObj(1);
    pushText('<< /Type /Catalog /Pages 2 0 R >>');
    endObj();

    // 2: Pages
    beginObj(2);
    pushText(`<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);
    endObj();

    for (let i = 0; i < pageCount; i += 1) {
      const pageId = 3 + i * 3;
      const contentId = 4 + i * 3;
      const imgId = 5 + i * 3;
      const jpegBytes = jpegPages[i];

      beginObj(pageId);
      pushText(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W_PT} ${A4_H_PT}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      endObj();

      const streamStr = `q\n${A4_W_PT} 0 0 ${A4_H_PT} 0 0 cm\n/Im0 Do\nQ\n`;
      const streamBytes = encoder.encode(streamStr);
      beginObj(contentId);
      pushText(`<< /Length ${streamBytes.length} >>\nstream\n`);
      pushBytes(streamBytes);
      pushText('\nendstream');
      endObj();

      beginObj(imgId);
      pushText(
        `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
      );
      pushBytes(jpegBytes);
      pushText('\nendstream');
      endObj();
    }

    const totalObjs = 2 + pageCount * 3;
    const xrefOffset = byteOffset;
    pushText(`xref\n0 ${totalObjs + 1}\n`);
    pushText('0000000000 65535 f \n');
    for (let id = 1; id <= totalObjs; id += 1) {
      const offStr = String(objOffsets[id]).padStart(10, '0');
      pushText(`${offStr} 00000 n \n`);
    }

    pushText(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLength);
    let pos = 0;
    for (const c of chunks) {
      merged.set(c, pos);
      pos += c.length;
    }
    return merged;
  }

  function wrapLines(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  function exportTasksReportPdf(state, helpers) {
    const { MEMBERS, getTaskScheduleInfo } = helpers;
    const { getTodayIsoDate, formatShortTurkishDate } = global.EdgeTrackerDates;

    const pages = [];
    let canvas = null;
    let ctx = null;
    let y = 0;

    function startNewPage(isFirstPage) {
      canvas = document.createElement('canvas');
      canvas.width = A4_W_PX;
      canvas.height = A4_H_PX;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, A4_W_PX, A4_H_PX);
      pages.push(canvas);
      y = 76;

      if (isFirstPage) {
        ctx.fillStyle = '#0f766e';
        ctx.fillRect(MARGIN_X, y, CONTENT_W, 8);
        y += 32;

        ctx.fillStyle = '#0f172a';
        ctx.font = '700 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('TÜBİTAK 2209-A — Ekip Görev Özeti', MARGIN_X, y);
        y += 34;

        ctx.fillStyle = '#475569';
        ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('Kesintili Dağıtık Edge Sistemleri (İKÇÜ · Danışman: Doğan Aydın)', MARGIN_X, y);
        y += 30;

        const doneTotal = state.tasks.filter((t) => t.status === 'tamamlandi').length;
        const activeTotal = state.tasks.filter((t) => t.status === 'yapiliyor' || t.status === 'incelemede').length;
        const todoTotal = state.tasks.filter((t) => t.status === 'yapilacak').length;
        const todayStr = formatShortTurkishDate(getTodayIsoDate());

        ctx.fillStyle = '#0f172a';
        ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(
          `Rapor Tarihi: ${todayStr}   |   Toplam: ${state.tasks.length} görev   |   Tamamlanan: ${doneTotal}   |   Yapılıyor: ${activeTotal}   |   Yapılacak: ${todoTotal}`,
          MARGIN_X,
          y,
        );
        y += 26;

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(MARGIN_X, y);
        ctx.lineTo(A4_W_PX - MARGIN_X, y);
        ctx.stroke();
        y += 34;
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = '500 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('TÜBİTAK 2209-A — Ekip Görev Özeti (Devam)', MARGIN_X, y);
        y += 34;
      }
    }

    function ensureSpace(neededPx) {
      if (y + neededPx > A4_H_PX - 80) {
        startNewPage(false);
      }
    }

    startNewPage(true);

    const statusGroups = [
      { key: 'active', label: 'YAPILIYOR / İNCELEMEDE', badge: '[DEVAM]', color: '#0f766e', filter: (t) => t.status === 'yapiliyor' || t.status === 'incelemede' },
      { key: 'todo', label: 'YAPILACAK', badge: '[YAPILACAK]', color: '#b45309', filter: (t) => t.status === 'yapilacak' },
      { key: 'done', label: 'TAMAMLANDI', badge: '[TAMAM]', color: '#15803d', filter: (t) => t.status === 'tamamlandi' },
    ];

    for (const member of MEMBERS) {
      const owned = state.tasks
        .filter((t) => t.ownerId === member.id)
        .slice()
        .sort((a, b) => a.startDay - b.startDay);
      const doneCount = owned.filter((t) => t.status === 'tamamlandi').length;

      ensureSpace(140);

      // Member header box
      ctx.fillStyle = member.bgSoft;
      ctx.fillRect(MARGIN_X, y, CONTENT_W, 52);
      ctx.fillStyle = member.color;
      ctx.fillRect(MARGIN_X, y, 10, 52);

      ctx.fillStyle = '#0f172a';
      ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(member.name, MARGIN_X + 24, y + 34);

      ctx.fillStyle = member.color;
      ctx.font = '700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const summaryTxt = `${doneCount} / ${owned.length} tamamlandı`;
      const summaryW = ctx.measureText(summaryTxt).width;
      ctx.fillText(summaryTxt, A4_W_PX - MARGIN_X - summaryW - 18, y + 33);
      y += 72;

      for (const grp of statusGroups) {
        const items = owned.filter(grp.filter);
        ensureSpace(54);

        ctx.fillStyle = grp.color;
        ctx.font = '700 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(`${grp.label} (${items.length})`, MARGIN_X + 10, y);
        y += 26;

        if (items.length === 0) {
          ctx.fillStyle = '#64748b';
          ctx.font = 'italic 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillText('— Bu başlıkta görev yok.', MARGIN_X + 26, y);
          y += 28;
          continue;
        }

        for (const task of items) {
          const sched = getTaskScheduleInfo(task, state);
          ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const titleLines = wrapLines(ctx, `${task.id}  ${task.title}`, CONTENT_W - 44);
          const blockH = titleLines.length * 24 + 28;
          ensureSpace(blockH + 10);

          ctx.fillStyle = '#0f172a';
          ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          for (const line of titleLines) {
            ctx.fillText(line, MARGIN_X + 24, y);
            y += 24;
          }

          ctx.fillStyle = '#475569';
          ctx.font = '400 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const depText = task.dependsOn && task.dependsOn.length ? `  |  Bağlı: ${task.dependsOn.join(', ')}` : '';
          const execText = task.executionType === 'paralel' ? 'Paralel' : 'Sıralı';
          ctx.fillText(
            `İP ${task.ipNo}  |  ${execText}  |  ${sched.remainingLabel.text}${depText}`,
            MARGIN_X + 24,
            y,
          );
          y += 26;
        }
        y += 8;
      }
      y += 18;
    }

    // Page footers
    pages.forEach((pCanvas, idx) => {
      const pCtx = pCanvas.getContext('2d');
      pCtx.fillStyle = '#94a3b8';
      pCtx.font = '500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      pCtx.fillText(`Sayfa ${idx + 1} / ${pages.length}`, A4_W_PX - MARGIN_X - 90, A4_H_PX - 36);
    });

    const jpegPages = pages.map((c) => dataUrlToUint8Array(c.toDataURL('image/jpeg', 0.92)));
    const pdfBytes = buildPdfFromJpegPages(jpegPages, A4_W_PX, A4_H_PX);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tubitak-2209a-gorev-ozeti-${getTodayIsoDate()}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.EdgeTrackerPdf = {
    exportTasksReportPdf,
    buildPdfFromJpegPages,
  };
})(window);
