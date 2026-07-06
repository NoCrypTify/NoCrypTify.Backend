import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Performance test for the Secret Notes REST API (Feature A + B under load).
// In CD this runs against the freshly-deployed *inactive* blue/green backend
// before traffic is switched. A threshold breach fails the stage and blocks
// the switch.
//
//   API_BASE_URL   base URL of the API (injected via env, no trailing slash).
//                  container (blue/green): http://<ec2-host>:3001
//                  via nginx (staging):    http://<host>/staging/api
//                  local dev:              http://localhost:3000  (default)
//
// Run:  k6 run -e API_BASE_URL=http://host:3001 k6/notes-load-test.js

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000';

// The wrong-key request intentionally returns 403 — mark it (and the normal
// 200/201) as "expected" so it is NOT counted in the http_req_failed metric.
http.setResponseCallback(http.expectedStatuses(200, 201, 403));

const wrongKeyErrors = new Rate('wrong_key_not_rejected');

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 10 }, // ramp up
        { duration: '40s', target: 10 }, // steady load
        { duration: '10s', target: 0 }, // ramp down
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    // 95% of requests must complete under 500ms, 99% under 1s.
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    // Less than 1% of HTTP requests may fail (a wrong-key 403 is expected and
    // is not counted as a failure — see the manual check below).
    http_req_failed: ['rate<0.01'],
    // A wrong key must NEVER decrypt: this rate must stay at 0.
    wrong_key_not_rejected: ['rate==0'],
    checks: ['rate>0.99'],
  },
};

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  const key = `k6-key-${__VU}-${__ITER}`;
  const content = `k6 secret ${Date.now()}`;

  // 1) Create an encrypted note.
  const create = http.post(
    `${BASE_URL}/notes`,
    JSON.stringify({ title: 'k6-load', content, key }),
    JSON_HEADERS,
  );
  const created = check(create, {
    'create -> 201': (r) => r.status === 201,
    'create returns noteId': (r) => !!r.json('noteId'),
  });
  if (!created) {
    sleep(1);
    return;
  }
  const noteId = create.json('noteId');

  // 2) Reveal with the correct key -> plaintext returned.
  const reveal = http.post(
    `${BASE_URL}/notes/${noteId}/reveal`,
    JSON.stringify({ key }),
    JSON_HEADERS,
  );
  check(reveal, {
    'reveal (correct) -> 200': (r) => r.status === 200,
    'reveal returns plaintext': (r) => r.json('content') === content,
  });

  // 3) Reveal with a wrong key -> must be denied with 403 (not a server error,
  //    not a leak). This request is *expected* to be a 403, so exclude it from
  //    the http_req_failed metric via responseCallback below.
  const bad = http.post(
    `${BASE_URL}/notes/${noteId}/reveal`,
    JSON.stringify({ key: 'wrong-key' }),
    JSON_HEADERS,
  );
  const denied = check(bad, {
    'reveal (wrong) -> 403': (r) => r.status === 403,
  });
  // If a wrong key ever returned 200, that is a security failure.
  wrongKeyErrors.add(bad.status === 200);
  if (!denied) {
    // no-op; the check + rate already record it
  }

  sleep(1);
}

export function handleSummary(data) {
  return {
    stdout: JSON.stringify(
      {
        p95_ms: data.metrics.http_req_duration?.values?.['p(95)'],
        http_req_failed: data.metrics.http_req_failed?.values?.rate,
        checks_passed: data.metrics.checks?.values?.rate,
        wrong_key_not_rejected: data.metrics.wrong_key_not_rejected?.values?.rate,
      },
      null,
      2,
    ),
    'k6-summary.json': JSON.stringify(data, null, 2),
  };
}
