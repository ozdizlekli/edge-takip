(function (global) {
  'use strict';

  const MS_PER_DAY = 86_400_000;

  function parseIsoDateParts(isoDateStr) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDateStr || '').trim());
    if (!match) return { year: 2026, month: 11, day: 24 };
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  function getTodayIsoDate() {
    if (typeof Temporal !== 'undefined') {
      return Temporal.Now.plainDateISO().toString();
    }
    const now = new Date();
    const y = String(now.getFullYear()).padStart(4, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function addDaysToIsoDate(isoDateStr, offsetDays) {
    if (typeof Temporal !== 'undefined') {
      return Temporal.PlainDate.from(isoDateStr).add({ days: offsetDays }).toString();
    }
    const { year, month, day } = parseIsoDateParts(isoDateStr);
    const utc = Date.UTC(year, month - 1, day + offsetDays);
    const dt = new Date(utc);
    const y = String(dt.getUTCFullYear()).padStart(4, '0');
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function diffDays(fromIsoStr, toIsoStr) {
    if (typeof Temporal !== 'undefined') {
      const start = Temporal.PlainDate.from(fromIsoStr);
      const end = Temporal.PlainDate.from(toIsoStr);
      return start.until(end, { largestUnit: 'day' }).days;
    }
    const a = parseIsoDateParts(fromIsoStr);
    const b = parseIsoDateParts(toIsoStr);
    const utcA = Date.UTC(a.year, a.month - 1, a.day);
    const utcB = Date.UTC(b.year, b.month - 1, b.day);
    return Math.round((utcB - utcA) / MS_PER_DAY);
  }

  function formatShortTurkishDate(isoDateStr) {
    const { year, month, day } = parseIsoDateParts(isoDateStr);
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(utcDate);
  }

  function formatTimestampTurkish(isoTimestamp) {
    try {
      const dt = new Date(isoTimestamp);
      return new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(dt);
    } catch {
      return isoTimestamp || '';
    }
  }

  function formatRemainingDaysLabel(daysLeft, status) {
    if (status === 'tamamlandi') {
      return { text: 'Tamamlandı', tone: 'done' };
    }
    if (daysLeft < 0) {
      return { text: `${Math.abs(daysLeft)} gün gecikti`, tone: 'overdue' };
    }
    if (daysLeft === 0) {
      return { text: 'Son gün (Bugün)', tone: 'urgent' };
    }
    if (daysLeft <= 7) {
      return { text: `${daysLeft} gün kaldı`, tone: 'urgent' };
    }
    if (typeof Temporal !== 'undefined' && typeof Intl.DurationFormat !== 'undefined' && daysLeft >= 30) {
      const dur = Temporal.Duration.from({ days: daysLeft }).round({
        largestUnit: 'month',
        relativeTo: Temporal.Now.plainDateISO(),
      });
      const formatted = new Intl.DurationFormat('tr-TR', { style: 'short' }).format({
        months: dur.months,
        days: dur.days,
      });
      return { text: `${formatted} kaldı`, tone: 'normal' };
    }
    return { text: `${daysLeft} gün kaldı`, tone: 'normal' };
  }

  global.EdgeTrackerDates = {
    getTodayIsoDate,
    addDaysToIsoDate,
    diffDays,
    formatShortTurkishDate,
    formatTimestampTurkish,
    formatRemainingDaysLabel,
  };
})(window);
