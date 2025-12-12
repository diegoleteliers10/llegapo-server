import { setTimeout as delay } from "node:timers/promises";

/**
 * Simple rate-limit test script.
 *
 * Usage examples (from project root):
 *   ts-node llegapo-servidor/test.index.ts
 *   ts-node llegapo-servidor/test.index.ts --url https://llegapo-server.vercel.app/v1/stops/PC205/arrivals/busId?busId=405 --requests 50 --concurrency 10 --delayMs 100
 *
 * Arguments:
 *   --url          Target URL to test (default: arrivals/busId endpoint on vercel)
 *   --requests     Total number of requests to send (default: 40)
 *   --concurrency  Max concurrent requests (default: 8)
 *   --delayMs      Delay (ms) between starting each batch (default: 50)
 */

type Args = {
  url: string;
  requests: number;
  concurrency: number;
  delayMs: number;
};

function parseArgs(argv: string[]): Args {
  const defaults: Args = {
    url:
      process.env.TEST_URL ||
      "https://llegapo-server.vercel.app/v1/stops/PC205/arrivals/busId?busId=405",
    requests: Number(process.env.TEST_REQUESTS || 40),
    concurrency: Number(process.env.TEST_CONCURRENCY || 8),
    delayMs: Number(process.env.TEST_DELAY_MS || 50),
  };

  const argMap = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (next && !next.startsWith("--")) {
        argMap.set(key, next);
        i++;
      } else {
        argMap.set(key, "true");
      }
    }
  }

  const url = argMap.get("url") || defaults.url;
  const requests = Number(argMap.get("requests") || defaults.requests);
  const concurrency = Number(argMap.get("concurrency") || defaults.concurrency);
  const delayMs = Number(argMap.get("delayMs") || defaults.delayMs);

  return { url, requests, concurrency, delayMs };
}

type ResultSummary = {
  total: number;
  ok2xx: number;
  rate429: number;
  client4xx: number;
  server5xx: number;
  other: number;
  samples: Array<{ status: number; timeMs: number; length?: number; error?: string }>;
};

/**
 * Run HTTP requests with a concurrency limit and collect stats.
 */
async function runLoadTest(url: string, total: number, concurrency: number, delayMs: number): Promise<ResultSummary> {
  const summary: ResultSummary = {
    total,
    ok2xx: 0,
    rate429: 0,
    client4xx: 0,
    server5xx: 0,
    other: 0,
    samples: [],
  };

  let inFlight = 0;
  let launched = 0;

  const launchNext = async () => {
    while (launched < total && inFlight < concurrency) {
      const index = launched++;
      inFlight++;
      void sendOne(index, url)
        .then((r) => {
          // aggregate
          if (r.status >= 200 && r.status < 300) summary.ok2xx++;
          else if (r.status === 429) summary.rate429++;
          else if (r.status >= 400 && r.status < 500) summary.client4xx++;
          else if (r.status >= 500 && r.status < 600) summary.server5xx++;
          else summary.other++;

          if (summary.samples.length < 10) {
            summary.samples.push({
              status: r.status,
              timeMs: r.timeMs,
              length: r.length,
              error: r.error,
            });
          }
        })
        .catch((err) => {
          summary.other++;
          if (summary.samples.length < 10) {
            summary.samples.push({ status: -1, timeMs: 0, error: String(err?.message || err) });
          }
        })
        .finally(() => {
          inFlight--;
        });
    }
  };

  const start = Date.now();
  while (launched < total) {
    await launchNext();
    await delay(delayMs);
  }

  // Wait for all in-flight to finish
  while (inFlight > 0) {
    await delay(10);
  }
  const elapsed = Date.now() - start;

  // Print summary
  printSummary(url, summary, elapsed, concurrency, delayMs);
  return summary;
}

async function sendOne(index: number, url: string): Promise<{ status: number; timeMs: number; length?: number; error?: string }> {
  const reqStart = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // Mimic browser-ish headers; you can tweak if needed
        "User-Agent": "RateTest/1.0 (+https://github.com)",
        "Accept": "*/*",
      },
    });
    const timeMs = Date.now() - reqStart;
    let length: number | undefined = undefined;
    try {
      const text = await res.text();
      length = text.length;
    } catch {
      // ignore body errors
    }
    return { status: res.status, timeMs, length };
  } catch (err: any) {
    return { status: -1, timeMs: Date.now() - reqStart, error: String(err?.message || err) };
  }
}

function printSummary(url: string, s: ResultSummary, elapsedMs: number, concurrency: number, delayMs: number) {
  const ratePerSec = (s.total / Math.max(elapsedMs / 1000, 0.001)).toFixed(2);
  console.log("=== Rate Limit Test Summary ===");
  console.log("Target URL:", url);
  console.log("Total requests:", s.total);
  console.log("Elapsed:", `${elapsedMs} ms`);
  console.log("Avg rate:", `${ratePerSec} req/s`);
  console.log("Concurrency:", concurrency, "Batch delay:", `${delayMs} ms`);
  console.log("---- Results ----");
  console.log("2xx:", s.ok2xx);
  console.log("429:", s.rate429);
  console.log("4xx:", s.client4xx);
  console.log("5xx:", s.server5xx);
  console.log("Other:", s.other);
  if (s.samples.length) {
    console.log("---- Samples (first 10) ----");
    for (const [i, sample] of s.samples.entries()) {
      console.log(
        `#${i} status=${sample.status} timeMs=${sample.timeMs} length=${sample.length ?? "n/a"} error=${sample.error ?? ""}`.trim(),
      );
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  console.log("Running rate-limit test with args:", args);
  await runLoadTest(args.url, args.requests, args.concurrency, args.delayMs);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
