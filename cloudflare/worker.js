const MARKET = {
  "crypto": { latest: "latest/crypto/snapshot_ai.json", filename: "snapshot_ai.json" },
  "us-stock": { latest: "latest/us-stock/snapshot_us_stock_ai.json", filename: "snapshot_us_stock_ai.json" },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || "*";
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), origin);

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, service: "SStateMarketTerminal", r2: true }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/snapshot") {
        const market = normalizeMarket(url.searchParams.get("market"));
        return await objectResponse(env, MARKET[market].latest, origin, false, MARKET[market].filename);
      }
      if (request.method === "GET" && url.pathname === "/api/download") {
        const market = normalizeMarket(url.searchParams.get("market"));
        return await objectResponse(env, MARKET[market].latest, origin, true, MARKET[market].filename);
      }
      if (request.method === "GET" && url.pathname === "/api/model/active") {
        return await objectResponse(env, "models/active/probability_model.json", origin, false, "probability_model.json");
      }
      if (request.method === "GET" && url.pathname === "/api/analysis/status") {
        const runId = safeRunId(url.searchParams.get("run_id"));
        return await objectResponse(env, `runs/${runId}/status.json`, origin, false, "status.json");
      }
      if (request.method === "POST" && url.pathname === "/api/analysis/start") {
        return await startAnalysis(request, env, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/status") {
        requireInternal(request, env);
        const body = await request.json();
        const runId = safeRunId(body.run_id);
        const payload = { ...body, run_id: runId, updated_at: new Date().toISOString() };
        await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify(payload, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ ok: true }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/snapshot") {
        requireInternal(request, env);
        const market = normalizeMarket(url.searchParams.get("market"));
        const runId = safeRunId(url.searchParams.get("run_id"));
        const text = await request.text();
        const parsed = JSON.parse(text); // reject broken snapshots before replacing latest
        if (!parsed || !Array.isArray(parsed.records)) throw new Error("snapshot.records missing");
        const latestKey = MARKET[market].latest;
        const runKey = `runs/${runId}/${MARKET[market].filename}`;
        const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
        await Promise.all([
          env.JSON_BUCKET.put(latestKey, text, metadata),
          env.JSON_BUCKET.put(runKey, text, metadata),
        ]);
        const status = {
          run_id: runId, market, status: "SUCCESS", percent: 100,
          records: parsed.records.length, snapshot_key: latestKey,
          generated_at_taiwan: parsed.batch?.generated_at_taiwan || null,
          updated_at: new Date().toISOString(),
        };
        await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify(status, null, 2), metadata);
        return json({ ok: true, latest_key: latestKey, run_key: runKey, records: parsed.records.length }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/model/active") {
        requireInternal(request, env);
        const text = await request.text();
        JSON.parse(text);
        await env.JSON_BUCKET.put("models/active/probability_model.json", text, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ ok: true, key: "models/active/probability_model.json" }, 200, origin);
      }
      if (request.method === "GET" && url.pathname === "/api/model/candidate/latest") {
        return await objectResponse(env, "models/candidates/latest.json", origin, false, "candidate_latest.json");
      }
      if (request.method === "GET" && url.pathname === "/api/model/challenger/current") {
        return await objectResponse(env, "models/challenger/current.json", origin, false, "challenger_current.json");
      }
      if (request.method === "GET" && url.pathname === "/api/model/challenger/model") {
        const manifestObj = await env.JSON_BUCKET.get("models/challenger/current.json");
        if (!manifestObj) return json({ error: "challenger_not_assigned" }, 404, origin);
        const manifest = JSON.parse(await manifestObj.text());
        return await objectResponse(env, manifest.candidate_key, origin, false, "challenger_probability_model.json");
      }
      if (request.method === "GET" && url.pathname === "/api/model/evaluation/latest") {
        return await objectResponse(env, "models/evaluations/latest.json", origin, false, "champion_challenger_evaluation.json");
      }
      if (request.method === "GET" && url.pathname === "/api/learning/status") {
        return await objectResponse(env, "learning/latest/status.json", origin, false, "learning_status.json");
      }
      if (request.method === "POST" && url.pathname === "/api/internal/learning/start") {
        requireInternal(request, env);
        const result = await dispatchDailyLearning(env, "manual");
        return json(result, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/learning/status") {
        requireInternal(request, env);
        const body = await request.json();
        const payload = { ...body, updated_at: new Date().toISOString() };
        const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
        await env.JSON_BUCKET.put("learning/latest/status.json", JSON.stringify(payload, null, 2), metadata);
        if (body.run_id) {
          const runId = safeRunId(String(body.run_id));
          await env.JSON_BUCKET.put(`learning/runs/${runId}/status.json`, JSON.stringify(payload, null, 2), metadata);
        }
        return json({ ok: true }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/model/candidate") {
        requireInternal(request, env);
        const text = await request.text();
        const parsed = JSON.parse(text);
        const modelId = safeModelId(parsed?.model_id);
        const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
        const key = `models/candidates/${modelId}/probability_model.json`;
        await env.JSON_BUCKET.put(key, text, metadata);
        const manifest = {
          model_id: modelId,
          candidate_key: key,
          generated_at: parsed?.generated_at || null,
          schema_version: parsed?.schema_version || null,
          training: parsed?.training || null,
          uploaded_at: new Date().toISOString(),
          status: "CANDIDATE",
          note: "Candidate only. Active model is not replaced until a later out-of-sample promotion gate approves it."
        };
        await env.JSON_BUCKET.put("models/candidates/latest.json", JSON.stringify(manifest, null, 2), metadata);
        const challenger = await ensureChallenger(env, manifest);
        return json({ ok: true, model_id: modelId, key, manifest_key: "models/candidates/latest.json", challenger }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/learning/report") {
        requireInternal(request, env);
        const modelId = safeModelId(url.searchParams.get("model_id"));
        const text = await request.text(); JSON.parse(text);
        const key = `models/candidates/${modelId}/training_report.json`;
        await env.JSON_BUCKET.put(key, text, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ ok: true, key }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/learning/meta") {
        requireInternal(request, env);
        const modelId = safeModelId(url.searchParams.get("model_id"));
        const text = await request.text(); JSON.parse(text);
        const key = `models/candidates/${modelId}/learning_meta.json`;
        await env.JSON_BUCKET.put(key, text, { httpMetadata: { contentType: "application/json; charset=utf-8" } });
        return json({ ok: true, key }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/model/challenger/ensure") {
        requireInternal(request, env);
        const result = await ensureChallenger(env, null);
        return json({ ok: true, challenger: result }, 200, origin);
      }
      if (request.method === "PUT" && url.pathname === "/api/internal/model/evaluation") {
        requireInternal(request, env);
        const modelId = safeModelId(url.searchParams.get("model_id"));
        const bodyText = await request.text();
        const evaluation = JSON.parse(bodyText);
        if (String(evaluation?.challenger_model_id || "") !== modelId) throw httpError(400, "evaluation challenger_model_id mismatch");
        const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
        const key = `models/candidates/${modelId}/evaluation.json`;
        const latest = { ...evaluation, evaluation_key: key };
        await Promise.all([
          env.JSON_BUCKET.put(key, JSON.stringify(latest, null, 2), metadata),
          env.JSON_BUCKET.put("models/evaluations/latest.json", JSON.stringify(latest, null, 2), metadata),
        ]);
        const currentObj = await env.JSON_BUCKET.get("models/challenger/current.json");
        if (currentObj) {
          const current = JSON.parse(await currentObj.text());
          if (current.model_id === modelId) {
            current.latest_evaluation_key = key;
            current.latest_decision = evaluation.decision || null;
            current.latest_evaluated_at = evaluation.evaluated_at || new Date().toISOString();
            await env.JSON_BUCKET.put("models/challenger/current.json", JSON.stringify(current, null, 2), metadata);
          }
        }
        return json({ ok: true, key, decision: evaluation.decision || null }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/model/promote") {
        requireInternal(request, env);
        const body = await request.json();
        const modelId = safeModelId(body.model_id);
        const result = await promoteChallenger(env, modelId);
        return json({ ok: true, ...result }, 200, origin);
      }
      if (request.method === "POST" && url.pathname === "/api/internal/model/reject") {
        requireInternal(request, env);
        const body = await request.json();
        const modelId = safeModelId(body.model_id);
        const result = await rejectChallenger(env, modelId);
        return json({ ok: true, ...result }, 200, origin);
      }
      return json({ error: "not_found" }, 404, origin);
    } catch (error) {
      const status = error?.status || 500;
      return json({ error: error?.message || String(error) }, status, origin);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(dispatchDailyLearning(env, `cron:${controller.cron}`));
  }
};

async function startAnalysis(request, env, origin) {
  const body = await request.json().catch(() => ({}));
  const market = normalizeMarket(body.market);
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0,14)}_${market}_${crypto.randomUUID().slice(0,8)}`;
  const initial = { run_id: runId, market, status: "QUEUED", percent: 0, message: "等待 GitHub Actions", created_at: new Date().toISOString() };
  await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify(initial, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) throw httpError(500, "Worker 缺少 GITHUB_TOKEN 或 GITHUB_REPOSITORY");
  const endpoint = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/full-analysis.yml/dispatches`;
  const gh = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "SStateMarketTerminal-Worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: env.GITHUB_BRANCH || "main", inputs: { market, run_id: runId } }),
  });
  if (!gh.ok) {
    const text = await gh.text();
    await env.JSON_BUCKET.put(`runs/${runId}/status.json`, JSON.stringify({ ...initial, status: "FAILED", message: `GitHub dispatch ${gh.status}: ${text}` }, null, 2));
    throw httpError(502, `GitHub workflow_dispatch 失敗：${gh.status}`);
  }
  let dispatch = null;
  try { dispatch = await gh.json(); } catch (_) {}
  return json({ ok: true, run_id: runId, market, github_run_id: dispatch?.workflow_run_id || null, github_run_url: dispatch?.html_url || null }, 200, origin);
}

async function dispatchDailyLearning(env, source = "cron") {
  if (!env.LEARNING_GITHUB_TOKEN || !env.LEARNING_GITHUB_REPOSITORY) {
    throw httpError(500, "Worker 缺少 LEARNING_GITHUB_TOKEN 或 LEARNING_GITHUB_REPOSITORY");
  }
  const runId = `learn_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0,14)}_${crypto.randomUUID().slice(0,8)}`;
  const initial = {
    run_id: runId,
    status: "QUEUED",
    source,
    message: "等待 HistoricalTraining Daily S-state Learning",
    created_at: new Date().toISOString(),
  };
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
  await Promise.all([
    env.JSON_BUCKET.put("learning/latest/status.json", JSON.stringify(initial, null, 2), metadata),
    env.JSON_BUCKET.put(`learning/runs/${runId}/status.json`, JSON.stringify(initial, null, 2), metadata),
  ]);

  const endpoint = `https://api.github.com/repos/${env.LEARNING_GITHUB_REPOSITORY}/actions/workflows/daily-learning.yml/dispatches`;
  const gh = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${env.LEARNING_GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "SStateMarketTerminal-Learning-Worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: env.LEARNING_GITHUB_BRANCH || "main",
      inputs: { run_id: runId },
    }),
  });
  if (!gh.ok) {
    const text = await gh.text();
    const failed = { ...initial, status: "FAILED", message: `GitHub learning dispatch ${gh.status}: ${text}`, updated_at: new Date().toISOString() };
    await Promise.all([
      env.JSON_BUCKET.put("learning/latest/status.json", JSON.stringify(failed, null, 2), metadata),
      env.JSON_BUCKET.put(`learning/runs/${runId}/status.json`, JSON.stringify(failed, null, 2), metadata),
    ]);
    throw httpError(502, `Daily learning workflow_dispatch 失敗：${gh.status}`);
  }
  let dispatch = null;
  try { dispatch = await gh.json(); } catch (_) {}
  const queued = {
    ...initial,
    github_run_id: dispatch?.workflow_run_id || null,
    github_run_url: dispatch?.html_url || null,
    updated_at: new Date().toISOString(),
  };
  await Promise.all([
    env.JSON_BUCKET.put("learning/latest/status.json", JSON.stringify(queued, null, 2), metadata),
    env.JSON_BUCKET.put(`learning/runs/${runId}/status.json`, JSON.stringify(queued, null, 2), metadata),
  ]);
  return { ok: true, ...queued };
}

async function ensureChallenger(env, suppliedLatest = null) {
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
  const currentObj = await env.JSON_BUCKET.get("models/challenger/current.json");
  if (currentObj) return JSON.parse(await currentObj.text());

  let latest = suppliedLatest;
  if (!latest) {
    const latestObj = await env.JSON_BUCKET.get("models/candidates/latest.json");
    if (!latestObj) return null;
    latest = JSON.parse(await latestObj.text());
  }
  const modelId = safeModelId(latest.model_id);
  const challenger = {
    model_id: modelId,
    candidate_key: latest.candidate_key || `models/candidates/${modelId}/probability_model.json`,
    generated_at: latest.generated_at || null,
    assigned_at: new Date().toISOString(),
    status: "SHADOW_EVALUATION",
    policy: "Evaluate only future settled OOS cases after challenger generated_at; active model remains unchanged until promotion gate passes."
  };
  await Promise.all([
    env.JSON_BUCKET.put("models/challenger/current.json", JSON.stringify(challenger, null, 2), metadata),
    env.JSON_BUCKET.put(`models/candidates/${modelId}/status.json`, JSON.stringify(challenger, null, 2), metadata),
  ]);
  return challenger;
}

async function promoteChallenger(env, modelId) {
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
  const currentObj = await env.JSON_BUCKET.get("models/challenger/current.json");
  if (!currentObj) throw httpError(409, "no current challenger");
  const current = JSON.parse(await currentObj.text());
  if (current.model_id !== modelId) throw httpError(409, "requested model is not current challenger");

  const evalObj = await env.JSON_BUCKET.get(`models/candidates/${modelId}/evaluation.json`);
  if (!evalObj) throw httpError(409, "challenger evaluation missing");
  const evaluation = JSON.parse(await evalObj.text());
  if (evaluation.decision !== "PROMOTE") throw httpError(409, `evaluation decision is ${evaluation.decision}, not PROMOTE`);

  const candidateObj = await env.JSON_BUCKET.get(current.candidate_key);
  if (!candidateObj) throw httpError(404, "challenger model object missing");
  const candidateText = await candidateObj.text();
  const candidate = JSON.parse(candidateText);

  const activeObj = await env.JSON_BUCKET.get("models/active/probability_model.json");
  let oldModelId = null;
  if (activeObj) {
    const activeText = await activeObj.text();
    const active = JSON.parse(activeText);
    oldModelId = safeModelId(active.model_id);
    await env.JSON_BUCKET.put(`models/archive/${oldModelId}/probability_model.json`, activeText, metadata);
  }

  const promotedAt = new Date().toISOString();
  const activeManifest = {
    model_id: modelId,
    previous_model_id: oldModelId,
    promoted_at: promotedAt,
    source_candidate_key: current.candidate_key,
    evaluation_key: `models/candidates/${modelId}/evaluation.json`,
    status: "ACTIVE_CHAMPION"
  };
  const candidateStatus = { ...current, status: "PROMOTED", promoted_at: promotedAt, previous_model_id: oldModelId };
  await Promise.all([
    env.JSON_BUCKET.put("models/active/probability_model.json", candidateText, metadata),
    env.JSON_BUCKET.put("models/active/manifest.json", JSON.stringify(activeManifest, null, 2), metadata),
    env.JSON_BUCKET.put(`models/candidates/${modelId}/status.json`, JSON.stringify(candidateStatus, null, 2), metadata),
  ]);
  await env.JSON_BUCKET.delete("models/challenger/current.json");
  await assignLatestIfDifferent(env, modelId);
  return { promoted_model_id: modelId, previous_model_id: oldModelId, active_manifest: activeManifest };
}

async function rejectChallenger(env, modelId) {
  const metadata = { httpMetadata: { contentType: "application/json; charset=utf-8" } };
  const currentObj = await env.JSON_BUCKET.get("models/challenger/current.json");
  if (!currentObj) throw httpError(409, "no current challenger");
  const current = JSON.parse(await currentObj.text());
  if (current.model_id !== modelId) throw httpError(409, "requested model is not current challenger");
  const evalObj = await env.JSON_BUCKET.get(`models/candidates/${modelId}/evaluation.json`);
  if (!evalObj) throw httpError(409, "challenger evaluation missing");
  const evaluation = JSON.parse(await evalObj.text());
  if (evaluation.decision !== "REJECT") throw httpError(409, `evaluation decision is ${evaluation.decision}, not REJECT`);
  const rejectedAt = new Date().toISOString();
  const status = { ...current, status: "REJECTED", rejected_at: rejectedAt, evaluation_key: `models/candidates/${modelId}/evaluation.json` };
  await env.JSON_BUCKET.put(`models/candidates/${modelId}/status.json`, JSON.stringify(status, null, 2), metadata);
  await env.JSON_BUCKET.delete("models/challenger/current.json");
  await assignLatestIfDifferent(env, modelId);
  return { rejected_model_id: modelId };
}

async function assignLatestIfDifferent(env, excludedModelId) {
  const latestObj = await env.JSON_BUCKET.get("models/candidates/latest.json");
  if (!latestObj) return null;
  const latest = JSON.parse(await latestObj.text());
  if (!latest?.model_id || latest.model_id === excludedModelId) return null;
  return await ensureChallenger(env, latest);
}

async function objectResponse(env, key, origin, download, filename) {
  const obj = await env.JSON_BUCKET.get(key);
  if (!obj) return json({ error: "object_not_found", key }, 404, origin);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("ETag", obj.httpEtag);
  if (download) headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  applyCors(headers, origin);
  return new Response(obj.body, { status: 200, headers });
}
function normalizeMarket(v){ const x=String(v||"crypto"); if(!MARKET[x]) throw httpError(400,"market 必須是 crypto 或 us-stock"); return x; }
function safeRunId(v){ const x=String(v||""); if(!/^[A-Za-z0-9_-]{8,100}$/.test(x)) throw httpError(400,"invalid run_id"); return x; }
function safeModelId(v){ const x=String(v||""); if(!/^[A-Za-z0-9_-]{8,100}$/.test(x)) throw httpError(400,"invalid model_id"); return x; }
function requireInternal(request, env){ const auth=request.headers.get("Authorization")||""; if(!env.CALLBACK_TOKEN || auth!==`Bearer ${env.CALLBACK_TOKEN}`) throw httpError(401,"unauthorized"); }
function httpError(status,message){ const e=new Error(message); e.status=status; return e; }
function json(value,status,origin){ const headers=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}); applyCors(headers,origin); return new Response(JSON.stringify(value,null,2),{status,headers}); }
function cors(response,origin){ const h=new Headers(response.headers); applyCors(h,origin); return new Response(response.body,{status:response.status,headers:h}); }
function applyCors(headers,origin){ headers.set("Access-Control-Allow-Origin",origin); headers.set("Access-Control-Allow-Methods","GET,POST,PUT,OPTIONS"); headers.set("Access-Control-Allow-Headers","Content-Type,Authorization"); headers.set("Vary","Origin"); }
