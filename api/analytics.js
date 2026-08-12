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

function parseCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getClient() {
  const credentials = parseCredentials();
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

async function runReport(client, propertyId, request) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    ...request,
  });
  return response.rows || [];
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

  const propertyId = process.env.GA4_PROPERTY_ID;
  const client = getClient();

  if (!propertyId || !client) {
    return res.status(503).json({
      live: false,
      error: "GA4 credentials not configured",
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
    ]);

    const dailyMap = rowsByDate(dailyRows);
    const bookingMap = rowsByDate(bookingRows);
    const dates = sortedDates(dailyMap);

    const dateLabels = dates.map(formatGaDate);
    const dailyVisitors = dates.map((d) => Number(dailyMap.get(d).metricValues[0].value));
    const dailyPageViews = dates.map((d) => Number(dailyMap.get(d).metricValues[1].value));
    const dailyBounceRate = dates.map((d) =>
      Number((Number(dailyMap.get(d).metricValues[2].value) * 100).toFixed(1))
    );
    const dailyBookingViews = dates.map((d) =>
      Number(bookingMap.get(d)?.metricValues[0].value || 0)
    );

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
      topPages,
      trafficSources,
      referrers,
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
