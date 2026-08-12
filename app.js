const { BetaAnalyticsDataClient } = require("@google-analytics/data");

const MEASUREMENT_ID = "G-7D1XJL0DVL";
const DAYS = 12;

const CHANNEL_LABELS = {
  "Organic Search": "Organisk sökning",
  Direct: "Direkt",
  "Organic Social": "Socialt",
  "Paid Social": "Socialt",
  Referral: "Referral",
  Email: "E-post",
  "Paid Search": "Betald sökning",
  Unassigned: "Övrigt",
};

const MONTHS_SV = [
  "jan", "feb", "mar", "apr", "maj", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
];

function formatGaDate(yyyymmdd) {
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6));
  const day = Number(yyyymmdd.slice(6, 8));
  return `${day} ${MONTHS_SV[month - 1]}`;
}

function formatRangeLabel(startYmd, endYmd) {
  const startDay = Number(startYmd.slice(6, 8));
  const endDay = Number(endYmd.slice(6, 8));
  const startMonth = MONTHS_SV[Number(startYmd.slice(4, 6)) - 1];
  const endMonth = MONTHS_SV[Number(endYmd.slice(4, 6)) - 1];
  const year = endYmd.slice(0, 4);

  if (startMonth === endMonth) {
    return `${startDay}–${endDay} ${endMonth} ${year}`;
  }
  return `${startDay} ${startMonth}–${endDay} ${endMonth} ${year}`;
}

function formatShare(value, total) {
  if (!total) return "0%";
  return `${((value / total) * 100).toFixed(1).replace(".", ",")}%`;
}

function formatKeywordRows(rows) {
  const filtered = rows.filter((row) => {
    const term = row.dimensionValues[0].value || "";
    return term && term !== "(not provided)" && term !== "(not set)";
  });

  const total = filtered.reduce(
    (sum, row) => sum + Number(row.metricValues[0].value),
    0
  );

  return filtered.slice(0, 8).map((row) => {
    const term = row.dimensionValues[0].value;
    const sessions = Number(row.metricValues[0].value);
    return [term, sessions, formatShare(sessions, total)];
  });
}

async function fetchKeywords(client, propertyId, dateRange) {
  const queries = [
    {
      dimensions: [{ name: "organicGoogleSearchQuery" }],
      note: "searchConsole",
    },
    {
      dimensions: [{ name: "sessionManualTerm" }],
      note: "utmTerm",
    },
  ];

  for (const query of queries) {
    try {
      const rows = await runReport(client, propertyId, {
        dateRanges: [dateRange],
        dimensions: query.dimensions,
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      });
      const keywords = formatKeywordRows(rows);
      if (keywords.length) {
        return { keywords, source: query.note };
      }
    } catch (error) {
      console.warn(`Keyword query failed (${query.note}):`, error.message);
    }
  }

  return { keywords: [], source: null };
}

function formatTableRows(rows, labelIndex = 0, metricIndex = 0, limit = 6) {
  const filtered = rows.filter((row) => {
    const label = row.dimensionValues[labelIndex]?.value || "";
    return label && label !== "(not set)" && label !== "(not provided)";
  });

  const total = filtered.reduce(
    (sum, row) => sum + Number(row.metricValues[metricIndex].value),
    0
  );

  return filtered.slice(0, limit).map((row) => {
    const label = row.dimensionValues[labelIndex].value;
    const value = Number(row.metricValues[metricIndex].value);
    return [label, value, formatShare(value, total)];
  });
}

function parseCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const candidates = [raw.trim()];
    if (candidates[0].startsWith('"') && candidates[0].endsWith('"')) {
      candidates.push(candidates[0].slice(1, -1));
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        try {
          return JSON.parse(Buffer.from(candidate, "base64").toString("utf8"));
        } catch {
          // try next candidate
        }
      }
    }
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    return {
      type: "service_account",
      project_id: process.env.GOOGLE_PROJECT_ID || "hardiman-analytics",
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

function getCredentialStatus() {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const hasJson = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
  const hasSplit = Boolean(
    process.env.GOOGLE_CLIENT_EMAIL?.trim() && process.env.GOOGLE_PRIVATE_KEY?.trim()
  );
  const credentials = parseCredentials();

  const missing = [];
  if (!propertyId) missing.push("GA4_PROPERTY_ID");
  if (!hasJson && !hasSplit) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON");
  } else if (!credentials) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_JSON (invalid JSON)");
  }

  return { propertyId, credentials, missing };
}

function getClient(credentials) {
  if (!credentials) return null;
  return new BetaAnalyticsDataClient({ credentials });
}

function rowsByDate(rows) {
  const map = new Map();
  for (const row of rows) {
    const date = row.dimensionValues[0].value;
    map.set(date, row);
  }
  return map;
}

function sortedDates(map) {
  return [...map.keys()].sort();
}

function ymdFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function buildDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(ymdFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

async function runReport(client, propertyId, request) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    ...request,
  });
  return response.rows || [];
}

async function safeRunReport(client, propertyId, request, label) {
  try {
    return await runReport(client, propertyId, request);
  } catch (error) {
    console.warn(`GA4 report failed (${label}):`, error.message);
    return [];
  }
}

async function fetchExitPages(client, propertyId, dateRange) {
  const exits = await safeRunReport(client, propertyId, {
    dateRanges: [dateRange],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "exits" }],
    orderBys: [{ metric: { metricName: "exits" }, desc: true }],
    limit: 8,
  }, "exitPages");

  if (exits.length) return exits;

  return safeRunReport(client, propertyId, {
    dateRanges: [dateRange],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 8,
  }, "exitPagesFallback");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ live: false, error: "Method not allowed" });
  }

  const secret = process.env.DASHBOARD_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ live: false, error: "Unauthorized" });
    }
  }

  const { propertyId, credentials, missing } = getCredentialStatus();
  const client = getClient(credentials);

  if (!propertyId || !client) {
    return res.status(503).json({
      live: false,
      error: "GA4 credentials not configured",
      missing,
      measurementId: MEASUREMENT_ID,
    });
  }

  const dateRange = { startDate: `${DAYS - 1}daysAgo`, endDate: "today" };

  try {
    const [
      dailyRows,
      bookingRows,
      pageRows,
      channelRows,
      referrerRows,
      deviceRows,
      sessionRows,
      keywordResult,
      landingRows,
      exitRows,
      cityRows,
      contactSummaryRows,
      contactDailyRows,
    ] = await Promise.all([
      runReport(client, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      runReport(client, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "screenPageViews" }],
        dimensionFilter: {
          filter: {
            fieldName: "pagePath",
            stringFilter: { matchType: "CONTAINS", value: "/booking" },
          },
        },
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      runReport(client, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 6,
      }),
      runReport(client, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 8,
      }),
      runReport(client, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "sessionSource" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 6,
      }),
      runReport(client, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "sessions" }],
      }),
      runReport(client, propertyId, {
        dateRanges: [dateRange],
        metrics: [{ name: "averageSessionDuration" }],
      }),
      fetchKeywords(client, propertyId, dateRange),
      safeRunReport(client, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "landingPage" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 8,
      }, "landingPages"),
      fetchExitPages(client, propertyId, dateRange),
      safeRunReport(client, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "city" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 8,
      }, "demographics"),
      safeRunReport(client, propertyId, {
        dateRanges: [dateRange],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        dimensionFilter: {
          filter: {
            fieldName: "pagePath",
            stringFilter: { matchType: "CONTAINS", value: "/contact" },
          },
        },
      }, "contactSummary"),
      safeRunReport(client, propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "screenPageViews" }],
        dimensionFilter: {
          filter: {
            fieldName: "pagePath",
            stringFilter: { matchType: "CONTAINS", value: "/contact" },
          },
        },
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }, "contactDaily"),
    ]);

    const dailyMap = rowsByDate(dailyRows);
    const bookingMap = rowsByDate(bookingRows);
    const contactMap = rowsByDate(contactDailyRows);
    const dates = buildDateRange(DAYS);

    const dateLabels = dates.map(formatGaDate);
    const dailyVisitors = dates.map((d) =>
      Number(dailyMap.get(d)?.metricValues[0].value || 0)
    );
    const dailyPageViews = dates.map((d) =>
      Number(dailyMap.get(d)?.metricValues[1].value || 0)
    );
    const dailyBounceRate = dates.map((d) => {
      const raw = dailyMap.get(d)?.metricValues[2].value;
      return raw ? Number((Number(raw) * 100).toFixed(1)) : 0;
    });
    const dailyBookingViews = dates.map((d) =>
      Number(bookingMap.get(d)?.metricValues[0].value || 0)
    );
    const dailyContactViews = dates.map((d) =>
      Number(contactMap.get(d)?.metricValues[0].value || 0)
    );

    const landingPages = formatTableRows(landingRows);
    const exitPages = formatTableRows(exitRows);
    const demographics = formatTableRows(cityRows);

    const topPages = pageRows.map((row) => ({
      path: row.dimensionValues[0].value || "/",
      views: Number(row.metricValues[0].value),
    }));

    const channelTotal = channelRows.reduce(
      (sum, row) => sum + Number(row.metricValues[0].value),
      0
    );
    const trafficSources = channelRows.map((row) => {
      const channel = row.dimensionValues[0].value;
      const sessions = Number(row.metricValues[0].value);
      return {
        label: CHANNEL_LABELS[channel] || channel,
        value: channelTotal ? Math.round((sessions / channelTotal) * 100) : 0,
        sessions,
      };
    });

    const referrerTotal = referrerRows.reduce(
      (sum, row) => sum + Number(row.metricValues[0].value),
      0
    );
    const referrers = referrerRows.map((row) => {
      const source = row.dimensionValues[0].value || "(direct)";
      const sessions = Number(row.metricValues[0].value);
      return [source, sessions, formatShare(sessions, referrerTotal)];
    });

    const { keywords, source: keywordSource } = keywordResult;

    const contactViews = Number(contactSummaryRows[0]?.metricValues[0].value || 0);
    const contactUsers = Number(contactSummaryRows[0]?.metricValues[1].value || 0);
    const totalVisitors = dailyVisitors.reduce((sum, n) => sum + n, 0);
    const contactRate = totalVisitors
      ? Number(((contactUsers / totalVisitors) * 100).toFixed(1))
      : 0;

    const deviceTotal = deviceRows.reduce(
      (sum, row) => sum + Number(row.metricValues[0].value),
      0
    );
    const devices = { mobile: 0, desktop: 0, tablet: 0 };
    for (const row of deviceRows) {
      const category = row.dimensionValues[0].value;
      const sessions = Number(row.metricValues[0].value);
      const pct = deviceTotal ? Math.round((sessions / deviceTotal) * 100) : 0;
      if (category === "mobile") devices.mobile = pct;
      else if (category === "desktop") devices.desktop = pct;
      else if (category === "tablet") devices.tablet = pct;
    }

    const avgSessionSeconds = Number(sessionRows[0]?.metricValues[0].value || 0);
    const avgSessionMinutes = Number((avgSessionSeconds / 60).toFixed(1));

    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const lastDateLabel = dateLabels[dateLabels.length - 1];

    return res.status(200).json({
      live: true,
      measurementId: MEASUREMENT_ID,
      dateRange: {
        start: startDate,
        end: endDate,
        label: formatRangeLabel(startDate, endDate),
        subtitle: `Kungsbacka · ${formatRangeLabel(startDate, endDate)} · senaste ${DAYS} dagarna`,
      },
      todayLabel: lastDateLabel,
      dateLabels,
      dailyVisitors,
      dailyPageViews,
      dailyBounceRate,
      dailyBookingViews,
      dailyContactViews,
      topPages,
      trafficSources,
      referrers,
      keywords,
      keywordSource,
      landingPages,
      exitPages,
      demographics,
      contact: {
        views: contactViews,
        users: contactUsers,
        rate: contactRate,
      },
      devices,
      avgSessionMinutes,
    });
  } catch (error) {
    console.error("GA4 API error:", error);
    return res.status(503).json({
      live: false,
      error: error.message || "Failed to fetch GA4 data",
      measurementId: MEASUREMENT_ID,
    });
  }
};

