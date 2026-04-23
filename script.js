const storageKey = "shift-ledger-v1";

const state = {
  shifts: [],
  settings: {
    defaultRate: 0,
    overtimeAfter: 40,
    overtimeMultiplier: 1.5,
    periodFilter: "month",
    fromDate: "",
    toDate: "",
    payslipAmount: ""
  }
};

const els = {
  form: document.querySelector("#shiftForm"),
  editingId: document.querySelector("#editingId"),
  formTitle: document.querySelector("#formTitle"),
  saveButton: document.querySelector("#saveButton"),
  cancelEdit: document.querySelector("#cancelEdit"),
  shiftDate: document.querySelector("#shiftDate"),
  startTime: document.querySelector("#startTime"),
  endTime: document.querySelector("#endTime"),
  breakMinutes: document.querySelector("#breakMinutes"),
  shiftRate: document.querySelector("#shiftRate"),
  payCategory: document.querySelector("#payCategory"),
  categoryMultiplier: document.querySelector("#categoryMultiplier"),
  holidayPay: document.querySelector("#holidayPay"),
  sickPay: document.querySelector("#sickPay"),
  shiftNotes: document.querySelector("#shiftNotes"),
  defaultRate: document.querySelector("#defaultRate"),
  overtimeAfter: document.querySelector("#overtimeAfter"),
  overtimeMultiplier: document.querySelector("#overtimeMultiplier"),
  periodFilter: document.querySelector("#periodFilter"),
  fromDate: document.querySelector("#fromDate"),
  toDate: document.querySelector("#toDate"),
  payslipAmount: document.querySelector("#payslipAmount"),
  expectedPay: document.querySelector("#expectedPay"),
  totalHours: document.querySelector("#totalHours"),
  breakHours: document.querySelector("#breakHours"),
  overtimeHours: document.querySelector("#overtimeHours"),
  restDayHours: document.querySelector("#restDayHours"),
  sundayHours: document.querySelector("#sundayHours"),
  leavePay: document.querySelector("#leavePay"),
  shiftCount: document.querySelector("#shiftCount"),
  differenceBox: document.querySelector("#differenceBox"),
  differenceAmount: document.querySelector("#differenceAmount"),
  differenceMessage: document.querySelector("#differenceMessage"),
  shiftTable: document.querySelector("#shiftTable"),
  emptyState: document.querySelector("#emptyState"),
  exportCsv: document.querySelector("#exportCsv"),
  resetData: document.querySelector("#resetData"),
  customRanges: document.querySelectorAll(".custom-range")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    state.shifts = Array.isArray(parsed.shifts) ? parsed.shifts : [];
    state.settings = { ...state.settings, ...(parsed.settings || {}) };
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function money(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP"
  }).format(value || 0);
}

function niceDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function todayIso() {
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function dateOnly(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function minutesSinceMidnight(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function shiftMinutes(shift) {
  const start = minutesSinceMidnight(shift.start);
  let end = minutesSinceMidnight(shift.end);
  if (end <= start) end += 24 * 60;
  return Math.max(0, end - start - Number(shift.breakMinutes || 0));
}

function shiftHours(shift) {
  return shiftMinutes(shift) / 60;
}

function payCategoryLabel(value) {
  if (value === "restDay") return "Rest day";
  if (value === "sunday") return "Sunday";
  return "Normal";
}

function shiftAdditions(shift) {
  return Number(shift.holidayPay || 0) + Number(shift.sickPay || 0);
}

function getPeriodBounds() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (state.settings.periodFilter === "week") {
    const day = today.getDay() || 7;
    const start = new Date(today);
    start.setDate(today.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  if (state.settings.periodFilter === "month") {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      end: new Date(today.getFullYear(), today.getMonth() + 1, 0)
    };
  }

  if (state.settings.periodFilter === "custom") {
    return {
      start: state.settings.fromDate ? dateOnly(state.settings.fromDate) : null,
      end: state.settings.toDate ? dateOnly(state.settings.toDate) : null
    };
  }

  return { start: null, end: null };
}

function visibleShifts() {
  const { start, end } = getPeriodBounds();
  return state.shifts
    .filter((shift) => {
      const date = dateOnly(shift.date);
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    })
    .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`));
}

function calculateTotals(shifts) {
  const defaultRate = Number(state.settings.defaultRate || 0);
  const overtimeAfter = Number(state.settings.overtimeAfter || 0);
  const overtimeMultiplier = Number(state.settings.overtimeMultiplier || 1);
  let regularHoursRemaining = overtimeAfter > 0 ? overtimeAfter : Infinity;
  let totalHours = 0;
  let breakHours = 0;
  let overtimeHours = 0;
  let restDayHours = 0;
  let sundayHours = 0;
  let leavePay = 0;
  let expectedPay = 0;

  [...shifts].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)).forEach((shift) => {
    const hours = shiftHours(shift);
    const rate = Number(shift.rate || defaultRate);
    const payCategory = shift.payCategory || "normal";
    const categoryMultiplier = Number(shift.categoryMultiplier || 1);
    const isPremiumCategory = payCategory === "restDay" || payCategory === "sunday";
    const regularHours = isPremiumCategory ? 0 : Math.min(hours, regularHoursRemaining);
    const shiftOvertime = isPremiumCategory ? 0 : Math.max(0, hours - regularHours);
    const premiumPay = isPremiumCategory ? hours * rate * categoryMultiplier : 0;

    totalHours += hours;
    breakHours += Number(shift.breakMinutes || 0) / 60;
    overtimeHours += shiftOvertime;
    restDayHours += payCategory === "restDay" ? hours : 0;
    sundayHours += payCategory === "sunday" ? hours : 0;
    leavePay += shiftAdditions(shift);
    expectedPay += regularHours * rate + shiftOvertime * rate * overtimeMultiplier + premiumPay + shiftAdditions(shift);
    if (!isPremiumCategory) regularHoursRemaining = Math.max(0, regularHoursRemaining - regularHours);
  });

  return { totalHours, breakHours, overtimeHours, restDayHours, sundayHours, leavePay, expectedPay };
}

function shiftPayForDisplay(shift, previousHours) {
  const rate = Number(shift.rate || state.settings.defaultRate || 0);
  const hours = shiftHours(shift);
  const overtimeAfter = Number(state.settings.overtimeAfter || 0);
  const multiplier = Number(state.settings.overtimeMultiplier || 1);
  const payCategory = shift.payCategory || "normal";

  if (payCategory === "restDay" || payCategory === "sunday") {
    return hours * rate * Number(shift.categoryMultiplier || 1) + shiftAdditions(shift);
  }

  if (!overtimeAfter) return hours * rate + shiftAdditions(shift);

  const regularHours = Math.max(0, Math.min(hours, overtimeAfter - previousHours));
  const overtime = Math.max(0, hours - regularHours);
  return regularHours * rate + overtime * rate * multiplier + shiftAdditions(shift);
}

function syncSettingsFields() {
  els.defaultRate.value = state.settings.defaultRate;
  els.overtimeAfter.value = state.settings.overtimeAfter;
  els.overtimeMultiplier.value = state.settings.overtimeMultiplier;
  els.periodFilter.value = state.settings.periodFilter;
  els.fromDate.value = state.settings.fromDate;
  els.toDate.value = state.settings.toDate;
  els.payslipAmount.value = state.settings.payslipAmount;
  els.customRanges.forEach((item) => item.classList.toggle("hidden", state.settings.periodFilter !== "custom"));
}

function renderSummary(shifts) {
  const totals = calculateTotals(shifts);
  els.expectedPay.textContent = money(totals.expectedPay);
  els.totalHours.textContent = totals.totalHours.toFixed(2);
  els.breakHours.textContent = totals.breakHours.toFixed(2);
  els.overtimeHours.textContent = totals.overtimeHours.toFixed(2);
  els.restDayHours.textContent = totals.restDayHours.toFixed(2);
  els.sundayHours.textContent = totals.sundayHours.toFixed(2);
  els.leavePay.textContent = money(totals.leavePay);
  els.shiftCount.textContent = String(shifts.length);

  const payslipAmount = Number(state.settings.payslipAmount);
  els.differenceBox.className = "difference";

  if (!state.settings.payslipAmount) {
    els.differenceAmount.textContent = money(0);
    els.differenceMessage.textContent = "Enter the gross pay from your payslip to compare it with your logged shifts.";
    return;
  }

  const difference = payslipAmount - totals.expectedPay;
  els.differenceAmount.textContent = money(difference);

  if (Math.abs(difference) < 0.01) {
    els.differenceBox.classList.add("ok");
    els.differenceMessage.textContent = "Your payslip matches the shifts in this period.";
  } else if (difference > 0) {
    els.differenceBox.classList.add("warn");
    els.differenceMessage.textContent = `Payslip is ${money(difference)} higher than your records. Check bonuses, holiday pay, or tax-period adjustments.`;
  } else {
    els.differenceBox.classList.add("bad");
    els.differenceMessage.textContent = `Payslip is ${money(Math.abs(difference))} lower than your records. This is worth checking with payroll.`;
  }
}

function renderTable(shifts) {
  els.shiftTable.innerHTML = "";
  els.emptyState.classList.toggle("hidden", shifts.length > 0);

  const chronological = [...shifts].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const previousHoursById = new Map();
  let runningHours = 0;
  chronological.forEach((shift) => {
    previousHoursById.set(shift.id, runningHours);
    if ((shift.payCategory || "normal") === "normal") runningHours += shiftHours(shift);
  });

  shifts.forEach((shift) => {
    const row = document.createElement("tr");
    const rate = Number(shift.rate || state.settings.defaultRate || 0);
    const hours = shiftHours(shift);
    const pay = shiftPayForDisplay(shift, previousHoursById.get(shift.id) || 0);
    const multiplier = shift.payCategory === "restDay" || shift.payCategory === "sunday"
      ? Number(shift.categoryMultiplier || 1).toFixed(2)
      : "Auto";

    row.innerHTML = `
      <td>${niceDate(shift.date)}</td>
      <td>${shift.start} - ${shift.end}</td>
      <td>${Number(shift.breakMinutes || 0)} min</td>
      <td>${hours.toFixed(2)}</td>
      <td>${payCategoryLabel(shift.payCategory)}</td>
      <td>${multiplier}</td>
      <td>${money(rate)}</td>
      <td>${money(Number(shift.holidayPay || 0))}</td>
      <td>${money(Number(shift.sickPay || 0))}</td>
      <td>${money(pay)}</td>
      <td>${escapeHtml(shift.notes || "")}</td>
      <td>
        <div class="row-actions">
          <button class="small-button" type="button" data-action="edit" data-id="${shift.id}">Edit</button>
          <button class="small-button delete" type="button" data-action="delete" data-id="${shift.id}">Delete</button>
        </div>
      </td>
    `;

    els.shiftTable.appendChild(row);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  syncSettingsFields();
  const shifts = visibleShifts();
  renderSummary(shifts);
  renderTable(shifts);
}

function resetForm() {
  els.form.reset();
  els.editingId.value = "";
  els.shiftDate.value = todayIso();
  els.breakMinutes.value = "30";
  els.payCategory.value = "normal";
  els.categoryMultiplier.value = "1";
  els.holidayPay.value = "0";
  els.sickPay.value = "0";
  els.formTitle.textContent = "Add shift";
  els.saveButton.textContent = "Add shift";
  els.cancelEdit.classList.add("hidden");
}

function handleFormSubmit(event) {
  event.preventDefault();

  const shift = {
    id: els.editingId.value || crypto.randomUUID(),
    date: els.shiftDate.value,
    start: els.startTime.value,
    end: els.endTime.value,
    breakMinutes: Number(els.breakMinutes.value || 0),
    rate: els.shiftRate.value ? Number(els.shiftRate.value) : "",
    payCategory: els.payCategory.value,
    categoryMultiplier: Number(els.categoryMultiplier.value || 1),
    holidayPay: Number(els.holidayPay.value || 0),
    sickPay: Number(els.sickPay.value || 0),
    notes: els.shiftNotes.value.trim()
  };

  if (shift.breakMinutes >= shiftMinutes({ ...shift, breakMinutes: 0 })) {
    alert("The unpaid break cannot be longer than the shift.");
    return;
  }

  const existingIndex = state.shifts.findIndex((item) => item.id === shift.id);
  if (existingIndex >= 0) {
    state.shifts[existingIndex] = shift;
  } else {
    state.shifts.push(shift);
  }

  saveState();
  resetForm();
  render();
}

function editShift(id) {
  const shift = state.shifts.find((item) => item.id === id);
  if (!shift) return;

  els.editingId.value = shift.id;
  els.shiftDate.value = shift.date;
  els.startTime.value = shift.start;
  els.endTime.value = shift.end;
  els.breakMinutes.value = shift.breakMinutes;
  els.shiftRate.value = shift.rate;
  els.payCategory.value = shift.payCategory || "normal";
  els.categoryMultiplier.value = shift.categoryMultiplier || 1;
  els.holidayPay.value = shift.holidayPay || 0;
  els.sickPay.value = shift.sickPay || 0;
  els.shiftNotes.value = shift.notes || "";
  els.formTitle.textContent = "Edit shift";
  els.saveButton.textContent = "Save changes";
  els.cancelEdit.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteShift(id) {
  const shift = state.shifts.find((item) => item.id === id);
  if (!shift) return;

  const ok = confirm(`Delete the shift on ${niceDate(shift.date)}?`);
  if (!ok) return;

  state.shifts = state.shifts.filter((item) => item.id !== id);
  saveState();
  render();
}

function updateSetting(event) {
  const { id, value } = event.target;
  state.settings[id] = value;
  saveState();
  render();
}

function exportCsv() {
  const shifts = visibleShifts();
  const rows = [
    ["Date", "Start 24-hour", "Finish 24-hour", "Unpaid break minutes", "Paid hours", "Pay category", "Category multiplier", "Rate", "Paid holiday", "Sick pay", "Expected pay", "Notes"]
  ];

  const chronological = [...shifts].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  let previousHours = 0;
  chronological.forEach((shift) => {
    const pay = shiftPayForDisplay(shift, previousHours);
    rows.push([
      shift.date,
      shift.start,
      shift.end,
      shift.breakMinutes,
      shiftHours(shift).toFixed(2),
      payCategoryLabel(shift.payCategory),
      shift.payCategory === "restDay" || shift.payCategory === "sunday" ? Number(shift.categoryMultiplier || 1).toFixed(2) : "Auto",
      Number(shift.rate || state.settings.defaultRate || 0).toFixed(2),
      Number(shift.holidayPay || 0).toFixed(2),
      Number(shift.sickPay || 0).toFixed(2),
      pay.toFixed(2),
      shift.notes || ""
    ]);
    if ((shift.payCategory || "normal") === "normal") previousHours += shiftHours(shift);
  });

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "shift-ledger.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function resetData() {
  const ok = confirm("Clear all shifts and pay settings?");
  if (!ok) return;
  localStorage.removeItem(storageKey);
  state.shifts = [];
  state.settings = {
    defaultRate: 0,
    overtimeAfter: 40,
    overtimeMultiplier: 1.5,
    periodFilter: "month",
    fromDate: "",
    toDate: "",
    payslipAmount: ""
  };
  resetForm();
  render();
}

function bindEvents() {
  els.form.addEventListener("submit", handleFormSubmit);
  els.cancelEdit.addEventListener("click", resetForm);
  els.exportCsv.addEventListener("click", exportCsv);
  els.resetData.addEventListener("click", resetData);

  [els.defaultRate, els.overtimeAfter, els.overtimeMultiplier, els.periodFilter, els.fromDate, els.toDate, els.payslipAmount]
    .forEach((input) => input.addEventListener("input", updateSetting));

  els.shiftTable.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit") editShift(button.dataset.id);
    if (button.dataset.action === "delete") deleteShift(button.dataset.id);
  });
}

loadState();
bindEvents();
resetForm();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // The app still works without offline caching, for example when opened as a local file.
    });
  });
}
