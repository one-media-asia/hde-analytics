const SAMPLE_DATA = {
  dateRange: {
    subtitle: "Kungsbacka · 1–12 aug 2026 · senaste 12 dagarna",
  },
  todayLabel: "12 aug",
  dateLabels: [
    "1 aug", "2 aug", "3 aug", "4 aug", "5 aug", "6 aug",
    "7 aug", "8 aug", "9 aug", "10 aug", "11 aug", "12 aug",
  ],
  dailyVisitors: [54, 68, 61, 74, 71, 46, 41, 78, 86, 73, 89, 96],
  dailyPageViews: [142, 178, 158, 196, 184, 118, 104, 208, 228, 188, 224, 248],
  dailyBounceRate: [58.2, 56.4, 57.8, 54.1, 55.6, 62.3, 64.8, 52.9, 51.2, 55.4, 50.8, 49.6],
  dailyBookingViews: [8, 11, 9, 14, 12, 5, 4, 16, 18, 13, 17, 19],
  topPages: [
    { path: "/", views: 412 },
    { path: "/services", views: 286 },
    { path: "/pricing", views: 198 },
    { path: "/booking", views: 142 },
    { path: "/contact", views: 96 },
    { path: "/work", views: 74 },
  ],
  trafficSources: [
    { label: "Organisk sökning", value: 52 },
    { label: "Direkt", value: 22 },
    { label: "Google Maps", value: 12 },
    { label: "Socialt", value: 8 },
    { label: "Referral", value: 6 },
  ],
  referrers: [
    ["google.com / google.se", 412, "48,6%"],
    ["maps.google.com", 98, "11,5%"],
    ["facebook.com", 54, "6,4%"],
    ["hitta.se", 32, "3,8%"],
    ["instagram.com", 28, "3,3%"],
    ["eniro.se", 18, "2,1%"],
  ],
  keywords: [
    ["trädfällning kungsbacka", 86, "24,1%"],
    ["trädvård kungsbacka", 64, "17,9%"],
    ["trädgårdsservice kungsbacka", 41, "11,5%"],
    ["beskärning träd", 38, "10,6%"],
    ["stubbfräsning", 29, "8,1%"],
    ["trädgårdsarbete", 24, "6,7%"],
    ["häckklippning kungsbacka", 19, "5,3%"],
    ["trädfällare göteborg", 14, "3,9%"],
  ],
  devices: { mobile: 62, desktop: 33, tablet: 5 },
  avgSessionMinutes: 2.1,
};

const COLORS = {
  accent: "#3d6b2f",
  accentSoft: "rgba(61, 107, 47, 0.15)",
  secondary: "#5a8a72",
  secondarySoft: "rgba(90, 138, 114, 0.12)",
  palette: ["#3d6b2f", "#5a8a72", "#7aa882", "#a8b89a", "#c5d4bc"],
  grid: "#e8ede4",
  text: "#5c6b58",
};

let DATA = { ...SAMPLE_DATA };
let charts = [];

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function formatNumber(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return String(n);
}

function pctChange(current, previous) {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function chartDefaults() {
  Chart.defaults.font.family = '"DM Sans", system-ui, sans-serif';
  Chart.defaults.color = COLORS.text;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
}

function baseScales() {
  return {
    x: {
      grid: { color: COLORS.grid, drawBorder: false },
      ticks: { font: { size: 11 } },
    },
    y: {
      grid: { color: COLORS.grid, drawBorder: false },
      ticks: { font: { size: 11 } },
      beginAtZero: true,
    },
  };
}

function setLiveState(isLive) {
  const dot = document.querySelector(".live-dot");
  const status = document.querySelector(".status-text");
  const badge = document.querySelector(".sample-badge");
  const notice = document.querySelector(".notice");

  if (isLive) {
    dot.classList.add("connected");
    dot.title = "Live GA4 ansluten";
    status.textContent = "Live GA4-data";
    badge.textContent = "Live";
    badge.classList.add("live-badge");
    notice.hidden = true;
    return;
  }

  dot.classList.remove("connected");
  dot.title = "Live GA4 ej ansluten";
  status.textContent = "Exempeldata — anslut GA4 för live";
  badge.textContent = "Exempeldata";
  badge.classList.remove("live-badge");
  notice.hidden = false;
}

function renderStats() {
  const totalVisitors = sum(DATA.dailyVisitors);
  const totalPageViews = sum(DATA.dailyPageViews);
  const totalBooking = sum(DATA.dailyBookingViews);
  const avgBounce = sum(DATA.dailyBounceRate) / DATA.dailyBounceRate.length;
  const last = DATA.dailyVisitors.length - 1;
  const prev = last - 1;
  const visitorChange = pctChange(DATA.dailyVisitors[last], DATA.dailyVisitors[prev]);
  const pageViewChange = pctChange(DATA.dailyPageViews[last], DATA.dailyPageViews[prev]);
  const bookingRate = ((totalBooking / totalVisitors) * 100).toFixed(1).replace(".", ",");

  document.getElementById("stat-visitors").textContent = formatNumber(totalVisitors);
  document.getElementById("stat-pageviews").textContent = formatNumber(totalPageViews);
  document.getElementById("stat-booking").textContent = String(totalBooking);
  document.getElementById("stat-bounce").textContent = `${avgBounce.toFixed(1).replace(".", ",")}%`;
  document.getElementById("stat-session").textContent =
    `${String(DATA.avgSessionMinutes).replace(".", ",")} min`;

  document.getElementById("stat-visitors-delta").textContent =
    `${visitorChange >= 0 ? "+" : ""}${visitorChange.toFixed(1).replace(".", ",")}% idag`;
  document.getElementById("stat-pageviews-delta").textContent =
    `${pageViewChange >= 0 ? "+" : ""}${pageViewChange.toFixed(1).replace(".", ",")}% idag`;
  document.getElementById("stat-booking-rate").textContent =
    `${bookingRate}% av besökare når bokning`;

  document.getElementById("today-visitors").textContent = DATA.dailyVisitors[last];
  document.getElementById("today-pageviews").textContent = DATA.dailyPageViews[last];
  document.getElementById("today-booking").textContent = DATA.dailyBookingViews[last];
  document.getElementById("today-note").textContent =
    `Sidvisningar ${pageViewChange >= 0 ? "upp" : "ner"} ${Math.abs(pageViewChange).toFixed(1).replace(".", ",")}% jämfört med igår`;

  if (DATA.dateRange?.subtitle) {
    document.getElementById("date-subtitle").textContent = DATA.dateRange.subtitle;
  }
  if (DATA.todayLabel) {
    document.getElementById("today-title").textContent = `Idag (${DATA.todayLabel})`;
  }
}

function renderDevices() {
  const devices = DATA.devices || SAMPLE_DATA.devices;
  const rows = [
    ["mobile", devices.mobile],
    ["desktop", devices.desktop],
    ["tablet", devices.tablet],
  ];

  for (const [key, pct] of rows) {
    const fill = document.querySelector(`.bar-fill.${key}`);
    const label = fill?.closest(".device-row")?.querySelector("span:last-child");
    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = `${pct}%`;
  }
}

function renderReferrers() {
  const tbody = document.getElementById("referrers-body");
  tbody.innerHTML = DATA.referrers
    .map(
      ([ref, sessions, share]) =>
        `<tr><td>${ref}</td><td>${sessions}</td><td>${share}</td></tr>`
    )
    .join("");
}

function renderKeywords(isLive) {
  const tbody = document.getElementById("keywords-body");
  const note = document.getElementById("keywords-note");
  const keywords = DATA.keywords || [];

  if (!keywords.length) {
    tbody.innerHTML =
      `<tr><td colspan="3" class="empty-cell">Inga sökord registrerade ännu</td></tr>`;
    note.hidden = false;
    note.textContent = isLive
      ? "Anslut Google Search Console till GA4 (Admin → Produktlänkar) för organiska sökord."
      : "Exempeldata visas när live GA4 saknar sökordsdata.";
    return;
  }

  tbody.innerHTML = keywords
    .map(
      ([term, sessions, share]) =>
        `<tr><td>${term}</td><td>${sessions}</td><td>${share}</td></tr>`
    )
    .join("");

  note.hidden = !isLive || DATA.keywordSource !== "searchConsole";
  if (!note.hidden) {
    note.textContent = "Data från Google Search Console via GA4.";
  } else if (isLive && DATA.keywordSource === "utmTerm") {
    note.hidden = false;
    note.textContent = "Data från UTM-term (sessionManualTerm).";
  } else {
    note.hidden = true;
  }
}

function destroyCharts() {
  for (const chart of charts) chart.destroy();
  charts = [];
}

function renderCharts() {
  chartDefaults();
  destroyCharts();

  charts.push(new Chart(document.getElementById("chart-visitors"), {
    type: "line",
    data: {
      labels: DATA.dateLabels,
      datasets: [{
        label: "Besökare",
        data: DATA.dailyVisitors,
        borderColor: COLORS.accent,
        backgroundColor: COLORS.accentSoft,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: baseScales(),
    },
  }));

  charts.push(new Chart(document.getElementById("chart-comparison"), {
    type: "line",
    data: {
      labels: DATA.dateLabels,
      datasets: [
        {
          label: "Sidvisningar",
          data: DATA.dailyPageViews,
          borderColor: COLORS.accent,
          backgroundColor: "transparent",
          tension: 0.35,
          pointRadius: 2,
        },
        {
          label: "Besökare",
          data: DATA.dailyVisitors,
          borderColor: COLORS.secondary,
          backgroundColor: "transparent",
          tension: 0.35,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: baseScales(),
    },
  }));

  charts.push(new Chart(document.getElementById("chart-booking"), {
    type: "bar",
    data: {
      labels: DATA.dateLabels,
      datasets: [{
        label: "Bokningsvisningar",
        data: DATA.dailyBookingViews,
        backgroundColor: COLORS.accent,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: baseScales(),
    },
  }));

  charts.push(new Chart(document.getElementById("chart-pages"), {
    type: "bar",
    data: {
      labels: DATA.topPages.map((p) => p.path),
      datasets: [{
        label: "Sidvisningar",
        data: DATA.topPages.map((p) => p.views),
        backgroundColor: COLORS.accent,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: baseScales().x,
        y: {
          grid: { display: false },
          ticks: { font: { size: 12, weight: "500" } },
        },
      },
    },
  }));

  charts.push(new Chart(document.getElementById("chart-sources"), {
    type: "doughnut",
    data: {
      labels: DATA.trafficSources.map((s) => s.label),
      datasets: [{
        data: DATA.trafficSources.map((s) => s.value),
        backgroundColor: COLORS.palette,
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom", labels: { padding: 14, font: { size: 11 } } },
      },
    },
  }));
}

function renderDashboard(isLive) {
  setLiveState(isLive);
  renderStats();
  renderDevices();
  renderReferrers();
  renderKeywords(isLive);
  renderCharts();
}

async function loadAnalytics() {
  try {
    const response = await fetch("/api/analytics");
    const payload = await response.json();

    if (response.ok && payload.live) {
      DATA = payload;
      renderDashboard(true);
      return;
    }
  } catch {
    // fall back to sample data
  }

  DATA = { ...SAMPLE_DATA };
  renderDashboard(false);
}

loadAnalytics();
