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

    // Course and Faculty filters are cross-linked (see refreshFacultyOptions /
    // refreshCourseOptions below): picking a course narrows Faculty to only
    // the people teaching it, and picking a faculty member narrows Course to
    // only what they teach. Both start unfiltered ("all") on page load.
    refreshFacultyOptions();
    refreshCourseOptions();
}

// Faculty who teach the currently-selected course (or everyone, if "all").
function getFacultyOptionsForCourse(courseCode) {
    let items = RAW_TIMETABLE_DATA;
    if (courseCode !== "all") {
        items = items.filter(d => d.code === courseCode);
    }
    return [...new Set(items.map(d => d.faculty))].filter(Boolean).sort();
}

// Courses taught by the currently-selected faculty member (or all courses).
// Returns [code, title] pairs, one per unique course code.
function getCourseOptionsForFaculty(facultyName) {
    let items = RAW_TIMETABLE_DATA;
    if (facultyName !== "all") {
        items = items.filter(d => d.faculty === facultyName);
    }
    const courseMap = new Map();
    items.forEach(d => {
        if (!courseMap.has(d.code)) courseMap.set(d.code, d.title);
    });
    return [...courseMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
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
    const courseSelect = document.getElementById("courseFilter");
    const facultySelect = document.getElementById("facultyFilter");
    populateSelect(facultySelect, getFacultyOptionsForCourse(courseSelect.value), "All Faculty");
}

function refreshCourseOptions() {
    const facultySelect = document.getElementById("facultyFilter");
    const courseSelect = document.getElementById("courseFilter");
    populateSelect(courseSelect, getCourseOptionsForFaculty(facultySelect.value), "All Courses");
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
        renderGrid();
    });
    document.getElementById("semNumberFilter").addEventListener("change", renderGrid);
    document.getElementById("facultyStatusFilter").addEventListener("change", renderGrid);

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
