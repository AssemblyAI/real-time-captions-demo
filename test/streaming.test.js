const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

function runScript(name, globals) {
  const filename = join(__dirname, '..', 'js', name);
  runInNewContext(readFileSync(filename, 'utf8'), globals, { filename });
}

async function requestToken(post, apiKey = 'test-key') {
  let handler;
  let result;
  const response = {
    statusCode: 200,
    set(name, value) { this[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { result = JSON.parse(JSON.stringify(value)); },
  };
  const express = () => ({
    use() {},
    listen() {},
    get(path, route) { assert.equal(path, '/'); handler = route; },
  });
  express.json = () => {};
  const modules = { express, axios: { post }, cors: () => {}, dotenv: { config() {} } };
  runScript('server.js', { require: name => modules[name], process: { env: { API_KEY: apiKey } } });
  await handler({}, response);
  return { status: response.statusCode, cache: response['Cache-Control'], body: result };
}

test('token route uses the streaming token request and returns only a temporary token', async () => {
  let requested;
  const result = await requestToken(async (url, body, options) => {
    requested = { url, body: JSON.stringify(body), auth: options.headers.authorization, timeout: options.timeout };
    if (url === 'https://api.assemblyai.com/v2/realtime/token') {
      throw { response: { status: 410, data: { error: 'Model deprecated.' } } };
    }
    return { data: { token: 'short-lived', expires_in_seconds: 60 } };
  });
  assert.deepEqual(requested, {
    url: 'https://token.assemblyai.com/v1/token',
    body: '{"product":"streaming","expires_in_seconds":60}',
    auth: 'test-key',
    timeout: 10_000,
  });
  assert.deepEqual(result, { status: 200, cache: 'no-store', body: { token: 'short-lived' } });
});

test('token route handles missing keys, rejected requests and malformed success responses', async () => {
  const cases = [
    [500, () => assert.fail('must not call upstream without a key'), ''],
    [401, () => { throw { response: { status: 401 } }; }],
    [502, () => { throw new Error('connection refused'); }],
    [502, () => ({ data: {} })],
  ];
  for (const [status, post, key] of cases) {
    const response = await requestToken(post, key);
    assert.equal(response.status, status);
    assert.ok(response.body.error);
  }
});

function browser({ fetchToken, capture } = {}) {
  const start = { disabled: false };
  const stop = { disabled: true };
  const captions = { style: {} };
  const video = {};
  const alerts = [];
  const sockets = [];
  const worklets = [];
  const contexts = [];
  const timers = new Set();
  const tracks = [0, 0].map(() => ({ stop() { this.stopped = true; } }));
  const stream = { getTracks: () => tracks };
  const elements = { 'btn-start-recording': start, 'btn-stop-recording': stop, captions };
  const window = { location: { hostname: 'localhost' }, addEventListener() {} };

  class Socket {
    static OPEN = 1;
    static CLOSING = 2;
    constructor(url) {
      this.url = new URL(url);
      this.readyState = 0;
      this.messages = [];
      sockets.push(this);
    }
    send(message) { this.messages.push(message); }
    close() { this.readyState = 3; }
    receive(message) { this.onmessage({ data: JSON.stringify(message) }); }
  }

  class AudioContext {
    constructor(options) {
      assert.equal(options.sampleRate, 16000);
      this.destination = {};
      this.audioWorklet = { addModule: async name => assert.equal(name, './js/pcm-encoder.js') };
      contexts.push(this);
    }
    async resume() {}
    async close() { this.closed = true; }
    createMediaStreamSource(value) {
      assert.equal(value, stream);
      return { connect: target => assert.equal(target, worklets.at(-1)) };
    }
  }

  class Worklet {
    constructor(context, name, options) {
      assert.equal(name, 'pcm-encoder');
      assert.equal(options.channelCount, 1);
      assert.equal(options.channelCountMode, 'explicit');
      this.port = {};
      this.context = context;
      worklets.push(this);
    }
    connect(target) { assert.equal(target, this.context.destination); }
  }

  runScript('index.js', {
    document: { querySelector: () => video, getElementById: id => elements[id] },
    navigator: { mediaDevices: { getUserMedia: capture ?? (async () => stream) } },
    window,
    WebSocket: Socket,
    AudioContext,
    AudioWorkletNode: Worklet,
    AbortController,
    URLSearchParams,
    fetch: async (url, options) => {
      assert.equal(url, 'http://localhost:8000/');
      if (fetchToken) return fetchToken(options.signal);
      return { ok: true, json: async () => ({ token: 'a+b/& c' }) };
    },
    setTimeout: callback => { timers.add(callback); return callback; },
    clearTimeout: callback => timers.delete(callback),
    alert: message => alerts.push(message),
  });
  return { start, stop, video, captions, alerts, sockets, worklets, contexts, timers, tracks, stream };
}

test('browser opens the v3 socket, streams binary after Begin and replaces partial captions', async () => {
  const app = browser();
  await app.start.onclick();
  const [socket] = app.sockets;
  assert.equal(socket.url.origin, 'wss://streaming.assemblyai.com');
  assert.equal(socket.url.pathname, '/v3/ws');
  assert.deepEqual(Object.fromEntries(socket.url.searchParams), {
    sample_rate: '16000', encoding: 'pcm_s16le', speech_model: 'assemblyai-stt-3-7-realtime', token: 'a+b/& c',
  });
  assert.equal(app.worklets.length, 0);
  socket.readyState = 1;
  socket.receive({ type: 'Begin' });
  assert.equal(app.video.srcObject, app.stream);
  assert.equal(app.video.muted, true);
  const pcm = new ArrayBuffer(3200);
  app.worklets[0].port.onmessage({ data: pcm });
  assert.equal(socket.messages[0], pcm);
  socket.receive({ type: 'Turn', turn_order: 0, end_of_turn: false, transcript: 'The cat' });
  assert.equal(app.captions.innerText, 'The cat');
  socket.receive({ type: 'Turn', turn_order: 0, end_of_turn: false, transcript: 'The cap fell' });
  assert.equal(app.captions.innerText, 'The cap fell');
  socket.receive({ type: 'SpeechStarted' });
  assert.equal(app.captions.innerText, 'The cap fell');

  app.stop.onclick();
  app.stop.onclick();
  assert.deepEqual(socket.messages.slice(1), ['{"type":"Terminate"}']);
  assert.equal(socket.readyState, 1);
  assert.ok(app.tracks.every(track => track.stopped));
  assert.ok(app.contexts[0].closed);
  app.worklets[0].port.onmessage({ data: pcm });
  assert.equal(socket.messages.length, 2);
  socket.receive({ type: 'Turn', turn_order: 0, end_of_turn: true, transcript: 'The cap fell down.' });
  socket.receive({ type: 'Termination' });
  assert.equal(app.captions.innerText, 'The cap fell down.');
  assert.equal(socket.readyState, 3);
  assert.equal(app.video.srcObject, null);
  assert.equal(app.start.disabled, false);
  assert.equal(app.timers.size, 0);
});

test('stopping during the permission prompt releases tracks that arrive late', async () => {
  let grant;
  const app = browser({ capture: () => new Promise(resolve => { grant = resolve; }) });
  const starting = app.start.onclick();
  app.stop.onclick();
  grant(app.stream);
  await starting;
  assert.equal(app.sockets.length, 0);
  assert.ok(app.tracks.every(track => track.stopped));
  assert.ok(app.contexts[0].closed);
  assert.equal(app.start.disabled, false);
});

test('permission and token failures release resources and allow retry', async () => {
  const denied = browser({ capture: async () => { throw new Error('Permission denied'); } });
  await denied.start.onclick();
  assert.match(denied.alerts[0], /Permission denied/);
  assert.ok(denied.contexts[0].closed);
  assert.equal(denied.start.disabled, false);

  const rejected = browser({ fetchToken: async () => ({ ok: false, json: async () => ({ error: 'token failed' }) }) });
  await rejected.start.onclick();
  assert.match(rejected.alerts[0], /token failed/);
  assert.ok(rejected.tracks.every(track => track.stopped));
  assert.equal(rejected.sockets.length, 0);
  assert.equal(rejected.start.disabled, false);
});

test('remote disconnect and a missing termination reply both return to idle', async () => {
  for (const disconnect of [true, false]) {
    const app = browser();
    await app.start.onclick();
    const [socket] = app.sockets;
    socket.readyState = 1;
    socket.receive({ type: 'Begin' });
    if (disconnect) {
      socket.readyState = 3;
      socket.onclose();
      assert.match(app.alerts[0], /closed/);
    } else {
      app.stop.onclick();
      [...app.timers][0]();
      assert.equal(socket.readyState, 3);
    }
    assert.equal(app.start.disabled, false);
    assert.ok(app.tracks.every(track => track.stopped));
    assert.equal(app.timers.size, 0);
  }
});

test('audio worklet batches raw little-endian PCM with no headers', () => {
  let Encoder;
  const frames = [];
  runScript('pcm-encoder.js', {
    sampleRate: 16000,
    AudioWorkletProcessor: class {
      port = { postMessage: frame => frames.push(frame) };
    },
    registerProcessor: (name, processor) => { assert.equal(name, 'pcm-encoder'); Encoder = processor; },
  });
  const encoder = new Encoder();
  const firstHalf = new Float32Array(800);
  firstHalf.set([-2, -0.5, 0, 0.5, 2]);
  encoder.process([[firstHalf]]);
  assert.equal(frames.length, 0);
  encoder.process([[new Float32Array(2400)]]);
  assert.deepEqual(frames.map(frame => frame.byteLength), [3200, 3200]);
  const view = new DataView(frames[0]);
  assert.deepEqual([0, 2, 4, 6, 8].map(offset => view.getInt16(offset, true)), [-32768, -16384, 0, 16383, 32767]);
});
