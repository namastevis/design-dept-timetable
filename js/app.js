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
});

function initFilters() {
    const facultySelect = document.getElementById("facultyFilter");
    const semNumberSelect = document.getElementById("semNumberFilter");

    // Extract Unique Faculties
    const faculties = [...new Set(RAW_TIMETABLE_DATA.map(d => d.faculty))].filter(Boolean).sort();
    faculties.forEach(fac => {
        const opt = document.createElement("option");
        opt.value = fac;
        opt.textContent = fac;
        facultySelect.appendChild(opt);
    });

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
}

function setupEventListeners() {
    document.getElementById("prevWeekBtn").addEventListener("click", () => changeWeek(-7));
    document.getElementById("nextWeekBtn").addEventListener("click", () => changeWeek(7));
    document.getElementById("jumpToTodayBtn").addEventListener("click", () => {
        currentMonday = getMondayOf(parseLocalDate("2026-08-17"));
        renderGrid();
    });

    // Filter Change Listeners
    document.getElementById("facultyFilter").addEventListener("change", renderGrid);
    document.getElementById("courseTypeFilter").addEventListener("change", () => {
        updateSemNumberFilterState();
        renderGrid();
    });
    document.getElementById("semNumberFilter").addEventListener("change", renderGrid);
    document.getElementById("facultyStatusFilter").addEventListener("change", renderGrid);
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
