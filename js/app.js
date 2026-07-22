// State Management
//
// IMPORTANT: All dates in this app are handled as local calendar dates,
// never via `new Date(dateString)` (which parses as UTC) mixed with local
// methods (getDay/setDate) — that combination shifts dates by a day for
// visitors in timezones behind UTC. Everything goes through parseLocalDate
// / formatLocalDate below to stay consistent regardless of the viewer's
// timezone (this site is public on GitHub Pages).

function parseLocalDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function formatLocalDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function getMondayOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay(); // 0 = Sun, 1 = Mon, ...
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
}

let currentMonday = getMondayOf(parseLocalDate("2026-08-17")); // Default: Term 1 start date

document.addEventListener("DOMContentLoaded", () => {
    initFilters();
    renderGrid();
    setupEventListeners();
    updateJumpButtonLabel();
    initEmptySlotView();
});

function initFilters() {
    const semNumberSelect = document.getElementById("semNumberFilter");

    // Extract Unique Semester Numbers (for the sub-filter, only relevant to Semester courses)
    const semNumbers = [...new Set(RAW_TIMETABLE_DATA.map(d => d.semesterNumber))]
        .filter(Boolean)
        .sort((a, b) => Number(a) - Number(b));
    semNumbers.forEach(num => {
        const opt = document.createElement("option");
        opt.value = num;
        opt.textContent = `Semester ${num}`;
        semNumberSelect.appendChild(opt);
    });

    // Course and Faculty options are cross-linked to every other active
    // filter (see refreshFacultyOptions / refreshCourseOptions below):
    // picking a course narrows Faculty to only the people teaching it,
    // picking a faculty member narrows Course to only what they teach,
    // and picking a Course Type / Semester / Faculty Type narrows both —
    // e.g. selecting "Semester 5" leaves only Sem-5 courses and the
    // faculty who teach in Sem-5 selectable. All start unfiltered ("all").
    refreshFacultyOptions();
    refreshCourseOptions();
}

// Reads the current value of every filter control.
function getCurrentFilterValues() {
    return {
        courseType: document.getElementById("courseTypeFilter").value,
        semNumber: document.getElementById("semNumberFilter").value,
        course: document.getElementById("courseFilter").value,
        faculty: document.getElementById("facultyFilter").value,
        facultyStatus: document.getElementById("facultyStatusFilter").value,
    };
}

// Whether a course-section matches the given filter values, ignoring any
// filter keys listed in `skip` (used when computing a dropdown's own
// options — a filter shouldn't narrow itself out).
function itemMatchesFilters(item, filters, skip = []) {
    if (!skip.includes("courseType") && filters.courseType !== "all" && item.courseType !== filters.courseType) return false;
    if (!skip.includes("semNumber") && filters.semNumber !== "all" && item.semesterNumber !== filters.semNumber) return false;
    if (!skip.includes("course") && filters.course !== "all" && item.code !== filters.course) return false;
    if (!skip.includes("faculty") && filters.faculty !== "all" && item.faculty !== filters.faculty) return false;
    if (!skip.includes("facultyStatus") && filters.facultyStatus !== "all" && item.facultyStatus !== filters.facultyStatus) return false;
    return true;
}

// Repopulates a <select>'s options, preserving the current selection if it's
// still among the new options, otherwise resetting to "all".
function populateSelect(selectEl, entries, allLabel) {
    const currentValue = selectEl.value;
    selectEl.innerHTML = "";

    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = allLabel;
    selectEl.appendChild(allOpt);

    entries.forEach(entry => {
        const opt = document.createElement("option");
        if (Array.isArray(entry)) {
            const [code, title] = entry;
            opt.value = code;
            opt.textContent = `${code} — ${title}`;
        } else {
            opt.value = entry;
            opt.textContent = entry;
        }
        selectEl.appendChild(opt);
    });

    const stillValid = [...selectEl.options].some(o => o.value === currentValue);
    selectEl.value = stillValid ? currentValue : "all";
}

function refreshFacultyOptions() {
    const filters = getCurrentFilterValues();
    const items = RAW_TIMETABLE_DATA.filter(d => itemMatchesFilters(d, filters, ["faculty"]));
    const faculty = [...new Set(items.map(d => d.faculty))].filter(Boolean).sort();
    populateSelect(document.getElementById("facultyFilter"), faculty, "All Faculty");
}

function refreshCourseOptions() {
    const filters = getCurrentFilterValues();
    const items = RAW_TIMETABLE_DATA.filter(d => itemMatchesFilters(d, filters, ["course"]));
    const courseMap = new Map();
    items.forEach(d => {
        if (!courseMap.has(d.code)) courseMap.set(d.code, d.title);
    });
    const courses = [...courseMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    populateSelect(document.getElementById("courseFilter"), courses, "All Courses");
}

// Decide what the "Jump to..." button should do based on today's real date
// relative to the term boundaries in TERMS:
//   - before Term 1 starts        -> "Jump to Term Start" (Term 1)
//   - inside Term 1 or Term 2     -> "Jump to Current Week" (today)
//   - in the gap between terms    -> "Jump to Term 2 Start"
//   - after Term 2 ends           -> "Jump to Term Start" (reset to Term 1)
function getJumpTarget() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const terms = (typeof TERMS !== "undefined" ? TERMS : []).map(t => ({
        name: t.name,
        start: parseLocalDate(t.startDate),
        end: parseLocalDate(t.endDate),
    }));

    if (terms.length === 0) {
        return { label: "Jump to Term Start", date: parseLocalDate("2026-08-17") };
    }

    const firstTerm = terms[0];
    const lastTerm = terms[terms.length - 1];

    if (today < firstTerm.start) {
        return { label: `Jump to ${firstTerm.name} Start`, date: firstTerm.start };
    }

    for (let i = 0; i < terms.length; i++) {
        const term = terms[i];
        if (today >= term.start && today <= term.end) {
            return { label: "Jump to Current Week", date: today };
        }
        const nextTerm = terms[i + 1];
        if (nextTerm && today > term.end && today < nextTerm.start) {
            return { label: `Jump to ${nextTerm.name} Start`, date: nextTerm.start };
        }
    }

    // After the last term has ended
    return { label: `Jump to ${firstTerm.name} Start`, date: firstTerm.start };
}

function updateJumpButtonLabel() {
    const btn = document.getElementById("jumpToTodayBtn");
    btn.textContent = getJumpTarget().label;
}

function setupEventListeners() {
    document.getElementById("prevWeekBtn").addEventListener("click", () => changeWeek(-7));
    document.getElementById("nextWeekBtn").addEventListener("click", () => changeWeek(7));
    document.getElementById("jumpToTodayBtn").addEventListener("click", () => {
        currentMonday = getMondayOf(getJumpTarget().date);
        renderGrid();
    });

    // Filter Change Listeners
    document.getElementById("facultyFilter").addEventListener("change", () => {
        refreshCourseOptions();
        renderGrid();
    });
    document.getElementById("courseFilter").addEventListener("change", () => {
        refreshFacultyOptions();
        renderGrid();
    });
    document.getElementById("courseTypeFilter").addEventListener("change", () => {
        updateSemNumberFilterState();
        refreshFacultyOptions();
        refreshCourseOptions();
        renderGrid();
    });
    document.getElementById("semNumberFilter").addEventListener("change", () => {
        refreshFacultyOptions();
        refreshCourseOptions();
        renderGrid();
    });
    document.getElementById("facultyStatusFilter").addEventListener("change", () => {
        refreshFacultyOptions();
        refreshCourseOptions();
        renderGrid();
    });

    document.getElementById("resetFiltersBtn").addEventListener("click", resetFilters);
}

// Clears every filter back to its default ("all") state and re-renders.
function resetFilters() {
    document.getElementById("courseTypeFilter").value = "all";
    document.getElementById("semNumberFilter").value = "all";
    document.getElementById("semNumberFilter").disabled = false;
    document.getElementById("facultyFilter").value = "all";
    document.getElementById("courseFilter").value = "all";
    document.getElementById("facultyStatusFilter").value = "all";
    refreshFacultyOptions();
    refreshCourseOptions();
    renderGrid();
}

// The "Semester Number" sub-filter only makes sense when Course Type is
// "Semester" (or "All"). Disable + reset it when "Term" is selected.
function updateSemNumberFilterState() {
    const courseType = document.getElementById("courseTypeFilter").value;
    const semNumberSelect = document.getElementById("semNumberFilter");
    if (courseType === "term") {
        semNumberSelect.value = "all";
        semNumberSelect.disabled = true;
    } else {
        semNumberSelect.disabled = false;
    }
}

function changeWeek(days) {
    currentMonday.setDate(currentMonday.getDate() + days);
    renderGrid();
}

function getHolidayForDate(dateStr) {
    return (typeof HOLIDAYS !== "undefined" ? HOLIDAYS : []).find(h => h.date === dateStr);
}

function renderGrid() {
    updateHeaderDates();
    clearGrid();

    // Get Filter Values
    const selectedFaculty = document.getElementById("facultyFilter").value;
    const selectedCourse = document.getElementById("courseFilter").value;
    const selectedCourseType = document.getElementById("courseTypeFilter").value;
    const selectedSemNumber = document.getElementById("semNumberFilter").value;
    const selectedStatus = document.getElementById("facultyStatusFilter").value;

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

    // Figure out which weekdays in the current week are holidays
    const holidayByDay = {};
    days.forEach((day, idx) => {
        const d = new Date(currentMonday);
        d.setDate(d.getDate() + idx);
        const holiday = getHolidayForDate(formatLocalDate(d));
        if (holiday) holidayByDay[day] = holiday;
    });

    // Mark holiday columns for this week
    days.forEach(day => {
        document.querySelectorAll(`td.day-cell[data-day="${day}"]`).forEach(cell => {
            cell.classList.toggle("holiday-cell", Boolean(holidayByDay[day]));
        });
    });

    const currentFriday = new Date(currentMonday);
    currentFriday.setDate(currentFriday.getDate() + 4);

    // Each RAW_TIMETABLE_DATA entry is one course-section; its `sessions`
    // array lists every weekday it meets (each with its own time slots,
    // since a section can meet at different times on different days).
    RAW_TIMETABLE_DATA.forEach(item => {
        // Apply Dropdown Filters (these apply to the whole course-section)
        if (selectedFaculty !== "all" && item.faculty !== selectedFaculty) return;
        if (selectedCourse !== "all" && item.code !== selectedCourse) return;
        if (selectedCourseType !== "all" && item.courseType !== selectedCourseType) return;
        if (selectedSemNumber !== "all" && item.semesterNumber !== selectedSemNumber) return;
        if (selectedStatus !== "all" && item.facultyStatus !== selectedStatus) return;

        // Date check: Does the current week overlap the course's active date range?
        const itemStart = parseLocalDate(item.startDate);
        const itemEnd = parseLocalDate(item.endDate);
        if (currentFriday < itemStart || currentMonday > itemEnd) return;

        item.sessions.forEach(session => {
            // Skip if this weekday is a holiday this week
            if (holidayByDay[session.day]) return;

            session.timeSlots.forEach(timeSlot => {
                const cell = document.querySelector(`tr[data-time="${timeSlot}"] td[data-day="${session.day}"]`);
                if (cell) {
                    const card = document.createElement("div");
                    card.className = `course-card ${item.courseType}`;

                    const sectionBadge = item.sectionLabel
                        ? `<span class="badge badge-section">Sec ${item.sectionLabel}</span>`
                        : "";

                    card.innerHTML = `
                        <div class="code">${item.code} ${sectionBadge}</div>
                        <div class="title">${item.title}</div>
                        <div class="details">👤 ${item.faculty}</div>
                    `;
                    cell.appendChild(card);
                }
            });
        });
    });

    // Show a single holiday note at the top of each holiday column (first time row only)
    Object.entries(holidayByDay).forEach(([day, holiday]) => {
        const firstCell = document.querySelector(`tr[data-time="08:00"] td.day-cell[data-day="${day}"]`);
        if (firstCell) {
            const note = document.createElement("div");
            note.className = "holiday-note";
            note.textContent = `Holiday: ${holiday.name}`;
            firstCell.appendChild(note);
        }
    });
}

function updateHeaderDates() {
    const friday = new Date(currentMonday);
    friday.setDate(friday.getDate() + 4);

    const formatDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    document.getElementById("currentWeekDisplay").textContent =
        `Week of ${formatDate(currentMonday)} – ${formatDate(friday)}, 2026`;

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    days.forEach((day, idx) => {
        const d = new Date(currentMonday);
        d.setDate(d.getDate() + idx);
        const th = document.getElementById(`th-${day}`);
        if (th) {
            th.textContent = `${day} (${d.getDate()}/${d.getMonth() + 1})`;
        }
    });
}

function clearGrid() {
    document.querySelectorAll(".day-cell").forEach(cell => {
        cell.innerHTML = "";
        cell.classList.remove("holiday-cell");
    });
}

// ============================================================
// Find Empty Slot view
//
// Separate from the main weekly timetable: given a date range, an optional
// Saturday toggle, and a set of selected faculty, finds day/time slots
// where NONE of the selected faculty have a class ("empty" = free for
// everyone selected simultaneously). A slot counts as empty if it's free
// in at least one week within the range (not necessarily every week).
// ============================================================

const GRID_SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:15", "15:15", "16:15", "17:15"];
const SLOT_LABELS = {
    "08:00": "08:00 - 08:55",
    "09:00": "09:00 - 09:55",
    "10:00": "10:00 - 10:55",
    "11:00": "11:00 - 11:55",
    "12:00": "12:00 - 12:55",
    "13:00": "13:00 - 13:55",
    "14:15": "14:15 - 15:10",
    "15:15": "15:15 - 16:10",
    "16:15": "16:15 - 17:10",
    "17:15": "17:15 - 18:10",
};
const DAY_LABELS = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };

function switchView(view) {
    const showTimetable = view === "timetable";

    document.getElementById("timetableControls").style.display = showTimetable ? "" : "none";
    document.getElementById("timetableGridSection").style.display = showTimetable ? "" : "none";
    document.getElementById("emptySlotControls").style.display = showTimetable ? "none" : "";
    document.getElementById("emptySlotGridSection").style.display = showTimetable ? "none" : "";

    document.getElementById("viewToggleTimetable").classList.toggle("active", showTimetable);
    document.getElementById("viewToggleEmptySlot").classList.toggle("active", !showTimetable);
}

// Flame convention: the 1st and 3rd Saturday of each month are off.
function isWorkingSaturday(date) {
    const weekOfMonth = Math.ceil(date.getDate() / 7);
    return weekOfMonth !== 1 && weekOfMonth !== 3;
}

function initEmptySlotView() {
    const terms = typeof TERMS !== "undefined" ? TERMS : [];
    if (terms.length > 0) {
        document.getElementById("emptyStartDate").value = terms[0].startDate;
        document.getElementById("emptyEndDate").value = terms[terms.length - 1].endDate;
    }

    const faculty = [...new Set(RAW_TIMETABLE_DATA.map(d => d.faculty))].filter(Boolean).sort();
    const container = document.getElementById("facultyMultiSelect");
    faculty.forEach(name => {
        const sample = RAW_TIMETABLE_DATA.find(d => d.faculty === name);
        const label = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = name;
        cb.className = "faculty-checkbox";
        cb.dataset.status = sample ? sample.facultyStatus : "";
        label.appendChild(cb);
        label.appendChild(document.createTextNode(name));
        container.appendChild(label);
    });

    document.getElementById("selectAllFacultyBtn").addEventListener("click", () => {
        container.querySelectorAll(".faculty-checkbox").forEach(cb => (cb.checked = true));
    });
    document.getElementById("clearFacultyBtn").addEventListener("click", () => {
        container.querySelectorAll(".faculty-checkbox").forEach(cb => (cb.checked = false));
    });
    document.getElementById("selectRegularFacultyBtn").addEventListener("click", () => {
        container.querySelectorAll(".faculty-checkbox").forEach(cb => (cb.checked = cb.dataset.status === "regular"));
    });
    document.getElementById("selectVisitingFacultyBtn").addEventListener("click", () => {
        container.querySelectorAll(".faculty-checkbox").forEach(cb => (cb.checked = cb.dataset.status === "visiting"));
    });

    document.getElementById("findEmptySlotsBtn").addEventListener("click", runEmptySlotSearch);
    document.getElementById("viewToggleTimetable").addEventListener("click", () => switchView("timetable"));
    document.getElementById("viewToggleEmptySlot").addEventListener("click", () => switchView("emptySlot"));

    // Render an initial blank grid so the view isn't empty before a search runs.
    renderEmptySlotGrid(null, false);
}

function showEmptySlotMessage(text) {
    const el = document.getElementById("emptySlotMessage");
    if (!text) {
        el.style.display = "none";
        el.textContent = "";
        return;
    }
    el.textContent = text;
    el.style.display = "block";
}

function runEmptySlotSearch() {
    const startVal = document.getElementById("emptyStartDate").value;
    const endVal = document.getElementById("emptyEndDate").value;
    const includeSaturday = document.getElementById("includeSaturdayCheckbox").checked;
    const selectedFaculty = [...document.querySelectorAll(".faculty-checkbox:checked")].map(cb => cb.value);

    if (!startVal || !endVal) {
        showEmptySlotMessage("Pick a start and end date.");
        renderEmptySlotGrid(null, includeSaturday);
        return;
    }
    if (selectedFaculty.length === 0) {
        showEmptySlotMessage("Select at least one faculty member.");
        renderEmptySlotGrid(null, includeSaturday);
        return;
    }

    const rangeStart = parseLocalDate(startVal);
    const rangeEnd = parseLocalDate(endVal);
    if (rangeEnd < rangeStart) {
        showEmptySlotMessage("The end date is before the start date.");
        renderEmptySlotGrid(null, includeSaturday);
        return;
    }

    const days = includeSaturday ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const dayOffsets = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 };

    // Precompute every busy [start,end] date range for the selected faculty,
    // keyed by day + slot.
    const busy = {};
    days.forEach(d => {
        busy[d] = {};
        GRID_SLOTS.forEach(s => (busy[d][s] = []));
    });
    RAW_TIMETABLE_DATA.forEach(item => {
        if (!selectedFaculty.includes(item.faculty)) return;
        const itemStart = parseLocalDate(item.startDate);
        const itemEnd = parseLocalDate(item.endDate);
        item.sessions.forEach(session => {
            if (!days.includes(session.day)) return;
            session.timeSlots.forEach(slot => {
                busy[session.day][slot].push({ start: itemStart, end: itemEnd });
            });
        });
    });

    // empty[day][slot] === true  -> free in at least one valid week (highlighted)
    // empty[day][slot] === false -> checked, but always busy in every valid week
    // empty[day][slot] === null  -> no valid week to check at all (e.g. an
    //                                all-1st/3rd-Saturday range), shown as N/A
    const empty = {};
    const anyValidWeek = {};
    days.forEach(d => {
        empty[d] = {};
        anyValidWeek[d] = {};
        GRID_SLOTS.forEach(s => {
            empty[d][s] = false;
            anyValidWeek[d][s] = false;
        });
    });

    let weekMonday = getMondayOf(rangeStart);
    while (weekMonday <= rangeEnd) {
        days.forEach(day => {
            const dayDate = new Date(weekMonday);
            dayDate.setDate(dayDate.getDate() + dayOffsets[day]);
            if (dayDate < rangeStart || dayDate > rangeEnd) return;
            if (getHolidayForDate(formatLocalDate(dayDate))) return;
            if (day === "Sat" && !isWorkingSaturday(dayDate)) return;

            GRID_SLOTS.forEach(slot => {
                if (empty[day][slot]) return; // already confirmed free in an earlier week
                anyValidWeek[day][slot] = true;
                const isBusy = busy[day][slot].some(range => dayDate >= range.start && dayDate <= range.end);
                if (!isBusy) empty[day][slot] = true;
            });
        });
        const nextMonday = new Date(weekMonday);
        nextMonday.setDate(nextMonday.getDate() + 7);
        weekMonday = nextMonday;
    }

    const result = {};
    let totalEmpty = 0;
    days.forEach(day => {
        result[day] = {};
        GRID_SLOTS.forEach(slot => {
            if (!anyValidWeek[day][slot]) {
                result[day][slot] = null;
            } else {
                result[day][slot] = empty[day][slot];
                if (empty[day][slot]) totalEmpty++;
            }
        });
    });

    showEmptySlotMessage(totalEmpty === 0 ? "No empty slots found for this faculty selection and date range." : null);
    renderEmptySlotGrid(result, includeSaturday);
}

function renderEmptySlotGrid(resultMap, includeSaturday) {
    const days = includeSaturday ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Mon", "Tue", "Wed", "Thu", "Fri"];

    const head = document.getElementById("emptySlotHead");
    head.innerHTML = `<tr><th class="time-col">Time Slot</th>${days.map(d => `<th>${DAY_LABELS[d]}</th>`).join("")}</tr>`;

    const body = document.getElementById("emptySlotBody");
    body.innerHTML = "";
    GRID_SLOTS.forEach(slot => {
        let rowHtml = `<td class="time-label">${SLOT_LABELS[slot]}</td>`;
        days.forEach(day => {
            const status = resultMap ? resultMap[day][slot] : null;
            let cls = "day-cell slot-unavailable";
            let content = "";
            if (status === true) {
                cls = "day-cell slot-free";
                content = `<div class="free-label">Free</div>`;
            } else if (status === false) {
                cls = "day-cell slot-busy";
            }
            rowHtml += `<td class="${cls}">${content}</td>`;
        });
        const tr = document.createElement("tr");
        tr.innerHTML = rowHtml;
        body.appendChild(tr);
    });
}
